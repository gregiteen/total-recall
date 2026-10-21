/**
 * `total-recall code-quality <verb>` for the repository you run it from.
 *
 *   report [view] [arg]      read the latest gate report; never starts a check
 *   snapshot --node <name>   put the exact source under test on the test node (git file list only)
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
      const { exitCode } = runCore('report.mjs', rest);
      if (exitCode) process.exitCode = exitCode;
    } catch (err) {
      fail(err.message, err.exitCode || 1);
    }
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
