/**
 * Audit and remove per-repository copies of the shared default plugins.
 *
 * One shared plugin folder per machine is the design; copies inside repositories
 * are leftovers from an earlier release that put the nine defaults in every
 * brain. A copy is only proposed for removal when it matches the shared install,
 * so a copy carrying local edits is reported and left alone.
 */
import fs from 'node:fs';
import path from 'node:path';
import { auditProjectPluginCopies } from '../../core/required-plugins.mjs';
import { globalPluginsDir } from '../../core/plugin-loader.mjs';

export function pluginCopyRows(projectRoot = process.cwd(), { sharedDir = globalPluginsDir() } = {}) {
  const audit = auditProjectPluginCopies(projectRoot, { sharedDir });
  return {
    root: projectRoot,
    sharedDir,
    count: audit.count,
    removable: audit.copies.filter(copy => copy.edited === false).map(copy => copy.id),
    edited: audit.copies.filter(copy => copy.edited === true).map(copy => copy.id),
    unverified: audit.copies.filter(copy => copy.edited === null).map(copy => copy.id),
    copies: audit.copies
  };
}

export function removePluginCopies(projectRoot, ids) {
  const removed = [];
  const failed = [];
  for (const id of ids) {
    const dir = path.join(projectRoot, '.agent', 'skills', 'total-recall', 'plugins', id);
    try {
      fs.rmSync(dir, { recursive: true, force: true });
      removed.push(id);
    } catch (error) {
      failed.push({ id, error: error.message });
    }
  }
  return { removed, failed };
}

export async function manageProjectPluginCopies(args = []) {
  const json = args.includes('--json');
  const apply = args.includes('--apply');
  const roots = args.filter(argument => !argument.startsWith('-'));
  const root = roots[0] || process.cwd();
  const report = pluginCopyRows(root);
  if (apply) {
    report.removal = removePluginCopies(root, report.removable);
  }
  if (json) {
    console.log(JSON.stringify(report, null, 2));
    return;
  }
  console.log(`\n📦 Per-repository copies of shared plugins in ${report.root}\n`);
  if (report.count === 0) {
    console.log('  None — this repository resolves the shared folder directly.\n');
    return;
  }
  for (const copy of report.copies) {
    const verdict = copy.edited === false ? 'identical to the shared install' : copy.edited === true ? 'DIFFERS from the shared install' : 'no shared install to compare';
    console.log(`  ${copy.id} v${copy.version || '?'} (shared: v${copy.sharedVersion || '—'}) — ${verdict}`);
  }
  console.log(`\n  ${report.removable.length} removable, ${report.edited.length} edited, ${report.unverified.length} unverified`);
  if (report.removal) console.log(`  Removed: ${report.removal.removed.join(', ') || 'none'}${report.removal.failed.length ? `; failed: ${report.removal.failed.map(row => row.id).join(', ')}` : ''}`);
  else if (report.removable.length) console.log('  Re-run with --apply to remove the identical copies.');
  console.log();
}
