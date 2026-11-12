/**
 * The dashboard bundle a source checkout serves, kept as new as its sources.
 *
 * The server used to build `frontend/dist` only when `index.html` was missing,
 * and auto-pull rebuilt it only when a pull from origin changed `frontend/`.
 * A local merge or commit refreshed nothing, so the served dashboard silently
 * stayed on an old build: the plugin workspace drawers committed on
 * 2026-11-08 never appeared at localhost:3000 because the bundle there was
 * built on 2026-11-09 from code without them, and nothing ever looked again.
 *
 * Here "stale" has one definition, shared with the publish gate
 * (`scripts/check-dist-freshness.mjs`): a source file newer than the newest
 * bundle file. The server checks on start and on an interval, rebuilds in the
 * background with the frontend's own build script, and keeps serving the
 * current bundle until the new one is complete. It never installs
 * dependencies: missing build tools are reported, not repaired behind the
 * operator's back. An npm tarball gives every file the same mtime, so an
 * installed package is never stale and never builds.
 */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import { readdir, stat } from 'node:fs/promises';
import path from 'node:path';

const IGNORED_DIRS = new Set(['node_modules', '.git', 'dist']);

/** Sources must be untouched this long before a rebuild, so a half-written edit is not built. */
export const QUIET_MS = 60_000;
export const CHECK_INTERVAL_MS = 5 * 60_000;
export const BUILD_TIMEOUT_MS = 10 * 60_000;
const OUTPUT_TAIL_BYTES = 4096;

/**
 * Newest mtime under a file or directory, and the path carrying it.
 * Missing paths contribute nothing rather than failing: vite.config.ts and
 * friends are allowed not to exist.
 */
export async function newestUnder(target) {
  let info;
  try {
    info = await stat(target);
  } catch {
    return null;
  }

  if (info.isFile()) return { path: target, mtimeMs: info.mtimeMs };

  let best = null;
  const entries = await readdir(target, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.isDirectory() && IGNORED_DIRS.has(entry.name)) continue;
    const found = await newestUnder(path.join(target, entry.name));
    if (found && (!best || found.mtimeMs > best.mtimeMs)) best = found;
  }
  return best;
}

/**
 * Whether the built bundle can be trusted to represent the sources.
 * Returns { ok, reason, bundle, source }; never throws, never prints, so the
 * decision can be tested apart from how it is reported.
 */
export async function checkDistFreshness({ distDir, sourcePaths }) {
  const bundle = await newestUnder(distDir);
  if (!bundle) return { ok: false, reason: 'missing-bundle', bundle: null, source: null };

  let source = null;
  for (const candidate of sourcePaths) {
    const found = await newestUnder(candidate);
    if (found && (!source || found.mtimeMs > source.mtimeMs)) source = found;
  }

  if (source && source.mtimeMs > bundle.mtimeMs) {
    return { ok: false, reason: 'stale-bundle', bundle, source };
  }
  return { ok: true, reason: 'current', bundle, source };
}

/** Every input whose change changes the built dashboard. */
export function dashboardTargets(root) {
  const frontend = path.join(root, 'frontend');
  let tsconfigs = [];
  try {
    tsconfigs = fs.readdirSync(frontend).filter(name => /^tsconfig.*\.json$/.test(name)).map(name => path.join(frontend, name));
  } catch { /* no frontend directory: nothing to compare */ }
  return {
    distDir: path.join(frontend, 'dist'),
    sourcePaths: [
      path.join(frontend, 'src'),
      path.join(frontend, 'public'),
      path.join(frontend, 'index.html'),
      path.join(frontend, 'vite.config.ts'),
      path.join(frontend, 'package.json'),
      ...tsconfigs,
    ],
  };
}

/** The build script needs vite and the TypeScript compiler, hoisted to the root or local to the frontend. */
export function buildToolsPresent(root) {
  const frontend = path.join(root, 'frontend');
  const has = rel => [root, frontend].some(dir => fs.existsSync(path.join(dir, 'node_modules', rel)));
  return fs.existsSync(path.join(frontend, 'package.json')) && has(path.join('vite', 'bin', 'vite.js')) && has(path.join('typescript', 'bin', 'tsc'));
}

/** npm installed beside the running node (Homebrew, nvm, system installs), else from PATH. */
function npmBinary() {
  const beside = path.join(path.dirname(process.execPath), process.platform === 'win32' ? 'npm.cmd' : 'npm');
  return fs.existsSync(beside) ? beside : 'npm';
}

/**
 * Run the frontend's own `build` script into `outDir`. npm appends the
 * arguments after `--` to the script, so they reach `vite build`.
 * @returns {Promise<{ code: number|null, output: string, timedOut: boolean }>}
 */
export function runFrontendBuild({ frontendDir, outDir, timeoutMs = BUILD_TIMEOUT_MS }) {
  return new Promise(resolve => {
    let output = '';
    let timedOut = false;
    const keep = chunk => { output = (output + chunk).slice(-OUTPUT_TAIL_BYTES); };
    const env = { ...process.env, PATH: [path.dirname(process.execPath), process.env.PATH].filter(Boolean).join(path.delimiter) };
    let child;
    try {
      child = spawn(npmBinary(), ['run', 'build', '--', '--outDir', outDir, '--emptyOutDir'], {
        cwd: frontendDir, env, stdio: ['ignore', 'pipe', 'pipe'], shell: process.platform === 'win32', detached: process.platform !== 'win32',
      });
    } catch (error) {
      resolve({ code: null, output: error.message, timedOut: false });
      return;
    }
    child.stdout.on('data', keep);
    child.stderr.on('data', keep);
    const timer = setTimeout(() => {
      timedOut = true;
      // The build runs in its own process group: end tsc and vite with npm.
      try { process.kill(-child.pid, 'SIGTERM'); } catch { child.kill('SIGTERM'); }
    }, timeoutMs);
    timer.unref?.();
    child.on('error', error => { clearTimeout(timer); resolve({ code: null, output: `${output}\n${error.message}`.trim(), timedOut }); });
    child.on('close', code => { clearTimeout(timer); resolve({ code, output, timedOut }); });
  });
}

function processAlive(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try { process.kill(pid, 0); return true; } catch (error) { return error.code === 'EPERM'; }
}

/**
 * Hold the build lock, or report who holds it. A lock left by a process that
 * no longer exists is reclaimed once.
 */
function acquireLock(file) {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const fd = fs.openSync(file, 'wx', 0o600);
      fs.writeSync(fd, `${process.pid}\n`);
      fs.closeSync(fd);
      return { held: true, release: () => { try { if (Number(fs.readFileSync(file, 'utf8').trim()) === process.pid) fs.unlinkSync(file); } catch { /* already gone */ } } };
    } catch (error) {
      if (error.code !== 'EEXIST') throw error;
      const owner = Number(String(fs.readFileSync(file, 'utf8')).trim());
      if (processAlive(owner)) return { held: false, owner };
      fs.rmSync(file, { force: true });
    }
  }
  return { held: false, owner: null };
}

/**
 * Build the dashboard beside the served one and swap it in. The served bundle
 * stays in place until the new one is complete; a failed build leaves it
 * untouched.
 * @returns {Promise<{ ok: boolean, status: string, reason?: string, durationMs?: number, output?: string }>}
 */
export async function rebuildDashboard({ root, run = runFrontendBuild, timeoutMs = BUILD_TIMEOUT_MS } = {}) {
  const frontendDir = path.join(root, 'frontend');
  const dist = path.join(frontendDir, 'dist');
  const next = path.join(frontendDir, 'dist.next');
  const prev = path.join(frontendDir, 'dist.prev');
  const lock = acquireLock(path.join(frontendDir, '.dist-build.lock'));
  if (!lock.held) return { ok: false, status: 'building-elsewhere', reason: `another process (pid ${lock.owner ?? 'unknown'}) is building the dashboard` };
  const started = Date.now();
  try {
    fs.rmSync(next, { recursive: true, force: true });
    const result = await run({ frontendDir, outDir: next, timeoutMs });
    const built = result.code === 0 && !result.timedOut && fs.existsSync(path.join(next, 'index.html'));
    if (!built) {
      fs.rmSync(next, { recursive: true, force: true });
      const reason = result.timedOut ? `build timed out after ${Math.round(timeoutMs / 1000)} s`
        : result.code === 0 ? 'build finished without index.html' : `build exited ${result.code ?? 'without a status'}`;
      return { ok: false, status: 'failed', reason, durationMs: Date.now() - started, output: result.output };
    }
    // Two renames: the served directory is absent only between them.
    fs.rmSync(prev, { recursive: true, force: true });
    const hadDist = fs.existsSync(dist);
    if (hadDist) fs.renameSync(dist, prev);
    try {
      fs.renameSync(next, dist);
    } catch (error) {
      if (hadDist) fs.renameSync(prev, dist);
      throw error;
    }
    fs.rmSync(prev, { recursive: true, force: true });
    return { ok: true, status: 'built', durationMs: Date.now() - started };
  } finally {
    lock.release();
  }
}

/**
 * Check once and rebuild when needed. Returns the state to report and, when
 * the sources are still being edited, how long to wait before checking again.
 */
export async function refreshDashboard({ root, now = Date.now, quietMs = QUIET_MS, rebuild = rebuildDashboard, toolsPresent = buildToolsPresent } = {}) {
  const freshness = await checkDistFreshness(dashboardTargets(root));
  if (freshness.ok) return { status: 'current', bundleBuiltAt: new Date(freshness.bundle.mtimeMs).toISOString() };
  const state = freshness.reason === 'missing-bundle' ? 'missing' : 'stale';
  if (!toolsPresent(root)) {
    return { status: state, reason: `the build tools are not installed; run npm ci in ${root}`, source: freshness.source?.path ?? null };
  }
  if (freshness.source && now() - freshness.source.mtimeMs < quietMs) {
    return { status: state, reason: 'sources are still changing', source: freshness.source.path, retryInMs: quietMs - (now() - freshness.source.mtimeMs) + 1000 };
  }
  const build = await rebuild({ root });
  if (build.ok) return { status: 'current', rebuilt: true, durationMs: build.durationMs, was: state };
  return { status: state, reason: build.reason, build };
}

/**
 * Keep a serving checkout's bundle current: check now, after the sources go
 * quiet, and every `intervalMs`. `report` receives each state change.
 * @returns {{ state: () => object, check: () => Promise<object>, stop: () => void }}
 */
export function watchDashboardBundle({ root, report = () => {}, intervalMs = CHECK_INTERVAL_MS, refresh = refreshDashboard } = {}) {
  let current = { status: 'unchecked' };
  let running = null;
  let retry = null;
  let lastKey = '';
  const check = () => {
    if (running) return running;
    running = (async () => {
      try {
        current = { ...await refresh({ root }), checkedAt: new Date().toISOString() };
      } catch (error) {
        current = { status: 'error', reason: error.message, checkedAt: new Date().toISOString() };
      }
      const key = `${current.status}|${current.reason ?? ''}|${current.rebuilt ?? ''}`;
      if (key !== lastKey || current.rebuilt) report(current);
      lastKey = key;
      clearTimeout(retry);
      if (current.retryInMs) { retry = setTimeout(check, current.retryInMs); retry.unref?.(); }
      return current;
    })().finally(() => { running = null; });
    return running;
  };
  const interval = setInterval(check, intervalMs);
  interval.unref?.();
  return { state: () => current, check, stop: () => { clearInterval(interval); clearTimeout(retry); } };
}
