/**
 * Audit and remove per-repository copies of the shared default plugins.
 *
 * One shared plugin folder per machine is the design; copies inside repositories
 * are leftovers from an earlier release that put the nine defaults in every
 * brain. Only copies matching the bundled source can be deleted. The operator
 * can explicitly archive older differing copies to use the shared versions.
 */
import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { auditProjectPluginCopies } from '../../core/required-plugins.mjs';
import { globalPluginsDir } from '../../core/plugin-loader.mjs';
import { recompileAfterPluginMutation, replacementArchiveDir } from '../../core/plugin-store.mjs';

export function pluginCopyRows(projectRoot = process.cwd(), { sharedDir = globalPluginsDir() } = {}) {
  const audit = auditProjectPluginCopies(projectRoot, { sharedDir });
  return {
    root: projectRoot,
    sharedDir,
    count: audit.count,
    removable: audit.copies.filter(copy => copy.edited === false && copy.sharedDir && !copy.linked).map(copy => copy.id),
    archivable: audit.copies.filter(copy => copy.stale && copy.edited !== false && !copy.linked).map(copy => copy.id),
    edited: audit.copies.filter(copy => copy.edited === true && copy.stale !== true).map(copy => copy.id),
    stale: audit.copies.filter(copy => copy.stale === true).map(copy => copy.id),
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

function archivePluginCopies(copies) {
  const archived = [];
  const failed = [];
  for (const copy of copies) {
    try {
      if (!fs.lstatSync(copy.dir).isDirectory()) throw new Error('Expected a local plugin directory');
      const archiveDir = replacementArchiveDir(path.dirname(copy.dir));
      fs.mkdirSync(archiveDir, { recursive: true, mode: 0o700 });
      const archive = path.join(archiveDir, `${copy.id}-${randomUUID()}`);
      fs.renameSync(copy.dir, archive);
      archived.push({ id: copy.id, archive });
    } catch (error) {
      failed.push({ id: copy.id, error: error.message });
    }
  }
  return { archived, failed };
}

export async function manageProjectPluginCopies(args = []) {
  const json = args.includes('--json');
  const apply = args.includes('--apply');
  const archiveStale = args.includes('--archive-stale');
  const roots = args.filter(argument => !argument.startsWith('-'));
  const root = roots[0] || process.cwd();
  const report = pluginCopyRows(root);
  if (apply) {
    report.removal = removePluginCopies(root, report.removable);
    if (archiveStale) report.archival = archivePluginCopies(report.copies.filter(copy => report.archivable.includes(copy.id)));
    if (report.removal.removed.length || report.archival?.archived.length) {
      report.compilation = await recompileAfterPluginMutation(root);
    }
    if (report.removal.failed.length || report.archival?.failed.length || report.compilation?.ok === false) process.exitCode = 1;
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
    const verdict = copy.linked ? 'linked checkout'
      : copy.stale === true ? 'STALE — older than the shared install and shadows it'
      : copy.edited === false ? 'identical to the bundled source'
      : copy.edited === true ? 'DIFFERS from the shared install' : 'no shared install to compare';
    console.log(`  ${copy.id} v${copy.version || '?'} (shared: v${copy.sharedVersion || '—'}) — ${verdict}`);
  }
  console.log(`\n  ${report.removable.length} removable, ${report.archivable.length} archivable, ${report.edited.length} edited, ${report.unverified.length} unverified`);
  if (report.removal) console.log(`  Removed: ${report.removal.removed.join(', ') || 'none'}${report.removal.failed.length ? `; failed: ${report.removal.failed.map(row => row.id).join(', ')}` : ''}`);
  else if (report.removable.length) console.log('  Re-run with --apply to remove the removable copies.');
  if (report.archival) {
    for (const entry of report.archival.archived) console.log(`  Archived ${entry.id} at ${entry.archive}`);
    for (const entry of report.archival.failed) console.error(`  Could not archive ${entry.id}: ${entry.error}`);
  } else if (report.archivable.length) console.log('  Re-run with --archive-stale --apply to preserve stale copies in the replacement archive.');
  if (report.compilation?.ok === false) console.error(`  Plugin surfaces failed to compile: ${report.compilation.error}`);
  console.log();
}
