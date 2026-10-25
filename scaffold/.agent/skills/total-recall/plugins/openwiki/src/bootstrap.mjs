/** Plugin-owned, create-only documentation bootstrap. No host runtime required. */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const templatesDir = fileURLToPath(new URL('../templates/openwiki/', import.meta.url));

function requireAbsolute(value, label) {
  if (typeof value !== 'string' || !value || !path.isAbsolute(value)) throw new Error(`${label} must be an absolute directory path`);
  return path.resolve(value);
}

function inspectDirectory(directory) {
  const stat = fs.lstatSync(directory, { throwIfNoEntry: false });
  if (stat && (stat.isSymbolicLink() || !stat.isDirectory())) throw new Error(`Unsafe documentation directory: ${directory}`);
}

function inspectTarget(root) {
  inspectDirectory(root);
  const directory = path.join(root, 'openwiki');
  inspectDirectory(directory);
  return directory;
}

/** Preserve every existing page; filesystem projections are not canonical memory. */
export function bootstrapOpenWiki({ brain, projectRoot = null, dryRun = false } = {}) {
  const brainRoot = requireAbsolute(brain, '--brain');
  const project = projectRoot === null ? null : requireAbsolute(projectRoot, '--project-root');
  const roots = [...new Set([brainRoot, ...(project ? [project] : [])])];
  const directories = roots.map(inspectTarget);
  const templates = fs.readdirSync(templatesDir, { withFileTypes: true })
    .sort((a, b) => a.name.localeCompare(b.name));
  if (!templates.length || templates.some(entry => !entry.isFile() || !entry.name.endsWith('.md'))) {
    throw new Error('OpenWiki documentation templates are missing or invalid');
  }

  // Validate every destination before creating any directory or page.
  for (const directory of directories) for (const entry of templates) {
    const destination = path.join(directory, entry.name);
    const stat = fs.lstatSync(destination, { throwIfNoEntry: false });
    if (stat && !stat.isFile() && !stat.isSymbolicLink()) throw new Error(`Documentation page is not a file: ${destination}`);
  }

  const targets = directories.map(directory => {
    const created = [], preserved = [], planned = [];
    if (!dryRun) fs.mkdirSync(directory, { recursive: true });
    for (const entry of templates) {
      const destination = path.join(directory, entry.name);
      if (fs.lstatSync(destination, { throwIfNoEntry: false })) {
        preserved.push(entry.name);
        continue;
      }
      if (dryRun) { planned.push(entry.name); continue; }
      try {
        fs.copyFileSync(path.join(templatesDir, entry.name), destination, fs.constants.COPYFILE_EXCL);
        created.push(entry.name);
      } catch (err) {
        // A concurrently authored page belongs to its author, never the template.
        if (err.code !== 'EEXIST') throw err;
        preserved.push(entry.name);
      }
    }
    return { directory, created, preserved, planned };
  });
  return { ok: true, dry_run: dryRun, targets,
    files_created: targets.reduce((sum, target) => sum + target.created.length, 0),
    files_preserved: targets.reduce((sum, target) => sum + target.preserved.length, 0),
    files_planned: targets.reduce((sum, target) => sum + target.planned.length, 0) };
}

export async function runBootstrapCommand(args = []) {
  const json = args.includes('--json');
  if (args.includes('--help') || args.includes('-h')) {
    console.log('Usage: total-recall openwiki bootstrap --brain <absolute-directory> [--project-root <absolute-directory>] [--dry-run] [--json]');
    return { ok: true, help: true };
  }
  try {
    const options = {};
    for (let index = 0; index < args.length; index++) {
      const arg = args[index];
      if (arg === '--brain' || arg === '--project-root') {
        const value = args[++index];
        if (!value || value.startsWith('--')) throw new Error(`Missing value for ${arg}`);
        options[arg === '--brain' ? 'brain' : 'projectRoot'] = value;
      } else if (arg === '--dry-run') options.dryRun = true;
      else if (arg !== '--json') throw new Error(`Unknown bootstrap option: ${arg}`);
    }
    const result = bootstrapOpenWiki(options);
    if (json) console.log(JSON.stringify(result));
    else console.log(`OpenWiki: ${result.files_created} pages created, ${result.files_preserved} preserved${result.dry_run ? `, ${result.files_planned} planned (dry run)` : ''}.`);
    return result;
  } catch (err) {
    const result = { ok: false, error: err.message };
    if (json) console.log(JSON.stringify(result));
    console.error(`OpenWiki bootstrap failed: ${err.message}`);
    process.exitCode = 1;
    return result;
  }
}
