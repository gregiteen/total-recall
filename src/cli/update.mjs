/**
 * total-recall update — check / install total-recall-brain on registered projects.
 *
 * Usage:
 *   npx total-recall update              # check only
 *   npx total-recall update --apply      # install latest where needed
 *   npx total-recall update --apply --force
 *   npx total-recall update --repo /path/to/app
 *   npx total-recall update --install-autopull [--port N] [--no-build]
 */

import {
  runPackageAutoUpdate,
  fetchLatestNpmVersion,
  isPackageAutoUpdateEnabled,
  PACKAGE_NAME,
} from '../core/package-auto-update.mjs';
import { brainDir } from '../core/config.mjs';
import { installAutoPull } from '../core/autopull-install.mjs';
import { updateAllBrains } from '../core/brain-updates.mjs';
import { automaticUpdateStatus, runAutomaticBrainUpdates } from '../core/automatic-brain-updates.mjs';

/** @param {string[]} args */
export function parseArgs(args) {
  const opts = {
    apply: false,
    force: false,
    dryRun: false,
    help: false,
    repos: [],
    installAutopull: false,
    port: null,
    noBuild: false,
    allBrains: false,
    json: false,
    automatic: false,
    status: false,
    localOnly: false,
  };
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--help' || a === '-h') opts.help = true;
    else if (a === '--apply' || a === '--install') opts.apply = true;
    else if (a === '--force') opts.force = true;
    else if (a === '--dry-run') opts.dryRun = true;
    else if (a === '--repo' && args[i + 1]) opts.repos.push(args[++i]);
    else if (a === '--install-autopull') opts.installAutopull = true;
    else if (a === '--port' && args[i + 1]) opts.port = Number(args[++i]);
    else if (a === '--no-build') opts.noBuild = true;
    else if (a === '--all-brains') opts.allBrains = true;
    else if (a === '--json') opts.json = true;
    else if (a === '--automatic') opts.automatic = true;
    else if (a === '--status') opts.status = true;
    else if (a === '--local-only') opts.localOnly = true;
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
    total-recall update --all-brains    Plan SSSS + Total Recall updates, including plugins/nested packages
    total-recall update --all-brains --apply [--json]
        Pin the same published versions, use npm/pnpm, replace shared dependency
        links with independent local installs, and verify every resolved version.
    total-recall update --automatic [--json]
        Daemon maintenance: update both packages, ensure defaults and refresh surfaces.
    total-recall update --status [--json]
        Read the actual last automatic maintenance report without starting work.

  This brain's own checkout (git):
    total-recall update --install-autopull [--port N] [--no-build] [--dry-run]
        Every 5 minutes fast-forward this checkout to origin/main, install and
        rebuild what changed, restart the brain and verify /health reports the
        new version (scripts/auto-pull.sh). macOS: LaunchAgent
        com.totalrecall.autopull; Linux: crontab. A dev checkout (other branch,
        uncommitted or unpushed work) is never touched. --no-build: never build
        the dashboard on this host (laptops).

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

  if(opts.status){const status=automaticUpdateStatus(brainDir);console.log(JSON.stringify(status,null,2));return status;}
  if(opts.automatic){
    const report=await runAutomaticBrainUpdates({brainDir,force:opts.force,fleet:!opts.localOnly});
    console.log(JSON.stringify(report,null,2));
    if(report.failed)process.exitCode=1;
    return report;
  }

  if (opts.allBrains) {
    const summary = await updateAllBrains({ brainDir, roots: opts.repos,
      dryRun: !opts.apply || opts.dryRun, ensureDefaults: true });
    if (summary.failed) process.exitCode = 1;
    if (opts.json) console.log(JSON.stringify(summary, null, 2));
    else {
      console.log(`\n  Uniform brain updates: ${summary.consumer_count || 0} consumers`);
      if (summary.reason) console.log(`  ${summary.reason}`);
      for (const row of summary.results) {
        console.log(`  ${row.root}: ${row.status}`);
        for (const pkg of row.packages || []) console.log(`    ${pkg.key}: ${pkg.installed || 'missing'} → ${pkg.latest}`);
        if (row.error) console.log(`    ${row.error}`);
      }
    }
    return summary;
  }

  if (opts.installAutopull) {
    const result = installAutoPull({ port: opts.port || undefined, noBuild: opts.noBuild, dryRun: opts.dryRun });
    if (opts.dryRun) {
      console.log(JSON.stringify(result, null, 2));
      return;
    }
    const where = result.plistPath ? `LaunchAgent ${result.plistPath}` : `crontab: ${result.cronLine}`;
    console.log(`\n  ✅ Auto-pull installed (${where}), checking port ${result.port} every 5 minutes.`);
    console.log('  Log: ~/.agent/logs/auto-pull.log\n');
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
  if (summary.failed > 0 || summary.reason === 'npm-view-failed') process.exitCode = 1;

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
          : r.status === 'preview_features'
            ? '◇'
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
