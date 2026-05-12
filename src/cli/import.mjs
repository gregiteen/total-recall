/**
 * total-recall import
 *
 * Import a VFS export tarball onto this host.
 *
 * Usage:
 *   npx total-recall import --from <path>
 *
 * Options:
 *   --from <path>      Path to export tarball (required)
 *   --yes              Skip confirmation prompt
 *   --help             Show this help
 */

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createInterface } from 'node:readline';

const AGENT_DIR = path.join(os.homedir(), '.agent');

function parseArgs(args) {
  const opts = { from: null, yes: false, help: false };
  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--from': opts.from = args[++i]; break;
      case '--yes': case '-y': opts.yes = true; break;
      case '--help': case '-h': opts.help = true; break;
    }
  }
  return opts;
}

function printHelp() {
  console.log(`
  total-recall import — Import a VFS export onto this host

  Usage: total-recall import --from <path>

  Options:
    --from <path>      Path to export tarball (required)
    --yes, -y          Skip confirmation
    --help, -h         Show this help
`);
}

async function confirm(message) {
  const rl = createInterface({ input: process.stdin, output: process.stderr });
  return new Promise((resolve) => {
    rl.question(message, (answer) => { rl.close(); resolve(answer.toLowerCase().startsWith('y')); });
  });
}

export default async function importVfs(args) {
  const opts = parseArgs(args);
  if (opts.help) { printHelp(); return; }

  if (!opts.from) {
    console.error('  ❌ --from <path> is required');
    process.exit(1);
  }

  if (!fs.existsSync(opts.from)) {
    console.error(`  ❌ File not found: ${opts.from}`);
    process.exit(1);
  }

  if (fs.existsSync(AGENT_DIR) && !opts.yes) {
    console.error(`\n  ⚠️  ~/.agent/ already exists. Import will merge/overwrite files.`);
    const ok = await confirm('  Continue? (y/N) ');
    if (!ok) { console.error('  Aborted.'); return; }
  }

  console.error(`\n  📥 Importing VFS from ${opts.from}...`);

  const result = spawnSync('tar', ['-xzf', opts.from, '-C', os.homedir()], { stdio: 'inherit' });
  if (result.status !== 0) {
    console.error('  ❌ Import failed');
    process.exit(1);
  }

  console.error('  ✅ Import complete\n');
}
