/**
 * total-recall export
 *
 * Export the VFS as a portable, unencrypted tarball for transfer to another host.
 * Unlike backup, this includes memory-derived/ for immediate usability.
 *
 * Usage:
 *   npx total-recall export [options]
 *
 * Options:
 *   --output <path>    Output file path
 *   --help             Show this help
 */

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const AGENT_DIR = path.join(os.homedir(), '.agent');

function parseArgs(args) {
  const opts = { output: null, help: false };
  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--output': case '-o': opts.output = args[++i]; break;
      case '--help': case '-h': opts.help = true; break;
    }
  }
  return opts;
}

function printHelp() {
  console.log(`
  total-recall export — Export VFS as a portable tarball

  Unlike 'backup', export includes derived indexes for immediate use
  on the target host without needing to recompile.

  Usage: total-recall export [options]

  Options:
    --output, -o <path>   Output file path
    --help, -h            Show this help
`);
}

export default async function exportVfs(args) {
  const opts = parseArgs(args);
  if (opts.help) { printHelp(); return; }

  if (!fs.existsSync(AGENT_DIR)) {
    console.error('  ❌ VFS not found at ~/.agent/');
    process.exit(1);
  }

  const dateStr = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const outputPath = opts.output || path.join(os.homedir(), `total-recall-export-${dateStr}.tar.gz`);

  console.error(`\n  📤 Exporting VFS...`);

  const excludeFlags = "--exclude='logs' --exclude='.backups' --exclude='.DS_Store'";
  const result = spawnSync('sh', ['-c', `tar -czf "${outputPath}" ${excludeFlags} -C "${os.homedir()}" .agent`], { stdio: 'inherit' });

  if (result.status !== 0) {
    console.error('  ❌ Export failed');
    process.exit(1);
  }

  const sizeMb = (fs.statSync(outputPath).size / (1024 * 1024)).toFixed(1);
  console.error(`  ✅ Export complete — ${sizeMb} MB → ${outputPath}\n`);
}
