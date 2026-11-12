import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const TR_BIN = process.env.TOTAL_RECALL_BIN || 'total-recall';

function printHelp() {
  console.log(`
  Usage:
    total-recall openwiki ingest <openwiki-path> [options]

  Options:
    --dry-run                 Preview import without writing
    --global                  Target the global brain
    --project                 Target the project brain (default)
    --json                    Return a structured import receipt
    --help, -h                Show this help
  `);
}

export async function runOpenWikiIngest(args = []) {
  let openwikiPath = null;
  let dryRun = false;
  let layerFlag = '--project';
  let help = false;
  const json = args.includes('--json');
  const log = message => { if (!json) console.log(message); };
  const warn = message => { if (!json) console.error(message); };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    switch (arg) {
      case '--dry-run': dryRun = true; break;
      case '--global': layerFlag = '--global'; break;
      case '--project': layerFlag = '--project'; break;
      case '--help': case '-h': help = true; break;
      default:
        if (!arg.startsWith('-') && !openwikiPath) {
          openwikiPath = arg;
        }
    }
  }

  if (help || (!json && !openwikiPath)) {
    printHelp();
    return { ok: true, imported: 0, errors: 0 };
  }

  if (!openwikiPath || !fs.statSync(openwikiPath, { throwIfNoEntry: false })?.isDirectory()) {
    const error = 'An existing OpenWiki directory is required';
    warn(error);
    return { ok: false, error };
  }

  log(`\n  Importing OpenWiki from: ${openwikiPath}`);
  log(`  Target Brain: ${layerFlag.replace('--', '')}`);
  if (dryRun) log('  DRY RUN: No actual writes will be committed.\n');

  const mdFiles = [];
  function scanDir(dir) {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.name === 'node_modules' || entry.name === '.git' || entry.name === '.agent') continue;
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        scanDir(fullPath);
      } else if (entry.isFile() && entry.name.endsWith('.md')) {
        mdFiles.push(fullPath);
      }
    }
  }

  scanDir(openwikiPath);

  let imported = 0;
  let planned = 0;
  let errors = 0;

  for (const file of mdFiles) {
    try {
      const content = fs.readFileSync(file, 'utf8');
      let title = path.basename(file, '.md').replace(/[-_]/g, ' ');
      const titleMatch = content.match(/^#\s+(.+)$/m);
      if (titleMatch) {
        title = titleMatch[1].trim();
      }

      const relPath = path.relative(openwikiPath, file);
      const slugBase = relPath.replace(/\.md$/, '').replace(/[^a-zA-Z0-9]+/g, '-').replace(/(^-|-$)/g, '');
      const slug = 'openwiki-' + slugBase.toLowerCase();

      if (dryRun) {
        log(`  [DRY RUN] Would import: ${slug} ("${title}")`);
        planned++;
        continue;
      }

      const cliArgs = [
        'remember', 'fact',
        content,
        '--title', title,
        '--slug', slug,
        '--tags', 'openwiki,architecture,documentation',
        layerFlag
      ];

      const result = spawnSync(TR_BIN, cliArgs, { encoding: 'utf8' });
      if (result.status === 0) {
        log(`  Imported: ${slug}`);
        imported++;
      } else {
        warn(`  Error importing ${slug}: ${result.stderr}`);
        errors++;
      }
    } catch (err) {
      warn(`  Exception on ${file}: ${err.message}`);
      errors++;
    }
  }

  log('\n  Import Summary:');
  log(dryRun ? `  Would import: ${planned} files` : `  Imported: ${imported} files`);
  log(`  Errors:   ${errors} files`);

  if (!dryRun && imported > 0) {
    log('\n  OpenWiki knowledge graph successfully indexed into Total Recall.');
  }

  return { ok: errors === 0, dryRun, imported, planned, errors };
}

export default runOpenWikiIngest;
