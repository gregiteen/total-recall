/**
 * Keep each harness on this machine current, with the harness's own update command.
 *
 * Nothing updated a harness before this: the upstream report compared versions for three of
 * them and changed nothing, and it reported Hermes as current because it had no way to ask.
 * A Hermes install sat a release behind until a person noticed.
 *
 * Every command here was read from the installed binary's own `--help` on 2026-11-16, never
 * guessed. A harness owns what an update does to its own services: `hermes update` drains and
 * restarts its gateway itself. DSH documents no update command and is an npm package, so it is
 * moved with npm, in the prefix it is already installed in, and only forward.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { findBinary, runProcess, agentEnvironment } from './worker.mjs';

export const HARNESS_UPDATERS = Object.freeze({
  claude: { binary: 'claude', update: ['update'] },
  codex: { binary: 'codex', update: ['update'] },
  agy: { binary: 'agy', update: ['update'] },
  grok: { binary: 'grok', update: ['update'] },
  cursor: { binary: 'cursor-agent', update: ['update'] },
  // Hermes restarts its gateway on every update run, so it is asked first whether one is waiting.
  hermes: { binary: 'hermes', check: ['update', '--check'], pending: /Run `hermes update`/, update: ['update', '--yes'] },
  // These three rewrite the files a running copy has loaded, so they wait until none is running.
  pi: { binary: 'pi', update: ['update', '--self'], idleOnly: true },
  cline: { binary: 'cline', update: ['update'], idleOnly: true },
  openclaw: { binary: 'openclaw', update: ['update', '--yes'], idleOnly: true },
  dsh: { binary: 'dsh', npm: '@deepseek-ai/dsh', idleOnly: true },
});

/** Under the ten minutes a plugin task may run, so the report is written before the runner stops it. */
export const UPDATE_BUDGET_MS = 9 * 60_000;
const CHECK_TIMEOUT_MS = 60_000;
const VERSION_TIMEOUT_MS = 15_000;

const firstLine = (text) => String(text || '').split(/\r?\n/).map((line) => line.trim()).find(Boolean) || null;
const tail = (result) => `${result.reason ? `${result.reason}: ` : ''}${String(result.stderr || result.stdout || '').trim().slice(-400)}`.trim() || `exit ${result.exitCode}`;
const failedRun = (result) => Boolean(result.reason) || result.exitCode !== 0;
/**
 * What identifies the installed build in a version line: its version numbers and commit ids.
 * The words around them can change without a new build: after its first run here, Grok's updater
 * added "[stable]" to the same version, which read as an update when whole lines were compared.
 */
export const buildOf = (line) => (String(line || '').match(/\b\d+(?:\.\d+)+(?:-[0-9A-Za-z.]+)?\b|\b[0-9a-f]{7,40}\b/g) || [String(line || '')]).join(' ');
const real = (file) => { try { return fs.realpathSync(file); } catch { return file; } };

/** Order two versions. A release sorts after its own pre-releases; pre-release parts compare in turn. */
export function compareVersions(a, b) {
  const parse = (value) => {
    const match = /(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?/.exec(String(value || ''));
    return match ? { core: match.slice(1, 4).map(Number), pre: match[4] ? match[4].split('.') : null } : null;
  };
  const left = parse(a), right = parse(b);
  if (!left || !right) return null;
  for (let i = 0; i < 3; i++) if (left.core[i] !== right.core[i]) return left.core[i] < right.core[i] ? -1 : 1;
  if (!left.pre || !right.pre) return left.pre ? -1 : right.pre ? 1 : 0;
  for (let i = 0; i < Math.max(left.pre.length, right.pre.length); i++) {
    const x = left.pre[i], y = right.pre[i];
    if (x === undefined || y === undefined) return x === undefined ? -1 : 1;
    if (x === y) continue;
    const numeric = /^\d+$/.test(x) && /^\d+$/.test(y);
    return (numeric ? Number(x) < Number(y) : x < y) ? -1 : 1;
  }
  return 0;
}

/** The npm prefix a global package is installed under, from its binary: `<prefix>/lib/node_modules/<package>/…`. */
export function npmPrefixOf(binary, name) {
  const parts = real(binary).split(path.sep);
  const tree = parts.lastIndexOf('node_modules');
  const expected = name.split('/');
  if (tree < 1 || parts[tree - 1] !== 'lib' || expected.some((part, i) => parts[tree + 1 + i] !== part)) return null;
  return { prefix: parts.slice(0, tree - 1).join(path.sep) || path.sep, packageDir: parts.slice(0, tree + 1 + expected.length).join(path.sep) };
}

/** Command lines of every other process on this machine, for telling whether a harness is in use. */
async function otherCommandLines(run) {
  const listed = await run('ps', ['-axo', 'pid=,command='], { timeoutMs: 15_000, env: agentEnvironment() });
  if (failedRun(listed)) throw new Error(`could not list processes: ${tail(listed)}`);
  return listed.stdout.split('\n').map((line) => /^\s*(\d+)\s+(.*)$/.exec(line)).filter(Boolean)
    .filter((match) => Number(match[1]) !== process.pid && Number(match[1]) !== process.ppid).map((match) => match[2]);
}

/** A running copy of this harness: a process started from its binary, or from the files behind it. */
function runningCopy(lines, binary, directories = []) {
  const files = [...new Set([binary, real(binary)])];
  return lines.find((line) => files.some((file) => ` ${line} `.includes(` ${file} `))
    || directories.some((directory) => line.includes(`${directory}${path.sep}`))) || null;
}

/**
 * Update every listed harness that is installed, one at a time. A harness that fails is
 * reported and the rest still run. Never throws.
 * @param {{ only?: string, dryRun?: boolean, env?: object, run?: Function, find?: Function, gates?: Function, processes?: Function, now?: () => number, budgetMs?: number }} [options]
 */
export async function updateHarnesses({ only = null, dryRun = false, env = process.env, run = runProcess, find = findBinary,
  gates = async (id) => (await import('./gate-adapters/index.mjs')).install(id), processes = () => otherCommandLines(run),
  now = Date.now, budgetMs = UPDATE_BUDGET_MS } = {}) {
  if (only && !HARNESS_UPDATERS[only]) {
    return { ok: false, rows: [{ harness: only, status: 'unsupported', detail: 'No update command is recorded for this harness, so it is not updated here.' }] };
  }
  const started = now();
  const options = (timeoutMs) => ({ cwd: os.homedir(), env: agentEnvironment(env), timeoutMs });
  const rows = [];
  for (const [harness, spec] of Object.entries(HARNESS_UPDATERS)) {
    if (only && harness !== only) continue;
    const row = { harness };
    rows.push(row);
    try {
      const binary = find(spec.binary, env);
      if (!binary) { row.status = 'not-present'; continue; }
      const left = budgetMs - (now() - started);
      if (left < CHECK_TIMEOUT_MS) { row.status = 'not-run'; row.detail = 'The time allowed for one run was used up by the harnesses before this one.'; continue; }
      // A runtime pinned in a versioned folder belongs to whatever installed it there.
      if (real(binary).split(path.sep).includes('tr-harness-runtimes')) {
        row.status = 'managed';
        row.detail = 'Installed as a pinned runtime, which its installer moves. An update from inside it would leave the pin wrong.';
        continue;
      }
      // Some harnesses print their version on stderr.
      const version = async () => { const shown = await run(binary, ['--version'], options(VERSION_TIMEOUT_MS)); return firstLine(shown.stdout) || firstLine(shown.stderr); };
      row.before = await version();

      let command = spec.update ? [binary, spec.update] : null;
      let packageDir = null;
      if (spec.npm) {
        const installed = npmPrefixOf(binary, spec.npm);
        if (!installed) { row.status = 'unsupported'; row.detail = `Not an npm global install of ${spec.npm}, so npm is not used to move it.`; continue; }
        packageDir = installed.packageDir;
        const npm = find('npm', env);
        if (!npm) { row.status = 'failed'; row.detail = 'npm is not on PATH.'; continue; }
        const asked = await run(npm, ['view', spec.npm, 'dist-tags.latest'], options(CHECK_TIMEOUT_MS));
        if (failedRun(asked)) { row.status = 'failed'; row.detail = `check: ${tail(asked)}`; continue; }
        const latest = firstLine(asked.stdout);
        const order = compareVersions(row.before, latest);
        if (order === null) { row.status = 'failed'; row.detail = `check: could not compare ${row.before} with ${latest}.`; continue; }
        // Only forward: a `latest` tag behind the installed pre-release must never downgrade it.
        if (order >= 0) { row.status = 'current'; continue; }
        row.pending = latest;
        command = [npm, ['install', '-g', '--prefix', installed.prefix, `${spec.npm}@${latest}`]];
      }
      if (spec.check) {
        const checked = await run(binary, spec.check, options(CHECK_TIMEOUT_MS));
        if (failedRun(checked)) { row.status = 'failed'; row.detail = `check: ${tail(checked)}`; continue; }
        if (!spec.pending.test(`${checked.stdout}\n${checked.stderr}`)) { row.status = 'current'; continue; }
        row.pending = firstLine(String(checked.stdout).split(/\r?\n/).filter((line) => /available/i.test(line)).join('\n'));
      }
      if (spec.idleOnly) {
        const busy = runningCopy(await processes(), binary, packageDir ? [packageDir] : []);
        if (busy) { row.status = 'busy'; row.detail = `In use (${busy.slice(0, 120)}), so it was left alone. The next run tries again.`; continue; }
      }
      if (dryRun) { row.status = row.pending ? 'would-update' : 'would-run'; continue; }
      const updated = await run(command[0], command[1], options(budgetMs - (now() - started)));
      row.after = await version();
      if (failedRun(updated)) { row.status = 'failed'; row.detail = tail(updated); continue; }
      row.status = row.after && buildOf(row.after) !== buildOf(row.before) ? 'updated' : 'current';
      if (row.status === 'updated') {
        // A new release can rewrite the file its hooks live in, so the gate is put back at once.
        try { await gates(harness); row.gate = 'reinstalled'; }
        catch (error) { row.gate = `not reinstalled: ${error.message}`; row.status = 'failed'; row.detail = 'Updated, but the Total Recall gate could not be put back.'; }
      }
    } catch (error) {
      row.status = 'failed';
      row.detail = error.message;
    }
  }
  return { ok: rows.every((row) => !['failed', 'not-run'].includes(row.status)), rows };
}
