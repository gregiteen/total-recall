#!/usr/bin/env node

/**
 * total-recall CLI
 *
 * Entry point for `npx total-recall <command>`.
 * Routes subcommands to handlers in src/cli/.
 *
 * Usage:
 *   npx total-recall init            Bootstrap Total Recall into an existing project
 *   npx total-recall setup           Interactive setup wizard (provider → deploy → connect IDEs)
 *   npx total-recall deploy          Provision a target machine
 *   npx total-recall import          Import existing rule files into the vault
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
 *   npx total-recall research <cmd>  Manage/query ongoing autonomous research agenda
 *   npx total-recall --help          Show this help
 */

import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CLI_DIR = path.join(__dirname, '..', 'src', 'cli');

const COMMANDS = {
  init:     'init.mjs',
  setup:    'setup.mjs',
  start:    'start.mjs',
  deploy:   'deploy.mjs',
  doctor:   'doctor.mjs',
  backup:   'backup.mjs',
  dream:    'dream.mjs',
  lint:     'lint.mjs',
  daemon:   'daemon.mjs',
  restore:  'restore.mjs',
  upgrade:  'upgrade.mjs',
  friction: 'friction.mjs',
  chat:     'chat.mjs',
  status:   'status.mjs',
  remember: 'remember.mjs',
  recall:   'recall.mjs',
  search:   'recall.mjs',
  research: 'research.mjs',
  'generate-pat': 'generate-pat.mjs',
  'hash-password': 'hash-password.mjs',
  'reset-password': 'reset-password.mjs',
  compile:  'rebuild.mjs',
  rebuild:  'rebuild.mjs',
  snapshot: 'snapshot.mjs',
  migrate:  'migrate.mjs',
  ingest:   'ingest.mjs',
  import:   'import-rules.mjs',
  connect:  'connect.mjs',
  sync:     'sync.mjs',
  relay:    'relay.mjs',
  uninstall: 'uninstall.mjs',
  map:      'map.mjs',
  brain:    'brain.mjs',
  config:   'config.mjs',
  skill:    'skill.mjs',
  help:     'help.mjs',
};
function printHelp() {
  console.log(`
  total-recall — Sovereign AI System CLI

  Usage: total-recall <command> [options]

  Commands:
    init                Bootstrap Total Recall into an existing project repo
    setup               Interactive wizard: provider → API key → provision → connect IDEs
    start [--port N]    Start the brain server in the foreground (alias for running the server directly)
    deploy              Provision a target machine (Caddy/TLS, system services, VFS setup, environment checks)
    doctor              Run environment diagnostics and verify dependency health
    dream               Manually trigger a dream cycle (Light → REM → Deep)
    lint                Validate all vault nodes against SSSS schema v2
    daemon <start|stop|status>  Manage the background daemon
    backup [options]    Create encrypted VFS tarball, push git backup, or Obsidian sync
    restore <path>      Restore from an encrypted backup
    upgrade --model <n> Swap the kernel model (e.g., gemma5-32b)
    friction            Analyze logs to detect workflow bottlenecks
    chat                Interactive terminal chat with the Sovereign OS
    remember            Remember new rules, preferences, or corrections in real time
    recall              Recall semantic memory or search existing knowledge/rules/session-history
    map                 Visualize memory vault category trees and link relationships
    brain <cmd>         Manage registered brains and context resolution (list, status, register, unregister)
    research <command>  Manage/query ongoing autonomous research agenda (list, add, show, report, cancel)
    config <get|set>    Read, write, and toggle UI, security, and budget settings
    skill <command>     Manage AI agent skills: find, install, scan, list, remove
    generate-pat        Issue a PAT; stores only a hash in keys.jsonl
    hash-password       Generate a bcrypt dashboard password hash
    reset-password      Reset the dashboard admin password and force a change on login
    compile             Alias for rebuild: deterministically rebuild projections
    rebuild [--check]   Detect index drift and deterministically rebuild projections
    snapshot            Manage fast point-in-time VFS snapshots and rollbacks
    migrate             Run backwards-incompatible SSSS schema migrations
    import [--dir <path>] [--force]   Import existing AGENTS.md, .cursorrules, CLAUDE.md, etc.
                                     into the vault (run before compile on first install)
    ingest [--watch]    Ingest IDE conversation logs (Claude Code, Codex, Gemini, etc.)
    connect <client>    Configure Cursor, Claude Code, Codex, UltraChat, Gemini, etc.
    sync [--watch]      Pull remote brain instructions into the current workspace
    relay <cmd>         Local background relay: ship IDE sessions to remote brain
                        Commands: start | stop | status | once | install | uninstall
    uninstall           Completely uninstall all services, launchd agents, VFS, and shims
    help <topic>        Interactive offline documentation, SSSS reference, and system help



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
    // Check if it is a dynamic integration command configured in the VFS
    try {
      const { agentDir } = await import('../src/core/config.mjs');
      const fs = await import('node:fs');
      const integrationPath = path.join(agentDir, 'skills', 'total-recall', 'integrations', `${command}.md`);
      
      if (fs.existsSync(integrationPath)) {
        const action = args[1];
        if (!action) {
          console.error(`Error: Missing action name for service "${command}".`);
          console.error(`Usage: npx total-recall ${command} <action> [options]`);
          process.exit(1);
        }

        // Parse CLI options (e.g. --owner value)
        const options = {};
        for (let i = 2; i < args.length; i++) {
          const arg = args[i];
          if (arg.startsWith('--')) {
            const key = arg.slice(2);
            const val = args[i + 1];
            if (val && !val.startsWith('--')) {
              options[key] = val;
              i++;
            } else {
              options[key] = true;
            }
          }
        }

        const { default: dispatch } = await import('../src/cli/integration-dispatcher.mjs');
        const result = await dispatch(command, action, options);
        console.log(typeof result === 'object' ? JSON.stringify(result, null, 2) : result);
        process.exit(0);
      }
    } catch (err) {
      console.error(`Error executing integration command: ${err.message}`);
      process.exit(1);
    }

    console.error(`Unknown command: ${command}`);
    console.error(`Run 'total-recall --help' for usage.`);
    process.exit(1);
  }

  const handlerPath = path.join(CLI_DIR, handlerFile);

  try {
    const handler = await import(handlerPath);
    if (handler.run) {
      await handler.run(process.argv);
    } else {
      await handler.default(process.argv.slice(3));
    }
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
