/**
 * Auto-download total-recall-brain updates into registered project roots.
 *
 * Roots come only from:
 *   - global/project project-registry.json
 *   - TR_SYNC_REPOS env (path separators : or ,)
 *   - optional explicit roots[] (CLI / API)
 *
 * Never hardcodes product repo paths. Opt-out: TR_AUTO_UPDATE_PACKAGE=0
 * Source monorepos (package name total-recall-brain with src/server) are skipped
 * for npm install — they track git, not the published tarball.
 */

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawn, spawnSync } from 'node:child_process';
import { logger } from './logger.mjs';

export const PACKAGE_NAME = 'total-recall-brain';
export const DEFAULT_CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000; // 6 hours

/** In-process cache so dashboard update checks never block the event loop on every load. */
let latestVersionCache = { value: null, fetchedAt: 0 };
const LATEST_VERSION_CACHE_MS = 5 * 60 * 1000;

/**
 * @returns {boolean}
 */
export function isPackageAutoUpdateEnabled() {
  const v = process.env.TR_AUTO_UPDATE_PACKAGE ?? process.env.TR_AUTO_UPDATE;
  if (v === '0' || v === 'false' || v === 'off' || v === 'no') return false;
  // Default on so consumer installs stay current once the daemon runs.
  return true;
}

/**
 * @param {string} [brainDir]
 * @returns {string}
 */
export function packageUpdateStatePath(brainDir) {
  const base = brainDir || path.join(os.homedir(), '.agent', 'skills', 'total-recall');
  return path.join(base, 'memory-derived', 'package-auto-update.json');
}

/**
 * @param {string} statePath
 * @returns {{ last_check_at?: string, last_latest?: string, last_results?: object[] }}
 */
export function loadUpdateState(statePath) {
  try {
    if (!fs.existsSync(statePath)) return {};
    return JSON.parse(fs.readFileSync(statePath, 'utf8')) || {};
  } catch {
    return {};
  }
}

/**
 * @param {string} statePath
 * @param {object} state
 */
export function saveUpdateState(statePath, state) {
  fs.mkdirSync(path.dirname(statePath), { recursive: true });
  fs.writeFileSync(statePath, JSON.stringify(state, null, 2), 'utf8');
}

/**
 * Resolve registry JSON paths (global brain + optional brainDir config).
 * @param {{ brainDir?: string }} [opts]
 * @returns {string[]}
 */
export function resolveRegistryFiles(opts = {}) {
  const files = [];
  const globalReg = path.join(os.homedir(), '.agent', 'skills', 'total-recall', 'config', 'project-registry.json');
  if (fs.existsSync(globalReg)) files.push(globalReg);
  if (opts.brainDir) {
    const local = path.join(opts.brainDir, 'config', 'project-registry.json');
    if (fs.existsSync(local) && local !== globalReg) files.push(local);
  }
  return files;
}

/**
 * @param {string} registryPath
 * @returns {Array<{ name?: string, path?: string }>}
 */
export function readRegistryEntries(registryPath) {
  try {
    const raw = JSON.parse(fs.readFileSync(registryPath, 'utf8'));
    return Array.isArray(raw) ? raw : [];
  } catch {
    return [];
  }
}

/**
 * @returns {string[]}
 */
export function rootsFromEnv() {
  const raw = process.env.TR_SYNC_REPOS || '';
  if (!raw.trim()) return [];
  return raw
    .split(/[:|,]/)
    .map((s) => s.trim())
    .filter(Boolean)
    .map((p) => path.resolve(p));
}

/**
 * Unique absolute project roots from registry + env + explicit.
 * @param {{ brainDir?: string, roots?: string[] }} [opts]
 * @returns {Array<{ root: string, name: string, source: string }>}
 */
export function listUpdateRoots(opts = {}) {
  const byRoot = new Map();

  function add(root, name, source) {
    if (!root || typeof root !== 'string') return;
    const abs = path.resolve(root);
    if (!fs.existsSync(abs) || !fs.statSync(abs).isDirectory()) return;
    if (!byRoot.has(abs)) {
      byRoot.set(abs, { root: abs, name: name || path.basename(abs), source });
    }
  }

  for (const file of resolveRegistryFiles(opts)) {
    for (const entry of readRegistryEntries(file)) {
      add(entry.path, entry.name, 'project-registry');
    }
  }
  for (const r of rootsFromEnv()) {
    add(r, path.basename(r), 'TR_SYNC_REPOS');
  }
  for (const r of opts.roots || []) {
    add(r, path.basename(path.resolve(r)), 'explicit');
  }

  return [...byRoot.values()];
}

/**
 * @param {string} projectRoot
 * @returns {string|null}
 */
export function readPackageJsonVersionField(projectRoot, field = 'version') {
  const pkgPath = path.join(projectRoot, 'package.json');
  if (!fs.existsSync(pkgPath)) return null;
  try {
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
    return pkg?.[field] ?? null;
  } catch {
    return null;
  }
}

/**
 * @param {string} projectRoot
 * @returns {{ declared: string|null, installed: string|null, isSourceTree: boolean, packageName: string|null }}
 */
export function inspectProjectPackage(projectRoot) {
  const pkgPath = path.join(projectRoot, 'package.json');
  if (!fs.existsSync(pkgPath)) {
    return { declared: null, installed: null, isSourceTree: false, packageName: null };
  }
  let pkg = {};
  try {
    pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8')) || {};
  } catch {
    return { declared: null, installed: null, isSourceTree: false, packageName: null };
  }
  const deps = { ...(pkg.dependencies || {}), ...(pkg.devDependencies || {}) };
  const declared = deps[PACKAGE_NAME] || null;
  let installed = null;
  const nm = path.join(projectRoot, 'node_modules', PACKAGE_NAME, 'package.json');
  if (fs.existsSync(nm)) {
    try {
      installed = JSON.parse(fs.readFileSync(nm, 'utf8')).version || null;
    } catch {
      installed = null;
    }
  }
  const isSourceTree =
    pkg.name === PACKAGE_NAME &&
    fs.existsSync(path.join(projectRoot, 'src', 'server', 'index.mjs'));
  return { declared, installed, isSourceTree, packageName: pkg.name || null };
}

/**
 * Resolve latest npm version without blocking the Node event loop.
 * Prefer this from HTTP handlers / daemons.
 *
 * @param {{ timeoutMs?: number, force?: boolean }} [opts]
 * @returns {Promise<string|null>}
 */
export function fetchLatestNpmVersionAsync(opts = {}) {
  const timeout = opts.timeoutMs ?? 8_000;
  const now = Date.now();
  if (
    !opts.force &&
    latestVersionCache.value &&
    now - latestVersionCache.fetchedAt < LATEST_VERSION_CACHE_MS
  ) {
    return Promise.resolve(latestVersionCache.value);
  }

  return new Promise((resolve) => {
    let settled = false;
    const finish = (value) => {
      if (settled) return;
      settled = true;
      if (value) {
        latestVersionCache = { value, fetchedAt: Date.now() };
      }
      resolve(value);
    };

    let child;
    try {
      child = spawn('npm', ['view', PACKAGE_NAME, 'version'], {
        stdio: ['ignore', 'pipe', 'pipe'],
      });
    } catch (err) {
      logger.debug('package-auto-update', 'npm view spawn failed', { error: err.message });
      return finish(null);
    }

    let stdout = '';
    let stderr = '';
    child.stdout?.on('data', (chunk) => {
      stdout += String(chunk);
    });
    child.stderr?.on('data', (chunk) => {
      stderr += String(chunk);
    });

    const timer = setTimeout(() => {
      try {
        child.kill('SIGTERM');
      } catch {
        /* ignore */
      }
      logger.debug('package-auto-update', 'npm view timed out', { timeoutMs: timeout });
      // Return stale cache if any
      finish(latestVersionCache.value || null);
    }, timeout);

    child.on('error', (err) => {
      clearTimeout(timer);
      logger.debug('package-auto-update', 'npm view error', { error: err.message });
      finish(latestVersionCache.value || null);
    });

    child.on('close', (code) => {
      clearTimeout(timer);
      if (code !== 0) {
        if (stderr) {
          logger.debug('package-auto-update', 'npm view failed', { code, stderr: stderr.slice(0, 200) });
        }
        return finish(latestVersionCache.value || null);
      }
      const v = stdout.trim();
      finish(v || null);
    });
  });
}

/**
 * Sync npm view (CLI only). Blocks the process — do NOT call from Express handlers.
 * Prefer fetchLatestNpmVersionAsync in server/daemon paths.
 *
 * @param {{ timeoutMs?: number }} [opts]
 * @returns {string|null}
 */
export function fetchLatestNpmVersion(opts = {}) {
  const now = Date.now();
  if (latestVersionCache.value && now - latestVersionCache.fetchedAt < LATEST_VERSION_CACHE_MS) {
    return latestVersionCache.value;
  }
  const timeout = opts.timeoutMs ?? 8_000;
  const result = spawnSync('npm', ['view', PACKAGE_NAME, 'version'], {
    encoding: 'utf8',
    timeout,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  if (!result || result.status !== 0) return latestVersionCache.value || null;
  const v = (result.stdout || '').trim();
  if (v) latestVersionCache = { value: v, fetchedAt: Date.now() };
  return v || null;
}

/** Test helper — clear version cache between specs. */
export function clearLatestNpmVersionCache() {
  latestVersionCache = { value: null, fetchedAt: 0 };
}

/**
 * Semver-ish compare: true if installed is missing or older than latest.
 * Handles simple x.y.z only (npm publish tags).
 * @param {string|null} installed
 * @param {string} latest
 */
export function needsUpdate(installed, latest) {
  if (!latest) return false;
  if (!installed) return true;
  if (installed === latest) return false;
  const a = installed.split('.').map((n) => parseInt(n, 10) || 0);
  const b = latest.split('.').map((n) => parseInt(n, 10) || 0);
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const x = a[i] || 0;
    const y = b[i] || 0;
    if (x < y) return true;
    if (x > y) return false;
  }
  return false;
}

/**
 * @param {string} projectRoot
 * @param {string} latest
 * @param {{ dryRun?: boolean, save?: boolean }} [opts]
 * @returns {{ ok: boolean, action: string, error?: string, code?: number|null }}
 */
export function installPackageInProject(projectRoot, latest, opts = {}) {
  const dryRun = Boolean(opts.dryRun);
  const save = opts.save !== false;
  const spec = `${PACKAGE_NAME}@${latest}`;
  if (dryRun) {
    return { ok: true, action: `dry-run: npm install ${spec}${save ? ' --save' : ' --no-save'}` };
  }
  const args = ['install', spec];
  if (save) args.push('--save');
  else args.push('--no-save');
  // Prefer clean installs in CI-like envs
  if (process.env.CI === 'true') args.push('--no-fund', '--no-audit');
  const result = spawnSync('npm', args, {
    cwd: projectRoot,
    encoding: 'utf8',
    timeout: 10 * 60 * 1000,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  if (result.status !== 0) {
    const err = (result.stderr || result.stdout || 'npm install failed').trim().slice(0, 500);
    return { ok: false, action: `npm install ${spec}`, error: err, code: result.status };
  }
  return { ok: true, action: `installed ${spec}`, code: 0 };
}

/**
 * Scan roots and optionally install updates.
 *
 * @param {{
 *   brainDir?: string,
 *   roots?: string[],
 *   dryRun?: boolean,
 *   force?: boolean,
 *   skipThrottle?: boolean,
 *   intervalMs?: number,
 *   save?: boolean,
 * }} [opts]
 * @returns {Promise<object>}
 */
export async function runPackageAutoUpdate(opts = {}) {
  const enabled = opts.force || isPackageAutoUpdateEnabled();
  if (!enabled) {
    return { skipped: true, reason: 'disabled', results: [] };
  }

  const brainDir = opts.brainDir || path.join(os.homedir(), '.agent', 'skills', 'total-recall');
  const statePath = packageUpdateStatePath(brainDir);
  const state = loadUpdateState(statePath);
  const intervalMs = opts.intervalMs ?? DEFAULT_CHECK_INTERVAL_MS;

  if (!opts.skipThrottle && !opts.force && state.last_check_at) {
    const elapsed = Date.now() - new Date(state.last_check_at).getTime();
    if (Number.isFinite(elapsed) && elapsed < intervalMs) {
      return {
        skipped: true,
        reason: 'throttled',
        next_check_in_ms: intervalMs - elapsed,
        last_check_at: state.last_check_at,
        last_latest: state.last_latest,
        results: state.last_results || [],
      };
    }
  }

  const latest = fetchLatestNpmVersion();
  if (!latest) {
    logger.warn('package-auto-update', `Could not resolve npm version for ${PACKAGE_NAME}`);
    return { skipped: true, reason: 'npm-view-failed', results: [] };
  }

  const roots = listUpdateRoots({ brainDir, roots: opts.roots });
  const results = [];

  for (const { root, name, source } of roots) {
    const info = inspectProjectPackage(root);
    if (info.isSourceTree) {
      results.push({
        name,
        root,
        source,
        status: 'skipped_source_tree',
        declared: info.declared,
        installed: info.installed || readPackageJsonVersionField(root),
        latest,
        message: 'Source monorepo — use git pull / release tags, not npm tarball into self',
      });
      continue;
    }
    if (!info.declared && !info.installed) {
      // Only touch projects that already depend on or install the package
      results.push({
        name,
        root,
        source,
        status: 'skipped_no_dependency',
        declared: null,
        installed: null,
        latest,
      });
      continue;
    }

    const installed = info.installed;
    if (!needsUpdate(installed, latest)) {
      results.push({
        name,
        root,
        source,
        status: 'up_to_date',
        declared: info.declared,
        installed,
        latest,
      });
      continue;
    }

    const install = installPackageInProject(root, latest, {
      dryRun: opts.dryRun,
      save: opts.save !== false,
    });
    results.push({
      name,
      root,
      source,
      status: install.ok ? (opts.dryRun ? 'would_update' : 'updated') : 'failed',
      declared: info.declared,
      installed: install.ok && !opts.dryRun ? latest : installed,
      previous: installed,
      latest,
      action: install.action,
      error: install.error || null,
    });
    if (install.ok && !opts.dryRun) {
      logger.info(
        'package-auto-update',
        `Updated ${name} → ${PACKAGE_NAME}@${latest} (${root})`,
      );
    } else if (!install.ok) {
      logger.warn(
        'package-auto-update',
        `Failed updating ${name}: ${install.error || 'unknown'}`,
      );
    }
  }

  const summary = {
    skipped: false,
    package: PACKAGE_NAME,
    latest,
    checked_at: new Date().toISOString(),
    root_count: roots.length,
    updated: results.filter((r) => r.status === 'updated').length,
    would_update: results.filter((r) => r.status === 'would_update').length,
    failed: results.filter((r) => r.status === 'failed').length,
    up_to_date: results.filter((r) => r.status === 'up_to_date').length,
    results,
  };

  if (!opts.dryRun) {
    saveUpdateState(statePath, {
      last_check_at: summary.checked_at,
      last_latest: latest,
      last_results: results.map((r) => ({
        name: r.name,
        root: r.root,
        status: r.status,
        installed: r.installed,
        latest: r.latest,
      })),
    });
  }

  return summary;
}
