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
 *   npx total-recall ingest          Ingest IDE conversation logs or Google Takeout data
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
 *   npx total-recall share [url]     Share a URL or text snippet to the brain
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
  forget:   'forget.mjs',
  recall:   'recall.mjs',
  search:   'recall.mjs',
  research: 'research.mjs',
  task:     'task.mjs',
  share:    'share.mjs',
  'generate-pat': 'generate-pat.mjs',
  key:      'key.mjs',
  keys:     'key.mjs',
  pat:      'key.mjs',
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
  secret:   'secret.mjs',
  secrets:  'secret.mjs',
  help:     'help.mjs',
  collab:   'collab.mjs',
  command:  'command.mjs',
  export:   'export.mjs',
};
function printHelp() {
  console.log(`
  total-recall — Portable personal memory for any IDE

  Usage: total-recall <command> [options]

  Core (default product path):
    init [--project]    Bootstrap global or project brain + openwiki
    connect <client>    Wire IDE / Obsidian / http-api host
    remember / forget   Write-path memory (SSSS vault)
    recall              Read-path hybrid search
    compile             Rebuild instruction surfaces
    dream               Memory consolidation cycle
    task <cmd>          Enqueue daemon work (open envelope)
    daemon <cmd>        Background worker (start|stop|status)
    skill <cmd>         Skills registry, deploy, multi-repo sync
    secret <cmd>        Secrets store + usage (not the vault)
    brain <cmd>         Register / ensure any project brain
    status / doctor     Health and diagnostics

  Optional:
    research, share, ingest, import, export, relay, setup, deploy,
    start, backup, restore, config, map, generate-pat, lint, sync, …

  Full inventory: docs/reference/CLI_INVENTORY.md
  Default story: init → connect → remember/recall → dream (no LLM required)

  Examples:
    npx total-recall init --project
    npx total-recall connect claude-code
    npx total-recall remember fact "The API uses port 3000."
    npx total-recall dream
    npx total-recall skill track .
    npx total-recall secret list

  Options:
    --help, -h          Show this help
    --version, -v       Show version
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
      const { agentDir, resolveBrainLayer } = await import('../src/core/config.mjs');
      const fs = await import('node:fs');
      
      // Check for custom project-level commands first
      let projectAgentDir = null;
      try {
        const pBrain = resolveBrainLayer('project');
        projectAgentDir = pBrain.agentDir;
      } catch (e) { /* ignore */ }
      
      if (projectAgentDir) {
        const customCmdPath = path.join(projectAgentDir, 'commands', `${command}.mjs`);
        if (fs.existsSync(customCmdPath)) {
          const handler = await import(customCmdPath);
          if (handler.run) {
            await handler.run(process.argv);
          } else {
            await handler.default(process.argv.slice(3));
          }
          process.exit(0);
        }
      }

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
