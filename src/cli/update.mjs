/**
 * total-recall update — check / install total-recall-brain on registered projects.
 *
 * Usage:
 *   npx total-recall update              # check only
 *   npx total-recall update --apply      # install latest where needed
 *   npx total-recall update --apply --force
 *   npx total-recall update --repo /path/to/app
 */

import {
  runPackageAutoUpdate,
  fetchLatestNpmVersion,
  isPackageAutoUpdateEnabled,
  PACKAGE_NAME,
} from '../core/package-auto-update.mjs';
import { brainDir } from '../core/config.mjs';

/** @param {string[]} args */
export function parseArgs(args) {
  const opts = {
    apply: false,
    force: false,
    dryRun: false,
    help: false,
    repos: [],
  };
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--help' || a === '-h') opts.help = true;
    else if (a === '--apply' || a === '--install') opts.apply = true;
    else if (a === '--force') opts.force = true;
    else if (a === '--dry-run') opts.dryRun = true;
    else if (a === '--repo' && args[i + 1]) opts.repos.push(args[++i]);
  }
  return opts;
}

function printHelp() {
  console.log(`
  total-recall update — Auto-download ${PACKAGE_NAME} for registered projects

  Roots: project-registry + TR_SYNC_REPOS + --repo (never hardcodes product paths)

  Usage:
    total-recall update                 Report status (dry)
    total-recall update --apply         npm install latest where behind
    total-recall update --apply --force Ignore throttle / disabled flag
    total-recall update --repo <path>   Include extra root (repeatable)

  Env:
    TR_AUTO_UPDATE_PACKAGE=0   Disable daemon cron auto-update (default: on)
    TR_SYNC_REPOS=/a:/b       Extra project roots

  Source monorepos named ${PACKAGE_NAME} are skipped (use git, not npm into self).
`);
}

export default async function update(args = []) {
  const opts = parseArgs(args);
  if (opts.help) {
    printHelp();
    return;
  }

  const latest = fetchLatestNpmVersion();
  console.log(`\n  Package: ${PACKAGE_NAME}`);
  console.log(`  Latest on npm: ${latest || '(unavailable)'}`);
  console.log(`  Auto-update (daemon): ${isPackageAutoUpdateEnabled() ? 'enabled' : 'disabled'}`);

  const dryRun = !opts.apply || opts.dryRun;
  const summary = await runPackageAutoUpdate({
    brainDir,
    roots: opts.repos.length ? opts.repos : undefined,
    dryRun,
    force: opts.force || opts.apply,
    skipThrottle: opts.apply || opts.force,
    save: true,
  });

  if (summary.skipped) {
    console.log(`\n  Skipped: ${summary.reason}`);
    if (summary.next_check_in_ms) {
      console.log(`  Next check in ~${Math.ceil(summary.next_check_in_ms / 60000)} min`);
    }
  }

  const results = summary.results || [];
  if (!results.length) {
    console.log('\n  No project roots found. Track repos with:');
    console.log('    npx total-recall skill track /path/to/repo');
    console.log('    # or set TR_SYNC_REPOS\n');
    return;
  }

  console.log(`\n  Projects (${results.length}):`);
  for (const r of results) {
    const inst = r.installed || '—';
    const mark =
      r.status === 'updated' || r.status === 'would_update'
        ? '↑'
        : r.status === 'up_to_date'
          ? '✓'
          : r.status === 'failed'
            ? '✗'
            : '·';
    console.log(`    ${mark} ${r.name}: ${inst} → ${r.latest || latest}  [${r.status}]`);
    if (r.error) console.log(`        error: ${r.error}`);
  }

  if (dryRun && results.some((r) => r.status === 'would_update')) {
    console.log('\n  Run with --apply to install updates.\n');
  } else {
    console.log('');
  }
}
