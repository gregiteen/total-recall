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
    --help, -h                Show this help
  `);
}

export async function runOpenWikiIngest(args = []) {
  let openwikiPath = null;
  let dryRun = false;
  let layerFlag = '--project';
  let help = false;

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

  if (help || !openwikiPath) {
    printHelp();
    return { ok: true, imported: 0, errors: 0 };
  }

  if (openwikiPath && !fs.existsSync(openwikiPath)) {
    console.error(`Error: OpenWiki directory not found at ${openwikiPath}`);
    process.exitCode = 1;
    return { ok: false, error: `Directory not found: ${openwikiPath}` };
  }

  console.log(`\n  Importing OpenWiki from: ${openwikiPath}`);
  console.log(`  Target Brain: ${layerFlag.replace('--', '')}`);
  if (dryRun) console.log('  DRY RUN: No actual writes will be committed.\n');

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
        console.log(`  [DRY RUN] Would import: ${slug} ("${title}")`);
        imported++;
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
        console.log(`  Imported: ${slug}`);
        imported++;
      } else {
        console.error(`  Error importing ${slug}: ${result.stderr}`);
        errors++;
      }
    } catch (err) {
      console.error(`  Exception on ${file}: ${err.message}`);
      errors++;
    }
  }

  console.log(`\n  Import Summary:`);
  console.log(`  Imported: ${imported} files`);
  console.log(`  Errors:   ${errors} files`);

  if (!dryRun && imported > 0) {
    console.log(`\n  OpenWiki knowledge graph successfully indexed into Total Recall.`);
  }

  return { ok: errors === 0, imported, errors };
}

export default runOpenWikiIngest;
