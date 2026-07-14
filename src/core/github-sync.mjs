/**
 * GitHub Sync — pushes memory-vault/ to a remote git repository.
 *
 * Auth: reads `github_token` from the secrets store.
 * Transport: git CLI via execFileSync.
 * Scope: only syncs memory-vault/, not the full .agent/ directory.
 * State: tracked in {brainDir}/.github-sync-state.json
 */

import fs from 'fs';
import path from 'path';
import { execFileSync } from 'child_process';
import { getSecret } from './secrets-store.mjs';
import { logger } from './logger.mjs';
import { addTask, resolveQueueDir } from './task-envelope.mjs';

const STATE_FILE_NAME = '.github-sync-state.json';
const DEFAULT_BRANCH = 'main';

// ─── State helpers ────────────────────────────────────────────────────────────

function stateFilePath(brainDir) {
  return path.join(brainDir, STATE_FILE_NAME);
}

function readState(brainDir) {
  const p = stateFilePath(brainDir);
  if (!fs.existsSync(p)) return null;
  try {
    return JSON.parse(fs.readFileSync(p, 'utf8'));
  } catch {
    return null;
  }
}

function writeState(brainDir, patch) {
  const p = stateFilePath(brainDir);
  const prev = readState(brainDir) || {};
  const next = { ...prev, ...patch, updatedAt: new Date().toISOString() };
  fs.writeFileSync(p, JSON.stringify(next, null, 2) + '\n');
  return next;
}

// ─── Git helpers ──────────────────────────────────────────────────────────────

/**
 * Run a git command inside dir.
 * @param {string} dir
 * @param {string[]} args
 * @param {{ env?: object }} [opts]
 * @returns {string} stdout (trimmed)
 */
function git(dir, args, opts = {}) {
  return execFileSync('git', args, {
    cwd: dir,
    encoding: 'utf8',
    env: { ...process.env, ...(opts.env || {}) },
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();
}

/**
 * Inject the token into a GitHub HTTPS remote URL so git push/pull
 * can authenticate without a credential helper.
 *
 * @param {string} remoteUrl  e.g. https://github.com/owner/repo.git
 * @param {string} token
 * @returns {string}
 */
function injectToken(remoteUrl, token) {
  try {
    const u = new URL(remoteUrl);
    u.username = token;
    u.password = 'x-oauth-basic';
    return u.toString();
  } catch {
    // Not a valid URL — return as-is and let git surface the error.
    return remoteUrl;
  }
}

// ─── Conflict task helper ─────────────────────────────────────────────────────

function surfaceConflictTask(brainDir, vaultDir, message) {
  try {
    const queueDir = resolveQueueDir(brainDir);
    addTask(
      {
        intent: `GitHub Sync conflict detected in memory-vault: ${message}`,
        kind: 'system',
        priority: 'high',
        payload: { vaultDir, conflict_message: message },
        origin: { agent: 'github-sync' },
      },
      queueDir,
    );
    logger.warn({ subsystem: 'github-sync', message: `Conflict task enqueued: ${message}` });
  } catch (err) {
    logger.error({ subsystem: 'github-sync', message: `Failed to create conflict task: ${err.message}` });
  }
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Initialize the vault directory as a git repository pointing at remoteUrl.
 *
 * @param {{ brainDir: string, vaultDir: string, remoteUrl: string, token?: string }} options
 * @returns {Promise<{ success: boolean, message: string }>}
 */
export async function initGitHubSync({ brainDir, vaultDir, remoteUrl, token }) {
  if (!remoteUrl) {
    return { success: false, message: 'remoteUrl is required for initGitHubSync.' };
  }

  // Resolve token: explicit arg → secrets store
  let resolvedToken = token;
  if (!resolvedToken) {
    try {
      const result = await getSecret(brainDir, 'github_token');
      if (result.found) resolvedToken = result.value;
    } catch {
      // Proceed without token — user may be using SSH or credential helper.
    }
  }

  try {
    if (!fs.existsSync(vaultDir)) {
      fs.mkdirSync(vaultDir, { recursive: true });
    }

    // Init if not already a git repo
    if (!fs.existsSync(path.join(vaultDir, '.git'))) {
      git(vaultDir, ['init', '-b', DEFAULT_BRANCH]);
    }

    // Set/update remote
    let hasRemote = false;
    try {
      git(vaultDir, ['remote', 'get-url', 'origin']);
      hasRemote = true;
    } catch {
      hasRemote = false;
    }

    if (hasRemote) {
      git(vaultDir, ['remote', 'set-url', 'origin', remoteUrl]);
    } else {
      git(vaultDir, ['remote', 'add', 'origin', remoteUrl]);
    }

    writeState(brainDir, {
      remoteUrl,
      branch: DEFAULT_BRANCH,
      initialized: true,
      initAt: new Date().toISOString(),
    });

    logger.info({ subsystem: 'github-sync', message: `Initialized git sync to ${remoteUrl}` });
    return { success: true, message: `GitHub sync initialized → ${remoteUrl}` };
  } catch (err) {
    logger.error({ subsystem: 'github-sync', message: `initGitHubSync failed: ${err.message}` });
    return { success: false, message: err.message };
  }
}

/**
 * Run one sync cycle: pull → stage → commit (if changed) → push.
 *
 * @param {{ brainDir: string, vaultDir: string }} options
 * @returns {Promise<{ success: boolean, pushed: boolean, pulled: boolean, conflicts: boolean, message: string }>}
 */
export async function runGitHubSync({ brainDir, vaultDir }) {
  const state = readState(brainDir);

  // Check remote is configured
  let remoteUrl;
  try {
    remoteUrl = git(vaultDir, ['remote', 'get-url', 'origin']);
  } catch {
    return {
      success: false,
      pushed: false,
      pulled: false,
      conflicts: false,
      message: 'No remote configured. Run initGitHubSync first.',
    };
  }

  const branch = state?.branch || DEFAULT_BRANCH;

  // Resolve token
  let token;
  try {
    const result = await getSecret(brainDir, 'github_token');
    if (result.found) token = result.value;
  } catch {
    // SSH or credential-helper auth
  }

  const authedUrl = token ? injectToken(remoteUrl, token) : remoteUrl;

  let pulled = false;
  let pushed = false;
  let conflicts = false;

  // ── Pull ──────────────────────────────────────────────────────────────────
  try {
    // Configure credentials via inprocess URL
    if (token) {
      git(vaultDir, ['remote', 'set-url', 'origin', authedUrl]);
    }
    git(vaultDir, ['pull', '--ff-only', 'origin', branch]);
    pulled = true;
  } catch (pullErr) {
    const msg = pullErr.message || '';
    const isDiverged =
      msg.includes('diverged') ||
      msg.includes('non-fast-forward') ||
      msg.includes('CONFLICT') ||
      msg.includes('fatal: Not possible to fast-forward');

    if (isDiverged) {
      conflicts = true;
      surfaceConflictTask(
        brainDir,
        vaultDir,
        `git pull --ff-only failed on branch "${branch}": ${msg.slice(0, 200)}`,
      );
      return {
        success: false,
        pushed: false,
        pulled: false,
        conflicts: true,
        message: `Diverged remote detected. Manual merge required. Details: ${msg.slice(0, 200)}`,
      };
    }

    // Tolerate "no upstream" (first push scenario)
    if (!msg.includes('no tracking information') && !msg.includes("couldn't find remote ref")) {
      logger.warn({ subsystem: 'github-sync', message: `git pull warning: ${msg.slice(0, 300)}` });
    }
  }

  // ── Stage & commit ────────────────────────────────────────────────────────
  try {
    git(vaultDir, ['add', '-A']);
    const status = git(vaultDir, ['status', '--porcelain']);
    if (status.length > 0) {
      const commitMsg = `Memory vault sync ${new Date().toISOString()}`;

      // Ensure git user is set (required in CI / fresh envs)
      try { git(vaultDir, ['config', 'user.email', 'total-recall-bot@localhost']); } catch { /* ok */ }
      try { git(vaultDir, ['config', 'user.name', 'Total Recall Bot']); } catch { /* ok */ }

      git(vaultDir, ['commit', '-m', commitMsg]);

      // ── Push ───────────────────────────────────────────────────────────────
      git(vaultDir, ['push', 'origin', branch]);
      pushed = true;
      logger.info({ subsystem: 'github-sync', message: `Pushed changes to ${remoteUrl} (${branch})` });
    } else {
      logger.info({ subsystem: 'github-sync', message: 'No changes to push.' });
    }
  } catch (err) {
    logger.error({ subsystem: 'github-sync', message: `Sync step failed: ${err.message}` });
    return { success: false, pushed, pulled, conflicts, message: err.message };
  } finally {
    // Restore plain remote URL so token isn't persisted in .git/config
    if (token) {
      try { git(vaultDir, ['remote', 'set-url', 'origin', remoteUrl]); } catch { /* ok */ }
    }
  }

  writeState(brainDir, { lastSync: new Date().toISOString() });

  return {
    success: true,
    pushed,
    pulled,
    conflicts: false,
    message: pushed ? 'Sync complete — changes pushed.' : 'Sync complete — nothing to push.',
  };
}

/**
 * Return the current sync status without running a sync.
 *
 * @param {{ brainDir: string, vaultDir: string }} options
 * @returns {Promise<{ configured: boolean, lastSync: string|null, remoteUrl: string|null, status: string }>}
 */
export async function getGitHubSyncStatus({ brainDir, vaultDir }) {
  const state = readState(brainDir);

  let remoteUrl = null;
  try {
    remoteUrl = git(vaultDir, ['remote', 'get-url', 'origin']);
  } catch {
    // no remote
  }

  const configured = !!remoteUrl;

  if (!configured) {
    return {
      configured: false,
      lastSync: null,
      remoteUrl: null,
      status: 'not_configured',
    };
  }

  return {
    configured: true,
    lastSync: state?.lastSync || null,
    remoteUrl,
    status: state?.lastSync ? 'ok' : 'configured_never_synced',
  };
}
