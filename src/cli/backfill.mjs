import path from 'node:path';
import fs from 'node:fs';
import { analyzeVault, backfillVault } from '../core/vault-backfill.mjs';
import { brainDir, resolveBrainLayer } from '../core/config.mjs';

function usage() {
  console.log(`
  total-recall backfill [options]

  Bring historical vault nodes up to the current SSSS contract.

  Most nodes in a long-lived vault predate the schema they are validated
  against. This reports exactly which fields the contract would add, and only
  writes when you ask it to.

  Options:
    --apply           Repair the vault (default is a dry run)
    --vault <path>    Vault to inspect (default: the active brain's vault)
    --all             Every registered project vault plus the global vault
    --limit <n>       Repair at most n nodes (use to rehearse on a small batch)
    --no-snapshot     Skip the pre-apply snapshot (not recommended)
    --verbose         List each node instead of only the summary

  Examples:
    total-recall backfill
    total-recall backfill --apply --limit 25
    total-recall backfill --all --apply
`);
}

function summarize(report, verbose) {
  const pct = report.total ? ((report.valid / report.total) * 100).toFixed(1) : '100.0';
  console.log(`\n  ${report.vaultDir.replace(process.env.HOME || '~', '~')}`);
  console.log(`    ${report.valid}/${report.total} valid on disk (${pct}%)  ·  ${report.invalid} need repair`);
  if (report.invalid) {
    console.log(`    ${report.repairable} of those this run can fix; ${report.unfixable.length} it cannot.`);
  }

  if (report.unreadable.length) {
    console.log(`    ${report.unreadable.length} unreadable (left untouched):`);
    for (const u of report.unreadable.slice(0, 5)) console.log(`      ${u}`);
  }

  const fields = Object.entries(report.fieldCounts).sort((a, b) => b[1] - a[1]);
  if (fields.length) {
    console.log('    Fields the contract would add:');
    for (const [field, count] of fields.slice(0, 12)) {
      console.log(`      ${String(count).padStart(6)}  ${field}`);
    }
  }

  const shapes = Object.entries(report.shapeRepairs || {}).sort((a, b) => b[1] - a[1]);
  if (shapes.length) {
    console.log('    Wrong-typed fields it would repair in place:');
    for (const [field, count] of shapes) {
      console.log(`      ${String(count).padStart(6)}  ${field}`);
    }
  }

  if (report.unfixable?.length) {
    console.log(`    Cannot be expressed by the contract (left untouched):`);
    for (const u of report.unfixable.slice(0, 8)) {
      console.log(`      ${u.file.replace(process.env.HOME || '~', '~')}`);
      console.log(`        ${u.errors.join('; ').slice(0, 150)}`);
    }
  }

  const errors = Object.entries(report.errorCounts).sort((a, b) => b[1] - a[1]);
  if (errors.length) {
    console.log('    Why they fail today:');
    for (const [err, count] of errors.slice(0, 8)) {
      console.log(`      ${String(count).padStart(6)}  ${err}`);
    }
  }

  if (verbose) {
    for (const node of report.nodes.slice(0, 200)) {
      console.log(`      ${node.file}`);
      console.log(`        + ${Object.keys(node.added).join(', ') || '(none)'}`);
      const changed = Object.keys(node.changed);
      if (changed.length) console.log(`        ~ ${changed.join(', ')}`);
    }
  }
}

function collectVaults(args) {
  const explicit = args.indexOf('--vault');
  if (explicit !== -1 && args[explicit + 1]) {
    return [path.resolve(args[explicit + 1])];
  }

  if (!args.includes('--all')) {
    return [path.join(resolveBrainLayer().brainDir, 'memory-vault')];
  }

  const vaults = [path.join(brainDir, 'memory-vault')];
  const registryPath = path.join(brainDir, 'config', 'project-registry.json');
  if (fs.existsSync(registryPath)) {
    try {
      const registry = JSON.parse(fs.readFileSync(registryPath, 'utf8'));
      const entries = Array.isArray(registry) ? registry : (registry.projects || []);
      for (const entry of entries) {
        const root = typeof entry === 'string' ? entry : (entry.path || entry.root);
        if (!root) continue;
        const candidate = path.join(root, '.agent', 'skills', 'total-recall', 'memory-vault');
        if (fs.existsSync(candidate) && !vaults.includes(candidate)) vaults.push(candidate);
      }
    } catch (err) {
      console.error(`  ! Could not read project registry: ${err.message}`);
    }
  }
  return vaults;
}

export default async function backfill(args = []) {
  if (args.includes('--help') || args.includes('-h')) return usage();

  const apply = args.includes('--apply');
  const verbose = args.includes('--verbose');
  const snapshot = !args.includes('--no-snapshot');
  const limitIndex = args.indexOf('--limit');
  const limit = limitIndex !== -1 && args[limitIndex + 1]
    ? parseInt(args[limitIndex + 1], 10)
    : Infinity;

  const vaults = collectVaults(args);
  console.log(apply
    ? `\n  Backfilling ${vaults.length} vault(s) through the SSSS Core Contract.`
    : `\n  Dry run over ${vaults.length} vault(s) — nothing will be written.`);

  let totalNodes = 0;
  let totalValid = 0;
  let totalRepaired = 0;
  const allFailed = [];

  for (const vaultDir of vaults) {
    if (!fs.existsSync(vaultDir)) {
      console.log(`\n  (skipped, not found) ${vaultDir}`);
      continue;
    }

    if (!apply) {
      const report = await analyzeVault(vaultDir);
      summarize(report, verbose);
      totalNodes += report.total;
      totalValid += report.valid;
      continue;
    }

    const result = await backfillVault(vaultDir, { snapshot, limit });
    summarize(result, verbose);
    if (result.snapshotId) {
      console.log(`    snapshot: ${result.snapshotId}  (total-recall snapshot rollback ${result.snapshotId})`);
    }
    console.log(`    repaired: ${result.repaired}`);
    if (result.failed.length) {
      console.log(`    still failing: ${result.failed.length} (left untouched)`);
      for (const f of result.failed.slice(0, 5)) {
        console.log(`      ${f.file}: ${f.errors.join('; ').slice(0, 140)}`);
      }
    }
    totalNodes += result.total;
    totalValid += result.valid;
    totalRepaired += result.repaired;
    allFailed.push(...result.failed);
  }

  const pct = totalNodes ? ((totalValid / totalNodes) * 100).toFixed(1) : '100.0';
  console.log(`\n  ${totalValid}/${totalNodes} valid before this run (${pct}%)`);
  if (apply) {
    console.log(`  ${totalRepaired} repaired, ${allFailed.length} still failing.`);
    console.log('  Re-run without --apply to confirm the new state.\n');
  } else {
    console.log('  Re-run with --apply to repair. A snapshot is taken first.\n');
  }
}
