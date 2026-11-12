/**
 * Audit and remove plugin installs inside a repository.
 *
 * Nothing is installed per repository: every plugin lives in the one shared
 * folder and a repository only switches it on or off. Entries found in a
 * repository are leftovers. Copies matching the bundled source are deleted;
 * older differing copies can be archived on request; shadow links (to a plugin
 * the shared folder installs, or any linked default) are removed as links only.
 * A repository-only plugin is reported until it is installed in the shared folder.
 */
import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { auditProjectPluginCopies } from '../../core/required-plugins.mjs';
import { globalPluginsDir, projectPluginsDir, vaultForPluginsDir } from '../../core/plugin-loader.mjs';
import { recompileAfterPluginMutation, replacementArchiveDir, recordPath } from '../../core/plugin-store.mjs';
import { findVfsDocumentByPath } from '../../core/vfs-documents.mjs';
import { deleteVfsDocument } from '../../core/ssss-operation-service.mjs';

export function pluginCopyRows(projectRoot = process.cwd(), { sharedDir = globalPluginsDir() } = {}) {
  const audit = auditProjectPluginCopies(projectRoot, { sharedDir });
  return {
    root: projectRoot,
    sharedDir,
    count: audit.count,
    removable: audit.copies.filter(copy => (copy.edited === false && copy.sharedDir && !copy.linked) || copy.shadow).map(copy => copy.id),
    shadows: audit.copies.filter(copy => copy.shadow).map(copy => copy.id),
    repoOnly: audit.copies.filter(copy => copy.repoOnly).map(copy => copy.id),
    archivable: audit.copies.filter(copy => copy.stale && copy.edited !== false && !copy.linked).map(copy => copy.id),
    edited: audit.copies.filter(copy => copy.edited === true && copy.stale !== true).map(copy => copy.id),
    stale: audit.copies.filter(copy => copy.stale === true).map(copy => copy.id),
    unverified: audit.copies.filter(copy => copy.edited === null).map(copy => copy.id),
    copies: audit.copies
  };
}

/**
 * Install records in this repository's brain for plugins that exist neither in
 * the repository nor in the shared folder. They describe a repository install
 * that is gone, so no on/off overlay is lost by removing them.
 */
export function orphanRecordIds(projectRoot, { sharedDir = globalPluginsDir() } = {}) {
  const vaultRoot = vaultForPluginsDir(projectPluginsDir(projectRoot));
  const dir = path.join(vaultRoot, 'system', 'plugins');
  let files = [];
  try { files = fs.readdirSync(dir).filter(name => name.endsWith('.md')); } catch { return []; }
  return files.map(name => name.slice(0, -3)).filter(id => {
    if (fs.existsSync(path.join(projectPluginsDir(projectRoot), id))) return false;
    if (fs.existsSync(path.join(sharedDir, id))) return false;
    const record = findVfsDocumentByPath(recordPath(id), vaultRoot);
    return record?.frontmatter?.type === 'plugin_record' && record.frontmatter.source?.kind !== 'shared';
  });
}

async function removeOrphanRecords(projectRoot, ids) {
  const vaultRoot = vaultForPluginsDir(projectPluginsDir(projectRoot));
  const removed = [];
  const failed = [];
  for (const id of ids) {
    try {
      await deleteVfsDocument(recordPath(id), { actorRole: 'system', intent: `Remove repository install record ${id}`, vaultRoot });
      removed.push(id);
    } catch (error) {
      failed.push({ id, error: error.message });
    }
  }
  return { removed, failed };
}

export function removePluginCopies(projectRoot, ids) {
  const removed = [];
  const failed = [];
  for (const id of ids) {
    const dir = path.join(projectRoot, '.agent', 'skills', 'total-recall', 'plugins', id);
    try {
      // A link is removed by itself: its target checkout and this repository's
      // plugin records (including on/off overlays) are left untouched.
      if (fs.lstatSync(dir).isSymbolicLink()) fs.unlinkSync(dir);
      else fs.rmSync(dir, { recursive: true, force: true });
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
  const dropRepoOnly = args.includes('--drop-repo-only');
  const roots = args.filter(argument => !argument.startsWith('-'));
  const root = roots[0] || process.cwd();
  const report = pluginCopyRows(root);
  if (apply) {
    report.removal = removePluginCopies(root, dropRepoOnly ? [...new Set([...report.removable, ...report.repoOnly])] : report.removable);
    report.records = await removeOrphanRecords(root, orphanRecordIds(root, { sharedDir: report.sharedDir }));
    if (archiveStale) report.archival = archivePluginCopies(report.copies.filter(copy => report.archivable.includes(copy.id)));
    if (report.removal.removed.length || report.records.removed.length || report.archival?.archived.length) {
      report.compilation = await recompileAfterPluginMutation(root);
    }
    if (report.removal.failed.length || report.records.failed.length || report.archival?.failed.length || report.compilation?.ok === false) process.exitCode = 1;
  }
  if (!apply) report.orphanRecords = orphanRecordIds(root, { sharedDir: report.sharedDir });
  if (json) {
    console.log(JSON.stringify(report, null, 2));
    return;
  }
  console.log(`\n📦 Plugin installs inside ${report.root} (all plugins belong in the shared folder)\n`);
  const records = report.records?.removed || report.orphanRecords || [];
  if (records.length) console.log(`  ${report.records ? 'Removed' : 'Leftover'} install records for plugins installed nowhere: ${records.join(', ')}${report.records ? '' : ' (re-run with --apply)'}`);
  if (report.records?.failed.length) console.error(`  Could not remove records: ${report.records.failed.map(row => row.id).join(', ')}`);
  if (report.count === 0) {
    console.log('  None — this repository resolves the shared folder directly.\n');
    return;
  }
  for (const copy of report.copies) {
    const verdict = copy.repoOnly ? `REPOSITORY-ONLY install${copy.target ? ` (link to ${copy.target})` : ''} — install it in the shared folder (plugin install <source>), or delete it with --apply --drop-repo-only`
      : copy.shadow ? `SHADOW link to ${copy.target} — shadows the shared install`
      : copy.linked ? 'linked checkout'
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
