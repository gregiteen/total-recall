#!/usr/bin/env node

/**
 * total-recall CLI
 *
 * Entry point for `npx total-recall <command>`.
 * Routes subcommands to handlers in src/cli/.
 *
 * Usage:
 *   npx total-recall init            Bootstrap Total Recall into an existing project
 *   npx total-recall deploy          Provision a target machine
 *   npx total-recall compile         Rebuild indexes + INSTRUCTIONS.md (alias: rebuild)
 *   npx total-recall dream           Trigger a dream cycle
 *   npx total-recall ingest          Ingest IDE conversation logs
 *   npx total-recall connect         Configure an IDE or external system
 *   npx total-recall sync            Pull remote brain instructions into workspace
 *   npx total-recall lint            Validate vault nodes against schema v2
 *   npx total-recall daemon <cmd>    start | stop | status
 *   npx total-recall status          Show brain connection and sync state
 *   npx total-recall generate-pat    Issue a hashed Personal Access Token
 *   npx total-recall hash-password   Generate a dashboard password hash
 *   npx total-recall backup          Create encrypted VFS tarball
 *   npx total-recall restore <path>  Restore from backup
 *   npx total-recall snapshot        Manage point-in-time VFS snapshots
 *   npx total-recall migrate         Run SSSS schema migrations
 *   npx total-recall chat            Interactive terminal chat
 *   npx total-recall friction        Analyze logs for workflow bottlenecks
 *   npx total-recall upgrade         Swap kernel model
 *   npx total-recall --help          Show this help
 */

import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CLI_DIR = path.join(__dirname, '..', 'src', 'cli');

const COMMANDS = {
  init:     'init.mjs',
  deploy:   'deploy.mjs',
  backup:   'backup.mjs',
  dream:    'dream.mjs',
  lint:     'lint.mjs',
  daemon:   'daemon.mjs',
  restore:  'restore.mjs',
  upgrade:  'upgrade.mjs',
  friction: 'friction.mjs',
  chat:     'chat.mjs',
  status:   'status.mjs',
  'generate-pat': 'generate-pat.mjs',
  'hash-password': 'hash-password.mjs',
  compile:  'rebuild.mjs',
  rebuild:  'rebuild.mjs',
  snapshot: 'snapshot.mjs',
  migrate:  'migrate.mjs',
  ingest:   'ingest.mjs',
  connect:  'connect.mjs',
  sync:     'sync.mjs',
};

function printHelp() {
  console.log(`
  total-recall — Sovereign AI System CLI

  Usage: total-recall <command> [options]

  Commands:
    init                Bootstrap Total Recall into an existing project repo
    deploy              Provision a target machine (Ollama, models, VFS, Caddy, systemd, cron)
    dream               Manually trigger a dream cycle (Light → REM → Deep)
    lint                Validate all vault nodes against SSSS schema v2
    daemon <start|stop|status>  Manage the background daemon
    restore <path>      Restore from an encrypted backup
    upgrade --model <n> Swap the kernel model (e.g., gemma5-32b)
    friction            Analyze logs to detect workflow bottlenecks
    chat                Interactive terminal chat with the Sovereign OS
    status              Show brain connection and sync state
    generate-pat        Issue a PAT; stores only a hash in keys.jsonl
    hash-password       Generate a bcrypt dashboard password hash
    compile             Alias for rebuild: deterministically rebuild projections
    rebuild [--check]   Detect index drift and deterministically rebuild projections
    snapshot            Manage fast point-in-time VFS snapshots and rollbacks
    migrate             Run backwards-incompatible SSSS schema migrations
    ingest [--watch]    Ingest IDE conversation logs (Claude Code, Codex, Gemini, etc.)
    connect <client>    Configure Cursor, Claude Code, Codex, UltraChat, MCP, etc.
    sync [--watch]      Pull remote brain instructions into the current workspace

  Autonomous operations (sync, compile, backup) are now handled by the
  Cloud Agent via SSSS task nodes in .agent/scheduler/queue/.
  The agent cron trigger (every 5 min) processes these automatically.

  Options:
    --help, -h          Show this help message
    --version, -v       Show version

  Examples:
    npx total-recall deploy
    npx total-recall dream
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
