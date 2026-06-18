import fs from 'node:fs';
import path from 'node:path';
import { parseLayerFlag, resolveBrainDir } from './agent-dir.mjs';
import { exportBundle } from '../core/okf-adapter.mjs';

export default async function exportCommand(args) {
  const { layer, remainingArgs } = parseLayerFlag(args);

  const opts = {
    outputPath: null,
    okf: false,
    format: 'dir',
    stripSsss: false,
    help: false
  };

  for (let i = 0; i < remainingArgs.length; i++) {
    const arg = remainingArgs[i];
    const val = remainingArgs[i + 1];

    switch (arg) {
      case '--okf':
        opts.okf = true;
        break;
      case '--format':
        if (val) { opts.format = val; i++; }
        break;
      case '--strip-ssss':
        opts.stripSsss = true;
        break;
      case '--help': case '-h':
        opts.help = true;
        break;
      default:
        if (!arg.startsWith('-') && !opts.outputPath) {
          opts.outputPath = arg;
        }
    }
  }

  if (opts.help || !opts.outputPath || !opts.okf) {
    printExportHelp();
    return;
  }

  const brainDir = resolveBrainDir(layer);
  const vaultDir = path.join(brainDir, 'memory-vault');

  console.log(`\n  📤 Exporting Memory Vault to OKF Bundle...`);
  console.log(`  🧠 Source Brain: ${layer} (${vaultDir})`);
  console.log(`  📂 Destination:  ${opts.outputPath} (Format: ${opts.format})`);

  try {
    const report = await exportBundle(vaultDir, opts.outputPath, {
      format: opts.format,
      stripSsss: opts.stripSsss
    });

    console.log(`\n  Export Summary:`);
    console.log(`  🟢 Exported: ${report.exported.length} concepts`);
    console.log(`  📄 generated index.md`);
    console.log(`  📄 generated log.md`);
    console.log(`  ✅ Export completed successfully.\n`);
  } catch (err) {
    console.error(`\n  ❌ Export failed: ${err.message}\n`);
    process.exit(1);
  }
}

function printExportHelp() {
  console.log(`
  total-recall export — Export Total Recall knowledge bases

  Usage:
    total-recall export <output-path> --okf [options]

  Options:
    --okf                     Export as an Open Knowledge Format (OKF) bundle (required)
    --format <dir|tar.gz>     Output format: directory or compressed tarball (default: dir)
    --strip-ssss              Remove all SSSS-specific metadata fields, leaving only pure OKF
    --global                  Source from the global brain
    --project                 Source from the project brain (default)
    --help, -h                Show this help
  `);
}
