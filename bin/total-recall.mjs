#!/usr/bin/env node

/**
 * total-recall CLI
 *
 * Entry point for `npx total-recall <command>`.
 * Routes subcommands to handlers in src/cli/.
 *
 * Usage:
 *   npx total-recall deploy          Provision a target machine
 *   npx total-recall compile         Rebuild indexes + INSTRUCTIONS.md
 *   npx total-recall dream           Trigger a dream cycle
 *   npx total-recall reindex         Delete + regenerate derived indexes
 *   npx total-recall lint            Validate vault nodes against schema v2
 *   npx total-recall daemon <cmd>    start | stop | status
 *   npx total-recall backup          Create encrypted VFS tarball
 *   npx total-recall restore <path>  Restore from backup
 *   npx total-recall export          Portable VFS export
 *   npx total-recall import <path>   Import VFS on new host
 *   npx total-recall upgrade         Swap kernel model
 *   npx total-recall --help          Show this help
 */

import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CLI_DIR = path.join(__dirname, '..', 'src', 'cli');

const COMMANDS = {
  deploy:   'deploy.mjs',
  compile:  'compile.mjs',
  dream:    'dream.mjs',
  reindex:  'reindex.mjs',
  lint:     'lint.mjs',
  daemon:   'daemon.mjs',
  backup:   'backup.mjs',
  restore:  'restore.mjs',
  export:   'export.mjs',
  import:   'import.mjs',
  upgrade:  'upgrade.mjs',
  finetune: 'finetune.mjs',
  friction: 'friction.mjs',
  chat:     'chat.mjs',
};

function printHelp() {
  console.log(`
  total-recall — Sovereign AI System CLI

  Usage: total-recall <command> [options]

  Commands:
    deploy              Provision a target machine (Ollama, models, VFS, Caddy, systemd)
    compile             Rebuild indexes + INSTRUCTIONS.md from the memory vault
    dream               Manually trigger a dream cycle (Light → REM → Deep)
    reindex             Delete + regenerate all derived indexes
    lint                Validate all vault nodes against SSSS schema v2
    daemon <start|stop|status>  Manage the background daemon
    backup              Create an encrypted VFS tarball
    restore <path>      Restore from an encrypted backup
    export              Export VFS as a portable tarball
    import <path>       Import VFS on a new host
    upgrade --model <n> Swap the kernel model (e.g., gemma5-32b)
    finetune            Run QLoRA pipeline to generate custom weights
    friction            Analyze logs to detect workflow bottlenecks
    chat                Interactive terminal chat with the Sovereign OS

  Options:
    --help, -h          Show this help message
    --version, -v       Show version

  Examples:
    npx total-recall deploy
    npx total-recall compile
    npx total-recall backup
    npx total-recall daemon status
`);
}

async function main() {
  const args = process.argv.slice(2);
  const command = args[0];

  if (!command || command === '--help' || command === '-h') {
    printHelp();
    process.exit(0);
  }

  if (command === '--version' || command === '-v') {
    const pkg = await import(path.join(__dirname, '..', 'package.json'), { with: { type: 'json' } });
    console.log(`total-recall v${pkg.default.version}`);
    process.exit(0);
  }

  const handlerFile = COMMANDS[command];
  if (!handlerFile) {
    console.error(`Unknown command: ${command}`);
    console.error(`Run 'total-recall --help' for usage.`);
    process.exit(1);
  }

  const handlerPath = path.join(CLI_DIR, handlerFile);

  try {
    const handler = await import(handlerPath);
    await handler.default(args.slice(1));
  } catch (err) {
    if (err.code === 'ERR_MODULE_NOT_FOUND') {
      console.error(`Command '${command}' is not yet implemented.`);
      console.error(`Expected handler at: ${handlerPath}`);
      process.exit(1);
    }
    console.error(`Error executing '${command}':`, err.message);
    process.exit(1);
  }
}

main();
