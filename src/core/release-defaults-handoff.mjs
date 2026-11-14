/**
 * Automatic maintenance refreshes the default plugins before it installs a new release: the code
 * that runs it is the old release, and so are its bundled copies. A default is replaced only by a
 * higher bundled version, so that pass changed nothing and a release's defaults arrived one pass
 * (about an hour) later. After the global and source updates, the newest installed release of this
 * package refreshes the defaults itself, with its own code and its own bundled copies.
 */
import fs from 'node:fs';
import path from 'node:path';
import { PACKAGE_ROOT } from './plugin-loader.mjs';
import { comparePackageVersions } from './package-version.mjs';
import { findLinkedSourceCheckout } from './global-brain-updates.mjs';
import { runBounded } from './startup-health.mjs';

const PACKAGE = 'total-recall-brain';

function readVersion(dir) {
  try { return JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8')).version || null; } catch { return null; }
}

/**
 * The release this process runs, read once at import. A source update can fast-forward this
 * checkout during the run, so reading the file again later would report the new release.
 */
export const RUNNING_VERSION = readVersion(PACKAGE_ROOT);

/** Installed releases this run may have moved: the global install and source checkouts it updated. */
export function installedReleases({ global, sources } = {}) {
  const dirs = new Set();
  const add = dir => { try { dirs.add(fs.realpathSync(dir)); } catch {} };
  if (global?.root) {
    const direct = path.join(global.root, PACKAGE);
    const dir = fs.existsSync(direct) ? direct : findLinkedSourceCheckout(global.root, PACKAGE);
    if (dir) add(dir);
  }
  for (const row of sources?.results || []) {
    if (row?.package === PACKAGE && row.status === 'updated' && row.root) add(row.root);
  }
  return [...dirs]
    .map(dir => ({ dir, version: readVersion(dir) }))
    .filter(release => release.version && fs.existsSync(path.join(release.dir, 'bin', 'total-recall.mjs')));
}

/** The JSON report `update --defaults --json` prints, even after other output on stdout. */
export function parseDefaultsReport(text) {
  const trimmed = String(text || '').trim();
  try { return JSON.parse(trimmed); } catch {}
  const start = trimmed.lastIndexOf('\n{\n');
  if (start >= 0) { try { return JSON.parse(trimmed.slice(start + 1)); } catch {} }
  return null;
}

/**
 * When an installed release is newer than the running code, run its `update --defaults` and report
 * what it did. Never throws: the outcome is a row in the maintenance report.
 * @returns {Promise<{status:'current'|'refreshed'|'failed', running?:string|null, installed?:string, version?:string, from?:string|null, results?:object[], error?:string}>}
 */
export async function handOffDefaultsToRelease({ global, sources, cwd = process.cwd(), running = RUNNING_VERSION,
  execPath = process.execPath, run = runBounded, timeoutMs = 10 * 60 * 1000 } = {}) {
  let newest = null;
  try {
    for (const release of installedReleases({ global, sources })) {
      if (!newest || comparePackageVersions(release.version, newest.version) === 1) newest = release;
    }
  } catch (error) {
    return { status: 'failed', running, error: `Installed releases could not be read: ${error.message}` };
  }
  if (!newest || comparePackageVersions(newest.version, running) !== 1) {
    return { status: 'current', running, ...(newest ? { installed: newest.version } : {}) };
  }
  const handoff = { version: newest.version, from: running };
  let result;
  try {
    result = await run(execPath, [path.join(newest.dir, 'bin', 'total-recall.mjs'), 'update', '--defaults', '--json'],
      { cwd, timeoutMs, maxBytes: 1024 * 1024 });
  } catch (error) {
    return { status: 'failed', ...handoff, error: `update --defaults could not run: ${error.message}` };
  }
  const report = parseDefaultsReport(result?.output);
  if (result?.code === 0 && report && report.failed === 0) {
    return { status: 'refreshed', ...handoff, results: report.results || [] };
  }
  const failures = (report?.results || []).filter(row => row.status === 'failed').map(row => `${row.root}: ${row.error}`);
  const error = result?.reason ? `update --defaults stopped: ${result.reason}`
    : failures.length ? failures.join('; ')
      : !report ? `update --defaults printed no report (exit ${result?.code ?? 'unknown'}): ${String(result?.stderr || result?.output || '').trim().slice(-1000)}`
        : `update --defaults exited ${result?.code}`;
  return { status: 'failed', ...handoff, error, ...(report?.results ? { results: report.results } : {}) };
}
