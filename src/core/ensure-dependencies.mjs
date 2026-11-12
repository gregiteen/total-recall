/** Restore a repository's locked dependencies before edit or test work. */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

export const DEFAULT_INSTALL_TIMEOUT_MS = 300_000;
const MARKER = '.total-recall-install.json';
const LOCKFILES = [
  ['npm', 'npm-shrinkwrap.json'], ['npm', 'package-lock.json'],
  ['pnpm', 'pnpm-lock.yaml'], ['yarn', 'yarn.lock'],
  ['bun', 'bun.lock'], ['bun', 'bun.lockb'],
];
const pending = new Map();
// The package this module runs from. `npm ci` deletes node_modules before installing, so running
// it here breaks every total-recall command, the preflight gate included, for the whole install
// (2026-11-10: the release's checks and every agent tool call failed until a manual install).
const RUNNING_PACKAGE_ROOT = (() => {
  try { return fs.realpathSync(path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')); }
  catch { return null; }
})();

/**
 * npm records the tree it installed in node_modules/.package-lock.json. The tree matches the
 * lockfile when every installed package has the locked version and every required locked package
 * is installed (optional packages may be absent on this platform; workspace links are not copies).
 */
export function npmTreeMatchesLock(root) {
  let lock, installed;
  try {
    lock = JSON.parse(fs.readFileSync(path.join(root, 'package-lock.json'), 'utf8')).packages;
    installed = JSON.parse(fs.readFileSync(path.join(root, 'node_modules', '.package-lock.json'), 'utf8')).packages;
  } catch { return false; }
  if (!lock || !installed) return false;
  for (const [key, entry] of Object.entries(installed)) {
    if (!key || entry.link) continue;
    if (!lock[key] || lock[key].version !== entry.version) return false;
  }
  for (const [key, entry] of Object.entries(lock)) {
    if (!key.startsWith('node_modules/') && !key.includes('/node_modules/')) continue;
    if (entry.optional || entry.link || entry.peer) continue;
    if (!installed[key]) return false;
  }
  return true;
}

const hash = file => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');

/** No shell, bounded output, and a deadline that also stops lifecycle-script children. */
function runInstall(command, args, { cwd, timeoutMs }) {
  return new Promise(resolve => {
    const child = spawn(command, args, {
      cwd, env: { ...process.env, CI: 'true' }, detached: process.platform !== 'win32',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let output = '', timedOut = false, error = null;
    const collect = chunk => { output += chunk.toString().slice(0, Math.max(0, 65536 - output.length)); };
    child.stdout.on('data', collect);
    child.stderr.on('data', collect);
    const timer = setTimeout(() => {
      timedOut = true;
      try {
        if (process.platform === 'win32') child.kill('SIGKILL');
        else process.kill(-child.pid, 'SIGKILL');
      } catch { /* the install already exited */ }
    }, timeoutMs);
    child.on('error', err => { error = err.message; });
    child.on('close', (exitCode, signal) => {
      clearTimeout(timer);
      resolve({ exitCode, signal, timedOut, output, error });
    });
  });
}

async function ensure(root, { reason = 'work', timeoutMs = DEFAULT_INSTALL_TIMEOUT_MS, run = runInstall, packageRoot = RUNNING_PACKAGE_ROOT } = {}) {
  const started = Date.now();
  const base = { root, reason, manager: null, lockfile: null, command: null };
  const result = (status, fields = {}) => ({ ...base, ok: status !== 'failed', status, durationMs: Date.now() - started, ...fields });
  try {
    if (!Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 600_000) throw new Error('Install timeout must be 1..600000 ms');
    const locks = LOCKFILES.filter(([, file]) => fs.existsSync(path.join(root, file)));
    if (!locks.length) return result('skipped', { trigger: 'no-lockfile' });
    const manifest = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
    const declared = manifest.packageManager?.split('@')[0];
    const managers = new Set(locks.map(([manager]) => manager));
    const manager = declared || (managers.size === 1 ? locks[0][0] : null);
    if (!manager || !managers.has(manager)) throw new Error('Lockfiles do not identify one package manager; set package.json packageManager to a manager with a lockfile');
    const lockfile = locks.find(([name]) => name === manager)[1];
    const lockPath = path.join(root, lockfile);
    const lockHash = hash(lockPath);
    const lockMtimeMs = fs.statSync(lockPath).mtimeMs;
    const modernYarn = manager === 'yarn' && (/^yarn@(?:[2-9]|\d{2,})\./.test(manifest.packageManager || '') || /^__metadata:/m.test(fs.readFileSync(lockPath, 'utf8')));
    const args = manager === 'npm' ? ['ci'] : ['install', modernYarn ? '--immutable' : '--frozen-lockfile'];
    Object.assign(base, { manager, lockfile, command: [manager, ...args] });
    const installDir = () => path.join(root, modernYarn && fs.existsSync(path.join(root, '.pnp.cjs')) ? '.yarn' : 'node_modules');
    const markerPath = () => path.join(installDir(), MARKER);
    let marker;
    try { marker = JSON.parse(fs.readFileSync(markerPath(), 'utf8')); } catch { /* no trusted install */ }
    const current = marker?.version === 1 && marker.manager === manager && marker.lockfile === lockfile
      && marker.lockHash === lockHash && marker.lockMtimeMs === lockMtimeMs;
    if (current) return result('current');
    const writeMarker = () => {
      fs.mkdirSync(installDir(), { recursive: true });
      fs.writeFileSync(markerPath(), `${JSON.stringify({ version: 1, manager, lockfile, lockHash, lockMtimeMs, installedAt: new Date().toISOString() })}\n`);
    };
    // Installed by hand or by an earlier npm run: npm's own record says the tree is current.
    if (manager === 'npm' && lockfile === 'package-lock.json' && npmTreeMatchesLock(root)) {
      writeMarker();
      return result('current', { trigger: 'npm-tree-record' });
    }
    // Never reinstall the package this process runs from: the install would delete the code
    // that is running, and every other total-recall process with it.
    if (packageRoot && root === packageRoot) {
      return result('failed', { trigger: 'running-package', error: `${root} is the Total Recall package this command runs from and its dependencies do not match ${lockfile}. Run '${manager} install' there yourself; it is never reinstalled automatically.` });
    }
    const trigger = fs.existsSync(installDir()) ? 'stale' : 'missing';
    // A failed reinstall must not leave an old marker that can certify a partial install.
    fs.rmSync(markerPath(), { force: true });
    const installed = await run(manager, args, { cwd: root, timeoutMs });
    if (installed.error || installed.timedOut || installed.exitCode !== 0) {
      return result('failed', { ...installed, trigger, error: installed.error || (installed.timedOut ? `Install timed out after ${timeoutMs} ms` : `Install exited ${installed.exitCode ?? installed.signal ?? 'without a status'}`) });
    }
    if (hash(lockPath) !== lockHash || fs.statSync(lockPath).mtimeMs !== lockMtimeMs) throw new Error('Lockfile changed during install; retry with the current lockfile');
    fs.mkdirSync(installDir(), { recursive: true });
    const stamp = { version: 1, manager, lockfile, lockHash, lockMtimeMs, installedAt: new Date().toISOString() };
    fs.writeFileSync(markerPath(), `${JSON.stringify(stamp)}\n`);
    return result('installed', { trigger });
  } catch (err) {
    return result('failed', { error: err.message });
  }
}

/**
 * @returns {Promise<{ok:boolean, status:string, root:string, reason:string, manager:string|null, lockfile:string|null, command:string[]|null, durationMs:number}>}
 * `run` is a fixture seam. Production callers use the bounded installer above.
 * Concurrent callers in this host process share one install for the same real root.
 */
export async function ensureDependencies(root, options = {}) {
  let resolved;
  try { resolved = fs.realpathSync(root); }
  catch (err) { return { ok: false, status: 'failed', root, reason: options.reason || 'work', manager: null, lockfile: null, command: null, durationMs: 0, error: err.message }; }
  if (pending.has(resolved)) return pending.get(resolved);
  const job = ensure(resolved, options);
  pending.set(resolved, job);
  try { return await job; }
  finally { pending.delete(resolved); }
}
