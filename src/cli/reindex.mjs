/**
 * total-recall reindex
 *
 * Delete all derived indexes and regenerate them from scratch.
 * This is a destructive-then-rebuild operation.
 *
 * Usage:
 *   npx total-recall reindex [options]
 *
 * Options:
 *   --vault <path>     Override vault directory (default: ~/.agent/memory-vault)
 *   --yes              Skip confirmation prompt
 *   --help             Show this help
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createInterface } from 'node:readline';
import { resolveAgentDir } from './agent-dir.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const AGENT_DIR = resolveAgentDir();

function parseArgs(args) {
  const opts = { vault: null, yes: false, help: false };
  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--vault': opts.vault = args[++i]; break;
      case '--yes': case '-y': opts.yes = true; break;
      case '--help': case '-h': opts.help = true; break;
    }
  }
  return opts;
}

function printHelp() {
  console.log(`
  total-recall reindex — Delete + regenerate all derived indexes

  This deletes everything in ~/.agent/memory-derived/ and rebuilds
  graph-index.jsonl and skill-routes.jsonl from the vault.

  Usage: total-recall reindex [options]

  Options:
    --vault <path>     Override vault directory (default: ~/.agent/memory-vault)
    --yes, -y          Skip confirmation prompt
    --help, -h         Show this help
`);
}

function rmDirRecursive(dir) {
  if (!fs.existsSync(dir)) return 0;
  let count = 0;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      count += rmDirRecursive(fullPath);
      fs.rmdirSync(fullPath);
    } else {
      fs.unlinkSync(fullPath);
      count++;
    }
  }
  return count;
}

async function confirm(message) {
  const rl = createInterface({ input: process.stdin, output: process.stderr });
  return new Promise((resolve) => {
    rl.question(message, (answer) => {
      rl.close();
      resolve(answer.toLowerCase().startsWith('y'));
    });
  });
}

export default async function reindex(args) {
  const opts = parseArgs(args);
  if (opts.help) { printHelp(); return; }

  const derivedDir = path.join(AGENT_DIR, 'memory-derived');

  if (!opts.yes) {
    console.error(`\n  ⚠️  This will delete all files in: ${derivedDir}`);
    const ok = await confirm('  Continue? (y/N) ');
    if (!ok) {
      console.error('  Aborted.');
      return;
    }
  }

  // Delete derived
  console.error('\n  🗑  Deleting derived indexes...');
  const deleted = rmDirRecursive(derivedDir);
  console.error(`     Removed ${deleted} file(s)`);

  // Rebuild via compile
  console.error('  🔄 Rebuilding indexes...');
  try {
    const { default: compile } = await import('./compile.mjs');
    await compile(['--quiet']);
    console.error('  ✅ Reindex complete');
  } catch (err) {
    console.error(`  ❌ Reindex failed: ${err.message}`);
    process.exit(1);
  }
}
