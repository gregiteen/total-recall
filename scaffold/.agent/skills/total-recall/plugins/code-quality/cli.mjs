/**
 * `total-recall code-quality <verb>` for the repository you run it from.
 *
 *   report [view] [arg]      read the latest gate report; never starts a check
 *   run --tier fast|full    run the configured gates once
 *   snapshot --node <name>   put the exact source under test on the test node (git file list only)
 *   ensure [--all]           set up gates where there are none; never overwrites a list
 *   coverage [--json]        which registered repositories have gates, and how old their reports are
 *   gate-status --json       one-line check that `startup check` runs
 *   plugin-check [--json]    validate the plugin in this repository; exits 1 on a problem
 *   gate list|add|remove     edit the repo's gate list
 *   config get|set|…, detect [--apply], init
 *                            the rest of the repo-layer config verbs
 *
 * Config verbs are Total Recall's own `skill config code-quality …`: every
 * write is validated against core/config.schema.json and recorded in the
 * repo's project vault. Gates run once, in the background, through the
 * `code-quality-check` command or core/check.mjs.
 */
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { CORE_DIR, findSkillDir, runCore } from './commands/run-core.mjs';
import { printCachedReport, wantsStructuredReport } from './core/report-data.mjs';
import { ensureGates, NEEDS_ATTENTION } from './core/ensure.mjs';
import { fleetCoverage, gateStatus, repoCoverage } from './core/coverage.mjs';
import { registeredProjects, DEFAULT_ACTIVE_DAYS } from './core/fleet.mjs';
import { checkPlugin, formatPluginCheck } from './core/plugin-check.mjs';

const SHORTHAND = new Set(['get', 'set', 'unset', 'validate', 'schema', 'rebuild', 'import', 'check']);

// The Total Recall install running this plugin: the bin on the command line,
// or the package root the plugin runner passes to dashboard runs.
function skillConfigModule() {
  const roots = [];
  try {
    const bin = fs.realpathSync(process.argv[1]);
    if (path.basename(bin) === 'total-recall.mjs') roots.push(path.dirname(path.dirname(bin)));
  } catch { /* not started from the bin */ }
  if (process.env.TR_PACKAGE_ROOT) roots.push(process.env.TR_PACKAGE_ROOT);
  for (const root of roots) {
    const candidate = path.join(root, 'src', 'cli', 'skill-config.mjs');
    if (fs.existsSync(candidate)) return pathToFileURL(candidate).href;
  }
  return null;
}

const RUN_USAGE = 'Usage: total-recall code-quality run [--tier fast|full] [--repo <path>] [--json]';

/** Value after a flag, or undefined. */
const valueOf = (args, flag) => { const i = args.indexOf(flag); return i >= 0 ? args[i + 1] : undefined; };
const valuesOf = (args, flag) => args.flatMap((arg, i) => (arg === flag && args[i + 1] ? [args[i + 1]] : []));

/** The project root the caller works in: the nearest repository that carries gate state. */
function currentRepo() {
  return path.resolve(findSkillDir(), '..', '..', '..');
}

/** `ensure [--repo <path>]… | --all [--active-days N] [--dry-run] [--json]` */
async function ensureVerb(args) {
  const dryRun = args.includes('--dry-run');
  const json = args.includes('--json');
  const days = Number(valueOf(args, '--active-days') ?? DEFAULT_ACTIVE_DAYS);
  if (!Number.isInteger(days) || days < 0) throw Object.assign(new Error('--active-days must be a whole number'), { exitCode: 2 });
  const repos = valuesOf(args, '--repo').map((repo) => path.resolve(repo));
  const skipped = [];
  if (args.includes('--all')) {
    for (const project of await registeredProjects({ activeDays: days })) {
      if (project.active) repos.push(project.path);
      else skipped.push({ repo: project.path, reason: project.worktree ? 'worktree' : !project.exists ? 'missing path' : !project.git ? 'no git history' : `no commit for ${project.idleDays} days` });
    }
  }
  if (!repos.length) repos.push(currentRepo());
  const results = [];
  for (const repo of [...new Set(repos)]) results.push(await ensureGates(repo, { dryRun }));
  const failed = results.filter((r) => NEEDS_ATTENTION.has(r.state));
  if (json) console.log(JSON.stringify({ ok: failed.length === 0, dryRun, results, skipped }, null, 2));
  else {
    for (const r of results) console.log(`${r.action === 'none' ? r.state.padEnd(13) : r.action.padEnd(13)} ${r.repo}${r.gates.length ? `  [${r.gates.join(', ')}]` : ''}${r.error ? `\n              ${r.error}` : ''}`);
    if (skipped.length) console.log(`\nSkipped ${skipped.length} inactive: ${skipped.map((s) => path.basename(s.repo)).join(', ')}`);
  }
  if (failed.length) process.exitCode = 1;
}

/** `coverage [--active-days N] [--json]` */
async function coverageVerb(args) {
  const days = Number(valueOf(args, '--active-days') ?? DEFAULT_ACTIVE_DAYS);
  const view = args.includes('--all') || !args.includes('--here')
    ? await fleetCoverage({ activeDays: days })
    : { projects: [await repoCoverage(currentRepo())] };
  if (args.includes('--json')) { console.log(JSON.stringify(view, null, 2)); return; }
  for (const p of view.projects) {
    const mark = p.covered ? 'ok  ' : p.active === false ? 'idle' : 'MISS';
    console.log(`${mark} ${(p.name || p.path || p.repo || '').padEnd(30)} ${String(p.state).padEnd(12)} gates=${p.gates?.length ?? 0} report=${p.report ? `${p.report.status}${p.report.ageDays === null ? '' : ` ${p.report.ageDays}d`}` : '-'}`);
  }
  if (view.total !== undefined) console.log(`\n${view.active} active of ${view.total}; ${view.uncovered} without gates, active without gates: ${view.uncoveredActive.length ? view.uncoveredActive.join(', ') : 'none'}`);
}

function fail(message, exitCode) {
  console.error(message);
  process.exitCode = exitCode;
}

export async function run(argv = []) {
  const args = argv.slice(3);
  const [verb, ...rest] = args;

  if (verb === 'snapshot') {
    try {
      const { default: snapshot } = await import('./commands/snapshot.mjs');
      const r = snapshot(rest);
      console.log(rest.includes('--json') ? JSON.stringify(r) : `${r.dryRun ? 'Would copy' : 'Copied'} ${r.files} files${r.node ? ` to ${r.node}:${r.dest} (manifest sha256 ${r.manifestSha256})` : ''}${r.warnings.length ? `\n  ${r.warnings.join('\n  ')}` : ''}`);
    } catch (err) {
      fail(err.message, 1);
    }
    return;
  }

  if (verb === 'report') {
    try {
      if (rest.includes('--help') || rest.includes('-h')) {
        console.log('Usage: total-recall code-quality report [worst|type|file|count|raw|json|--json|--review-diagnostics [--json]]');
        return;
      }
      if (wantsStructuredReport(rest)) {
        process.exitCode = (await printCachedReport(rest, path.join(findSkillDir(), 'reports', 'latest.json'))) || undefined;
        return;
      }
      const { exitCode } = runCore('report.mjs', rest);
      if (exitCode) process.exitCode = exitCode;
    } catch (err) {
      fail(err.message, err.exitCode || 1);
    }
    return;
  }

  if (verb === 'ensure') {
    if (rest.includes('--help') || rest.includes('-h')) { console.log('Usage: total-recall code-quality ensure [--repo <path>]… [--all [--active-days N]] [--dry-run] [--json]\nSets up gates where there are none. Never overwrites a list. --all covers registered active project brains.'); return; }
    try { await ensureVerb(rest); } catch (err) { fail(err.message, err.exitCode || 1); }
    return;
  }

  if (verb === 'coverage') {
    if (rest.includes('--help') || rest.includes('-h')) { console.log('Usage: total-recall code-quality coverage [--all | --here] [--active-days N] [--json]\nWhich repositories have gates and how old their last reports are.'); return; }
    try { await coverageVerb(rest); } catch (err) { fail(err.message, err.exitCode || 1); }
    return;
  }

  if (verb === 'gate-status') {
    try {
      const status = await gateStatus(currentRepo());
      console.log(rest.includes('--json') ? JSON.stringify(status) : status.summary);
    } catch (err) {
      const status = { ok: false, outstanding: 0, summary: `gate status unavailable: ${err.message}` };
      console.log(rest.includes('--json') ? JSON.stringify(status) : status.summary);
    }
    return;
  }

  if (verb === 'plugin-check') {
    if (rest.includes('--help') || rest.includes('-h')) { console.log('Usage: total-recall code-quality plugin-check [--json]\nValidate the plugin in this repository: manifest, referenced files, UI blocks and versions.'); return; }
    try {
      const result = await checkPlugin(process.cwd());
      if (rest.includes('--json')) console.log(JSON.stringify(result));
      else console.log(formatPluginCheck(result) || 'Plugin check passed.');
      if (!result.ok) process.exitCode = 1;
    } catch (err) { fail(err.message, err.exitCode || 2); }
    return;
  }

  if (verb === 'run') {
    const usage = RUN_USAGE;
    if (rest.includes('--help') || rest.includes('-h')) { console.log(usage); return; }
    const json = rest.includes('--json');
    const repoArg = valueOf(rest, '--repo');
    const options = rest.filter((arg, i) => arg !== '--json' && arg !== '--repo' && rest[i - 1] !== '--repo');
    const tier = options.length ? options[1] : 'fast';
    const emitFailure = (exitCode, error) => {
      if (json) console.log(JSON.stringify({ ok: false, exitCode, error }));
      else console.error(error);
      process.exitCode = exitCode;
    };
    if ((options.length && (options.length !== 2 || options[0] !== '--tier')) || !['fast', 'full'].includes(tier)) {
      return emitFailure(2, usage);
    }
    try {
      const { exitCode } = runCore('check.mjs', ['--tier', tier], { quiet: json, ...(repoArg ? { cwd: path.resolve(repoArg) } : {}) });
      if (json) console.log(JSON.stringify({ ok: exitCode === 0, exitCode, tier, ...(repoArg ? { repo: path.resolve(repoArg) } : {}) }));
      if (exitCode) process.exitCode = exitCode;
    } catch (error) { emitFailure(error.exitCode || 1, error.message); }
    return;
  }

  const moduleUrl = skillConfigModule();
  if (!moduleUrl) {
    return fail('Run this through the total-recall CLI: config verbs need a Total Recall install with skill config support.', 2);
  }
  const skillDir = findSkillDir();
  const repoRoot = path.resolve(skillDir, '..', '..', '..');
  const { runSkillConfig } = await import(moduleUrl);
  const configArgs = SHORTHAND.has(verb) ? ['config', ...args] : args;
  const result = await runSkillConfig('code-quality', configArgs, { repoRoot, prefix: 'total-recall code-quality', coreDir: CORE_DIR });
  if (!verb || verb === 'help' || args.includes('--help')) console.log('  total-recall code-quality report [worst [skip]|type|file <pattern>|count|raw <checkId>]');
  return result;
}
