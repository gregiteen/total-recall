/**
 * total-recall backup
 *
 * Create an encrypted tarball of ~/.agent/.
 * Uses tar + gpg for AES-256 symmetric encryption.
 *
 * Usage:
 *   npx total-recall backup [options]
 *
 * Options:
 *   --output <path>    Output file path
 *   --no-encrypt       Create unencrypted .tar.gz
 *   --help             Show this help
 */

import { execSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const AGENT_DIR = path.join(os.homedir(), '.agent');

function commandExists(cmd) {
  try { execSync(`command -v ${cmd}`, { stdio: 'ignore' }); return true; } catch { return false; }
}

function parseArgs(args) {
  const opts = { output: null, encrypt: true, help: false };
  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--output': case '-o': opts.output = args[++i]; break;
      case '--no-encrypt': opts.encrypt = false; break;
      case '--help': case '-h': opts.help = true; break;
    }
  }
  return opts;
}

function printHelp() {
  console.log(`
  total-recall backup — Create an encrypted tarball of ~/.agent/

  Usage: total-recall backup [options]

  Options:
    --output, -o <path>   Output file path
    --no-encrypt          Create unencrypted .tar.gz instead
    --help, -h            Show this help
`);
}

export default async function backup(args) {
  const opts = parseArgs(args);
  if (opts.help) { printHelp(); return; }

  if (!fs.existsSync(AGENT_DIR)) {
    console.error('  ❌ VFS not found at ~/.agent/ — run "total-recall deploy" first');
    process.exit(1);
  }

  const dateStr = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const ext = opts.encrypt ? 'tar.gpg' : 'tar.gz';
  const outputPath = opts.output || path.join(os.homedir(), `total-recall-backup-${dateStr}.${ext}`);

  const excludeFlags = "--exclude='memory-derived' --exclude='logs' --exclude='.backups' --exclude='.DS_Store'";

  console.error(`\n  📦 Creating backup...`);
  console.error(`     Source: ${AGENT_DIR}  |  Output: ${outputPath}  |  Encrypt: ${opts.encrypt}`);

  const startTime = Date.now();
  try {
    if (opts.encrypt) {
      if (!commandExists('gpg')) { console.error('  ❌ gpg not found'); process.exit(1); }
      const cmd = `tar -cf - ${excludeFlags} -C "${os.homedir()}" .agent | gpg --symmetric --cipher-algo AES256 --batch --yes -o "${outputPath}"`;
      spawnSync('sh', ['-c', cmd], { stdio: 'inherit' });
    } else {
      spawnSync('sh', ['-c', `tar -czf "${outputPath}" ${excludeFlags} -C "${os.homedir()}" .agent`], { stdio: 'inherit' });
    }

    const sizeMb = (fs.statSync(outputPath).size / (1024 * 1024)).toFixed(1);
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    console.error(`  ✅ Backup complete (${elapsed}s) — ${sizeMb} MB → ${outputPath}\n`);

    // Local copy
    const backupsDir = path.join(AGENT_DIR, '.backups');
    if (!fs.existsSync(backupsDir)) fs.mkdirSync(backupsDir, { recursive: true });
    fs.copyFileSync(outputPath, path.join(backupsDir, path.basename(outputPath)));
  } catch (err) {
    console.error(`  ❌ Backup failed: ${err.message}`);
    process.exit(1);
  }
}
