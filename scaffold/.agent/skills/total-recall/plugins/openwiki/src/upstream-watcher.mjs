/**
 * OpenWiki Upstream Watcher & Fleet Propagation Engine
 *
 * Monitors the open-source OpenWiki package (langchain-ai/openwiki on GitHub & npm),
 * detects new releases, announces updates via operator alerts, and coordinates
 * fleet-wide documentation regeneration across registered user repositories.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { compareSemanticVersions, formatPropagationReceipt } from '../capability/index.mjs';
import { hasWiki, readProjects, refreshProject, resolveKey } from './refresh.mjs';

export const UPSTREAM_NPM_URL = 'https://registry.npmjs.org/openwiki/latest';
export const UPSTREAM_GITHUB_URL = 'https://api.github.com/repos/langchain-ai/openwiki/releases/latest';

/**
 * Resolves the path to the persistent upstream state file.
 * @param {string} [home] Home directory override
 * @returns {string}
 */
export function stateFile(home = os.homedir()) {
  if (process.env.TR_PLUGIN_STATE_DIR) {
    return path.join(process.env.TR_PLUGIN_STATE_DIR, 'openwiki-upstream.json');
  }
  return path.join(home, '.agent', 'skills', 'total-recall', 'config', 'openwiki-upstream.json');
}

/**
 * Reads persistent upstream release state.
 * @param {object} options
 * @param {string} [options.statePath] Custom state path
 * @returns {{ currentRecordedVersion: string, latestKnownVersion: string, lastCheckedAt: string | null, announcements: Array<object> }}
 */
export function readUpstreamState({ statePath = stateFile() } = {}) {
  try {
    const raw = fs.readFileSync(statePath, 'utf8');
    const parsed = JSON.parse(raw);
    return {
      currentRecordedVersion: typeof parsed.currentRecordedVersion === 'string' ? parsed.currentRecordedVersion : '0.7.2',
      latestKnownVersion: typeof parsed.latestKnownVersion === 'string' ? parsed.latestKnownVersion : '0.7.2',
      lastCheckedAt: typeof parsed.lastCheckedAt === 'string' ? parsed.lastCheckedAt : null,
      lastPropagatedAt: typeof parsed.lastPropagatedAt === 'string' ? parsed.lastPropagatedAt : null,
      announcements: Array.isArray(parsed.announcements) ? parsed.announcements : []
    };
  } catch {
    return {
      currentRecordedVersion: '0.7.2',
      latestKnownVersion: '0.7.2',
      lastCheckedAt: null,
      lastPropagatedAt: null,
      announcements: []
    };
  }
}

/**
 * Saves upstream release state atomically.
 * @param {object} state State data object
 * @param {object} options
 * @param {string} [options.statePath] Custom state path
 */
export function saveUpstreamState(state = {}, { statePath = stateFile() } = {}) {
  const dir = path.dirname(statePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  const payload = {
    currentRecordedVersion: state.currentRecordedVersion || '0.7.2',
    latestKnownVersion: state.latestKnownVersion || '0.7.2',
    lastCheckedAt: state.lastCheckedAt || new Date().toISOString(),
    lastPropagatedAt: state.lastPropagatedAt || null,
    announcements: Array.isArray(state.announcements) ? state.announcements.slice(-20) : []
  };
  const tempPath = `${statePath}.${process.pid}.tmp`;
  fs.writeFileSync(tempPath, JSON.stringify(payload, null, 2), 'utf8');
  fs.renameSync(tempPath, statePath);
}

/**
 * Queries the latest published OpenWiki release from npm registry or GitHub.
 * @param {object} options
 * @param {typeof fetch} [options.fetch=globalThis.fetch] Fetch implementation
 * @param {number} [options.timeoutMs=8000] Network timeout in milliseconds
 * @param {string} [options.npmUrl] npm registry URL override
 * @param {string} [options.githubUrl] GitHub release API URL override
 * @returns {Promise<{ ok: boolean, version?: string, publishedAt?: string, releaseNotesUrl?: string, source?: string, error?: string }>}
 */
export async function fetchUpstreamRelease({
  fetch = globalThis.fetch,
  timeoutMs = 8000,
  npmUrl = UPSTREAM_NPM_URL,
  githubUrl = UPSTREAM_GITHUB_URL
} = {}) {
  // Strategy 1: npm registry endpoint
  try {
    const res = await fetch(npmUrl, {
      signal: AbortSignal.timeout(timeoutMs),
      headers: { accept: 'application/json' }
    });
    if (res.ok) {
      const data = await res.json();
      if (data?.version) {
        return {
          ok: true,
          source: 'npm',
          version: data.version,
          publishedAt: data.dist?.time || new Date().toISOString(),
          releaseNotesUrl: data.bugs?.url ? data.bugs.url.replace(/\/issues$/, '') : 'https://github.com/langchain-ai/openwiki',
          description: data.description || ''
        };
      }
    }
  } catch {
    // Registry query failed, fall back to repository releases
  }

  // Strategy 2: GitHub Releases API
  try {
    const res = await fetch(githubUrl, {
      signal: AbortSignal.timeout(timeoutMs),
      headers: {
        accept: 'application/vnd.github.v3+json',
        'User-Agent': 'total-recall-openwiki-watcher'
      }
    });
    if (res.ok) {
      const data = await res.json();
      const rawTag = data.tag_name || data.name || '';
      const version = rawTag.replace(/^v/, '').trim();
      if (version) {
        return {
          ok: true,
          source: 'github',
          version,
          publishedAt: data.published_at || new Date().toISOString(),
          releaseNotesUrl: data.html_url || 'https://github.com/langchain-ai/openwiki',
          description: data.body || ''
        };
      }
    }
  } catch {
    // Both network queries exhausted
  }

  return {
    ok: false,
    error: 'Failed to retrieve release from upstream registries'
  };
}

/**
 * Checks upstream status and computes version increment delta.
 * @param {object} options
 * @param {typeof fetch} [options.fetch] Fetch implementation
 * @param {string} [options.statePath] Custom state path
 * @returns {Promise<{ ok: boolean, updateAvailable: boolean, currentVersion: string, latestVersion: string, publishedAt: string | null, releaseNotesUrl: string | null, error?: string }>}
 */
export async function checkUpstreamStatus({
  fetch = globalThis.fetch,
  statePath = stateFile()
} = {}) {
  const state = readUpstreamState({ statePath });
  const release = await fetchUpstreamRelease({ fetch });

  if (!release.ok || !release.version) {
    return {
      ok: false,
      updateAvailable: false,
      currentVersion: state.currentRecordedVersion,
      latestVersion: state.latestKnownVersion,
      publishedAt: null,
      releaseNotesUrl: null,
      error: release.error || 'Upstream release check failed'
    };
  }

  const updateAvailable = compareSemanticVersions(release.version, state.currentRecordedVersion) > 0;

  // Persist check time and latest known version
  saveUpstreamState({
    ...state,
    latestKnownVersion: release.version,
    lastCheckedAt: new Date().toISOString()
  }, { statePath });

  return {
    ok: true,
    updateAvailable,
    currentVersion: state.currentRecordedVersion,
    latestVersion: release.version,
    publishedAt: release.publishedAt || null,
    releaseNotesUrl: release.releaseNotesUrl || null
  };
}

/**
 * Dispatches an operator announcement when a new upstream release is detected.
 * @param {object} options
 * @param {string} options.latestVersion Discovered version string
 * @param {string} options.currentVersion Active version string
 * @param {string} [options.releaseNotesUrl] Optional release notes link
 * @param {boolean} [options.dryRun=false] When true, skips alert dispatch
 * @param {Function} [options.alertDispatcher] Alert-owner receipt transport
 * @param {typeof spawnSync} [options.run] Alert-owner process transport
 * @param {string} [options.statePath] Custom state path
 * @returns {Promise<object>} Announcement outcome; accepted is not delivery proof
 */
export async function announceNewVersion({
  latestVersion,
  currentVersion,
  releaseNotesUrl = 'https://github.com/langchain-ai/openwiki',
  dryRun = false,
  alertDispatcher,
  run = spawnSync,
  statePath = stateFile()
} = {}) {
  const title = `OpenWiki Update: v${latestVersion} Available`;
  const message = `Upstream OpenWiki published v${latestVersion}. The installed release is v${currentVersion}.`;
  const eventId = `openwiki-release-${latestVersion}`;

  if (dryRun) return { ok: true, announced: false, dryRun: true, title, message };

  try {
    let results;
    if (typeof alertDispatcher === 'function') {
      results = await alertDispatcher({ title, message, source: 'openwiki', severity: 'info', eventId });
    } else {
      const result = run('total-recall', [
        'alerts', 'send', '--title', title, '--message', message,
        '--source', 'openwiki', '--severity', 'info', '--event-id', eventId
      ], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 15000, maxBuffer: 1024 * 1024 });
      if (result.error || result.signal || result.status !== 0) {
        throw new Error(`Alert owner failed (${result.error?.code || result.signal || `exit ${result.status}`})`);
      }
      try { results = JSON.parse(result.stdout); }
      catch { throw new Error('Alert owner returned an invalid JSON receipt'); }
    }

    if (!Array.isArray(results) || results.length === 0 ||
        results.some((result) => !result || result.event_id !== eventId || !result.channel ||
          !(result.status === 'duplicate' || (result.status === 'accepted' && result.accepted === true)))) {
      throw new Error('Alert owner did not accept every requested channel');
    }
    const receipts = results.map(({ channel, status, event_id, at }) => ({ channel, status, event_id, at }));
    const state = readUpstreamState({ statePath });
    if (!state.announcements.some(announcement => announcement.version === latestVersion)) {
      state.announcements.push({ version: latestVersion, announcedAt: new Date().toISOString(), releaseNotesUrl, receipts });
      saveUpstreamState(state, { statePath });
    }
    return { ok: true, announced: receipts.some(receipt => receipt.status === 'accepted'), title, message, receipts };
  } catch (error) {
    return { ok: false, announced: false, title, message, error: error.message };
  }
}

/** Keep upstream observation, announcement and propagation as separate outcomes. */
export async function watchUpstream({
  checkOnly = false,
  announce = true,
  propagate = false,
  statusChecker = checkUpstreamStatus,
  announcer = announceNewVersion,
  propagator = propagateUpdates,
} = {}) {
  let status, announcement = null, propagation = null;
  try { status = await statusChecker(); }
  catch (error) { status = { ok: false, updateAvailable: false, error: error.message }; }

  if (!checkOnly && status.ok && status.updateAvailable) {
    if (announce) {
      try {
        announcement = await announcer({
          latestVersion: status.latestVersion,
          currentVersion: status.currentVersion,
          releaseNotesUrl: status.releaseNotesUrl,
        });
      } catch (error) {
        announcement = { ok: false, announced: false, error: error.message };
      }
    }
    if (propagate) {
      try { propagation = await propagator({ force: true }); }
      catch (error) { propagation = { ok: false, updatedCount: 0, error: error.message }; }
    }
  }
  return {
    ok: status.ok === true && (!announce || checkOnly || !status.updateAvailable || announcement?.ok === true) &&
      (!propagate || checkOnly || !status.updateAvailable || propagation?.ok === true),
    status, announcement, propagation,
  };
}

/**
 * Propagates updated OpenWiki generator execution across registered user repositories.
 * @param {object} options
 * @param {string} [options.repo] Filter to a specific repository name
 * @param {boolean} [options.force=false] Force regeneration even if not due
 * @param {boolean} [options.dryRun=false] Preview actions without executing updates
 * @param {string} [options.statePath] Custom state path
 * @param {typeof readProjects} [options.projectsReader=readProjects] Projects reader stub
 * @param {typeof refreshProject} [options.refresher=refreshProject] Project refresher stub
 * @param {typeof resolveKey} [options.keyResolver=resolveKey] Credential resolver stub
 * @returns {Promise<object>}
 */
export async function propagateUpdates({
  repo = null,
  force = false,
  dryRun = false,
  statePath = stateFile(),
  projectsReader = readProjects,
  refresher = refreshProject,
  keyResolver = resolveKey
} = {}) {
  let projects;
  try {
    projects = await projectsReader();
  } catch (err) {
    return { ok: false, error: err.message, updatedCount: 0, reports: [] };
  }

  if (repo) {
    projects = projects.filter(p => p.name === repo || p.root === repo);
    if (!projects.length) {
      return { ok: false, error: `No registered project matches ${repo}`, eligibleCount: 0, updatedCount: 0, reports: [] };
    }
  }

  // Filter to repositories with existing openwiki directories
  const eligible = projects.filter(p => hasWiki(p.root));
  if (eligible.length === 0) {
    return {
      ok: true,
      eligibleCount: 0,
      updatedCount: 0,
      reports: [],
      message: 'No registered user repositories carry openwiki documentation'
    };
  }

  const state = readUpstreamState({ statePath });
  const targetVersion = state.latestKnownVersion || '0.7.3';

  if (dryRun) {
    const planned = eligible.map(p => ({
      name: p.name,
      root: p.root,
      action: 'planned',
      targetVersion
    }));
    return {
      ok: true,
      dryRun: true,
      eligibleCount: eligible.length,
      updatedCount: 0,
      targetVersion,
      reports: planned
    };
  }

  let key, from;
  try {
    ({ key, from } = await keyResolver());
    if (!key) throw new Error('No model credential available from the Auth owner');
  } catch (error) {
    return { ok: false, error: error.message, eligibleCount: eligible.length, updatedCount: 0, reports: [] };
  }
  const reports = [];

  for (const project of eligible) {
    try {
      const outcome = await refresher(project, {
        key,
        force,
        targetVersion
      });
      reports.push({
        ...project,
        ...outcome,
        credential: from,
        generatorVersion: targetVersion
      });
    } catch (err) {
      reports.push({
        name: project.name,
        root: project.root,
        action: 'failed',
        reason: err.message,
        generatorVersion: targetVersion
      });
    }
  }

  const failedCount = reports.filter(r => r.action === 'failed').length;
  const partialCount = reports.filter(r => r.action === 'partial').length;
  const updatedCount = reports.filter(r => r.action === 'refreshed' || r.action === 'initialized').length;
  const incompleteCount = reports.length - failedCount - partialCount - updatedCount;

  const receipt = formatPropagationReceipt({
    previousVersion: state.currentRecordedVersion,
    newVersion: targetVersion,
    totalProjects: eligible.length,
    updatedProjects: updatedCount,
    failedProjects: failedCount + partialCount + incompleteCount,
    ok: updatedCount === eligible.length
  });

  if (receipt.ok) {
    saveUpstreamState({
      ...readUpstreamState({ statePath }),
      currentRecordedVersion: targetVersion,
      lastPropagatedAt: receipt.timestamp
    }, { statePath });
  }

  return {
    ok: receipt.ok,
    receipt,
    eligibleCount: eligible.length,
    updatedCount,
    failedCount,
    partialCount,
    incompleteCount,
    reports
  };
}
