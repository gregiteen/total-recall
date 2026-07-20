/**
 * src/cli/import-rules.mjs
 *
 * CLI handler for: npx total-recall import [--dir <path>] [--force] [--dry-run]
 *
 * Detects existing agent rule files and imports them into the vault.
 */

import path from 'node:path';
import { detectAndImport } from '../core/import-rules.mjs';
import { resolveBrainDir, parseLayerFlag } from './agent-dir.mjs';

export async function run(argv = []) {
  const rawArgs = argv.slice(3); // strip node, script, 'import'
  const { layer, remainingArgs: args } = parseLayerFlag(rawArgs);

  const dirs = [];
  let force  = false;
  let dryRun = false;

  for (let i = 0; i < args.length; i++) {
    if ((args[i] === '--dir' || args[i] === '-d') && args[i + 1]) {
      dirs.push(path.resolve(args[++i]));
    } else if (args[i] === '--force' || args[i] === '-f') {
      force = true;
    } else if (args[i] === '--dry-run') {
      dryRun = true;
    } else if (args[i] === '--help' || args[i] === '-h') {
      printHelp();
      return;
    }
  }

  // Default: search cwd
  if (dirs.length === 0) dirs.push(process.cwd());

  // auto → project vault when present (import rules for this repo)
  const brainDir = resolveBrainDir(layer);
  const vaultDir = path.join(brainDir, 'memory-vault');

  console.log(`\n🔍 Scanning for rule files in: ${dirs.join(', ')}\n`);

  const result = detectAndImport({ dirs, force, vaultDir, dryRun });

  if (result.detected.length === 0) {
    console.log('ℹ️  No rule files detected. Nothing to import.');
    console.log('   (Looked for: AGENTS.md, CLAUDE.md, .cursorrules, .clauderules, etc.)\n');
    return;
  }

  console.log(`📋 Detected ${result.detected.length} rule file(s):\n`);
  for (const f of result.detected) {
    const status = f.alreadyImported ? '  [already imported]' : '';
    console.log(`   ${f.alreadyImported ? '⚪' : '✅'} ${f.filename.padEnd(30)} ${f.label}${status}`);
    console.log(`      ${f.absolutePath}`);
    console.log(`      ${(f.size / 1024).toFixed(1)}KB — preview: ${f.preview.slice(0, 80).replace(/\n/g, ' ')}…\n`);
  }

  if (dryRun) {
    console.log(`🔎 Dry run — would import ${result.toImport.length} file(s). Run without --dry-run to proceed.\n`);
    return;
  }

  if (result.imported.length > 0) {
    console.log(`\n✅ Imported ${result.imported.length} file(s) into vault:\n`);
    for (const n of result.imported) {
      console.log(`   → ${n.slug}  (${(n.size / 1024).toFixed(1)}KB)`);
    }
  }

  if (result.skipped.length > 0) {
    console.log(`\n⚪ Skipped ${result.skipped.length} (already imported — use --force to re-import)`);
  }

  if (result.failed.length > 0) {
    console.log(`\n❌ Failed ${result.failed.length}:`);
    for (const f of result.failed) console.log(`   ${f.filename}: ${f.error}`);
  }

  if (result.imported.length > 0) {
    console.log('\n💡 Run  npx total-recall compile  to rebuild INSTRUCTIONS.md with your imported rules.\n');
  }
}

function printHelp() {
  console.log(`
npx total-recall import [options]

Detects existing agent rule files (AGENTS.md, .cursorrules, CLAUDE.md, etc.)
and imports them into your Total Recall memory vault so they are included in
all future AI sessions.

Options:
  --dir <path>   Directory to search (default: current directory)
  --global       Import into the global vault
  --project      Import into the project vault (default: auto when present)
  --force        Re-import files that were previously imported
  --dry-run      Show what would be imported without writing anything
  --help         Show this help

Examples:
  npx total-recall import
  npx total-recall import --project
  npx total-recall import --dir ~/my-project
  npx total-recall import --force --dry-run
`);
}
