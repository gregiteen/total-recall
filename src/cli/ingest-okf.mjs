import fs from 'node:fs';
import path from 'node:path';
import { parseLayerFlag, resolveBrainDir } from './agent-dir.mjs';
import { importBundle } from '../core/okf-adapter.mjs';

export async function runOkfIngest(args) {
  const { layer, remainingArgs } = parseLayerFlag(args);
  
  const opts = {
    bundlePath: null,
    dryRun: false,
    category: null,
    importance: null,
    onConflict: 'warn',
    typeMap: null,
    help: false
  };

  for (let i = 0; i < remainingArgs.length; i++) {
    const arg = remainingArgs[i];
    const val = remainingArgs[i + 1];

    switch (arg) {
      case '--dry-run':
        opts.dryRun = true;
        break;
      case '--category':
        if (val) { opts.category = val; i++; }
        break;
      case '--importance':
        if (val) { opts.importance = parseInt(val, 10); i++; }
        break;
      case '--on-conflict':
        if (val) { opts.onConflict = val; i++; }
        break;
      case '--type-map':
        if (val) {
          const map = {};
          const pairs = val.split(',');
          for (const pair of pairs) {
            const parts = pair.split('=');
            if (parts.length === 2) {
              map[parts[0].trim()] = parts[1].trim();
            }
          }
          opts.typeMap = map;
          i++;
        }
        break;
      case '--help': case '-h':
        opts.help = true;
        break;
      default:
        if (!arg.startsWith('-') && !opts.bundlePath) {
          opts.bundlePath = arg;
        }
    }
  }

  if (opts.help || !opts.bundlePath) {
    printIngestOkfHelp();
    return;
  }

  const brainDir = resolveBrainDir(layer);
  const vaultDir = path.join(brainDir, 'memory-vault');

  console.log(`\n  📥 Importing OKF Bundle from: ${opts.bundlePath}`);
  console.log(`  🧠 Target Brain: ${layer} (${vaultDir})`);
  if (opts.dryRun) console.log('  ⚠️  DRY RUN: No actual writes will be committed.');

  const report = await importBundle(opts.bundlePath, vaultDir, {
    dryRun: opts.dryRun,
    category: opts.category,
    importance: opts.importance,
    onConflict: opts.onConflict,
    typeMap: opts.typeMap
  });

  console.log(`\n  Import Summary:`);
  console.log(`  🟢 Imported: ${report.imported.length} concepts`);
  console.log(`  🟡 Skipped:  ${report.skipped.length} concepts`);
  console.log(`  🔴 Errors:   ${report.errors.length} concepts`);

  if (report.skipped.length > 0) {
    console.log(`\n  Skipped detail:`);
    for (const item of report.skipped) {
      console.log(`    • ${item.file}: ${item.reason}`);
    }
  }

  if (report.errors.length > 0) {
    console.log(`\n  Errors detail:`);
    for (const item of report.errors) {
      console.log(`    • ${item.file}: ${item.error}`);
    }
    process.exit(1);
  }

  if (report.imported.length > 0 && !opts.dryRun) {
    // Recompile active memory surfaces and indexes in the background to avoid blocking the CLI call.
    console.log('\n  ⏳ Recompiling active memory surfaces and indexes in the background...');
    try {
      const { spawn } = await import('node:child_process');
      const child = spawn(process.argv[0], [process.argv[1], 'compile'], {
        detached: true,
        stdio: 'ignore'
      });
      child.unref();
      console.log('  ✅ Background compilation started.');
    } catch (err) {
      console.warn(`  ⚠️  Background recompilation spawn failed: ${err.message}`);
    }
  }
}

function printIngestOkfHelp() {
  console.log(`
  Usage:
    total-recall ingest okf <bundle-path> [options]

  Options:
    --dry-run                 Validate concepts and preview import without writing
    --category <name>         Override and force category for all imported concepts
    --importance <1-5>        Override default importance (default: 3)
    --on-conflict <strategy>  Strategy for duplicate slugs: 'skip' | 'warn' | 'overwrite' (default: warn)
    --type-map <mapping>      Custom type mappings. Format: "Type A=facts,Type B=concepts"
    --global                  Target the global brain
    --project                 Target the project brain (default)
    --help, -h                Show this help
  `);
}
