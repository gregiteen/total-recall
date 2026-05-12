/**
 * total-recall restore
 *
 * Restore VFS from an encrypted or unencrypted backup tarball.
 *
 * Usage:
 *   npx total-recall restore --from <path>
 *
 * Options:
 *   --from <path>      Path to backup file (required)
 *   --yes              Skip confirmation prompt
 *   --help             Show this help
 */

import { spawnSync, execSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createInterface } from 'node:readline';

const AGENT_DIR = path.join(os.homedir(), '.agent');

function commandExists(cmd) {
  try { execSync(`command -v ${cmd}`, { stdio: 'ignore' }); return true; } catch { return false; }
}

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
  total-recall restore — Restore VFS from a backup tarball

  Usage: total-recall restore --from <path>

  Options:
    --from <path>      Path to backup file (required)
    --yes, -y          Skip confirmation prompt
    --help, -h         Show this help
`);
}

async function confirm(message) {
  const rl = createInterface({ input: process.stdin, output: process.stderr });
  return new Promise((resolve) => {
    rl.question(message, (answer) => { rl.close(); resolve(answer.toLowerCase().startsWith('y')); });
  });
}

export default async function restore(args) {
  const opts = parseArgs(args);
  if (opts.help) { printHelp(); return; }

  if (!opts.from) {
    console.error('  ❌ --from <path> is required');
    printHelp();
    process.exit(1);
  }

  if (!fs.existsSync(opts.from)) {
    console.error(`  ❌ Backup file not found: ${opts.from}`);
    process.exit(1);
  }

  const isEncrypted = opts.from.endsWith('.gpg');

  if (!opts.yes) {
    console.error(`\n  ⚠️  This will overwrite ~/.agent/ with the contents of:`);
    console.error(`     ${opts.from}`);
    const ok = await confirm('  Continue? (y/N) ');
    if (!ok) { console.error('  Aborted.'); return; }
  }

  console.error(`\n  📦 Restoring from backup...`);
  console.error(`     Source:    ${opts.from}`);
  console.error(`     Encrypted: ${isEncrypted}`);

  try {
    if (isEncrypted) {
      if (!commandExists('gpg')) { console.error('  ❌ gpg not found'); process.exit(1); }
      const cmd = `gpg --decrypt --batch "${opts.from}" | tar -xf - -C "${os.homedir()}"`;
      const result = spawnSync('sh', ['-c', cmd], { stdio: 'inherit' });
      if (result.status !== 0) throw new Error(`gpg|tar failed (exit ${result.status})`);
    } else {
      const result = spawnSync('tar', ['-xzf', opts.from, '-C', os.homedir()], { stdio: 'inherit' });
      if (result.status !== 0) throw new Error(`tar failed (exit ${result.status})`);
    }

    console.error('  ✅ Files extracted');

    // Reindex after restore
    console.error('  🔄 Rebuilding indexes...');
    const { default: compile } = await import('./compile.mjs');
    await compile(['--quiet']);
    console.error('  ✅ Restore complete\n');
  } catch (err) {
    console.error(`  ❌ Restore failed: ${err.message}`);
    process.exit(1);
  }
}
