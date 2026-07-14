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

import { spawn, spawnSync, execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createInterface } from 'node:readline';

import { resolveAgentDir, parseLayerFlag } from './agent-dir.mjs';

/** Parent of the skill dir — where the tarball gets extracted to */
function getExtractDir(layer = 'auto') {
  return path.join(resolveAgentDir(layer), 'skills');
}

function commandExists(cmd) {
  if (!cmd || !/^[a-zA-Z0-9_-]+$/.test(cmd)) {
    return false;
  }
  try {
    execFileSync('which', [cmd], { stdio: 'ignore' });
    return true;
  } catch { return false; }
}

function parseArgs(args) {
  const { layer, remainingArgs } = parseLayerFlag(args);
  const opts = { from: null, yes: false, help: false, layer };
  for (let i = 0; i < remainingArgs.length; i++) {
    switch (remainingArgs[i]) {
      case '--from': opts.from = remainingArgs[++i]; break;
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
  const extractDir = getExtractDir(opts.layer);

  if (!opts.yes) {
    console.error(`\n  ⚠️  This will overwrite .agent/skills/total-recall/ with the contents of:`);
    console.error(`     ${opts.from}`);
    const ok = await confirm('  Continue? (y/N) ');
    if (!ok) { console.error('  Aborted.'); return; }
  }

  // Ensure the extract target exists
  fs.mkdirSync(extractDir, { recursive: true });

  console.error(`\n  📦 Restoring from backup...`);
  console.error(`     Source:    ${opts.from}`);
  console.error(`     Encrypted: ${isEncrypted}`);

  try {
    if (isEncrypted) {
      if (!commandExists('gpg')) { console.error('  ❌ gpg not found'); process.exit(1); }
      
      const gpg = spawn('gpg', ['--decrypt', '--batch', opts.from], { stdio: ['ignore', 'pipe', 'inherit'] });
      const tar = spawn('tar', ['-xf', '-', '-C', extractDir], { stdio: ['pipe', 'inherit', 'inherit'] });

      gpg.stdout.pipe(tar.stdin);

      const [gpgExit, tarExit] = await Promise.all([
        new Promise((resolve) => gpg.on('close', resolve)),
        new Promise((resolve) => tar.on('close', resolve))
      ]);

      if (gpgExit !== 0) throw new Error(`gpg failed (exit ${gpgExit})`);
      if (tarExit !== 0) throw new Error(`tar failed (exit ${tarExit})`);
    } else {
      const result = spawnSync('tar', ['-xzf', opts.from, '-C', extractDir], { stdio: 'inherit' });
      if (result.status !== 0) throw new Error(`tar failed (exit ${result.status})`);
    }

    console.error('  ✅ Files extracted');

    // Reindex after restore
    console.error('  🔄 Rebuilding indexes...');
    const { default: rebuild } = await import('./rebuild.mjs');
    await rebuild(['--quiet']);
    console.error('  ✅ Restore complete\n');
  } catch (err) {
    console.error(`  ❌ Restore failed: ${err.message}`);
    process.exit(1);
  }
}
