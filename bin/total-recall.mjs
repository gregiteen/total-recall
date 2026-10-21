#!/usr/bin/env node
import fs from 'node:fs';

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

import { CLI_COMMANDS as COMMANDS } from '../src/core/cli-commands.mjs';
async function printHelp() {
  let pluginsSection = '';
  try {
    const { discoverPlugins } = await import('../src/core/plugin-loader.mjs');
    const plugins = discoverPlugins(process.cwd()).filter((p) => p.valid);
    if (plugins.length > 0) {
      pluginsSection = '\n  Installed Plugins:\n' + plugins.map((p) => {
        const cmd = (p.manifest.cli?.command || p.id).padEnd(19, ' ');
        const desc = p.manifest.description ? (p.manifest.description.length > 55 ? p.manifest.description.slice(0, 52) + '…' : p.manifest.description) : 'Plugin capability';
        return `    ${cmd} ${desc}`;
      }).join('\n') + '\n';
    }
  } catch {}

  console.log(`
  total-recall — Portable personal memory for any IDE

  Usage: total-recall <command> [options]

  Core (default product path):
    init [--project]    Bootstrap global or project brain + openwiki
    new <name> [--with ids]  Create a project (ssss new + Total Recall) with plugins as owned bricks
    connect <client>    Wire IDE surface (Cursor, Claude, Codex, Grok, Replit, Lovable)
    remember / forget / edit   Write-path memory (SSSS vault)
    recall              Read-path hybrid search
    context "<task>"    Required-rule capsule to read before acting (require ready:true)
    auth secret <cmd>   Credentials (the only secrets path): list|get|set|rotate|remote deploy|diff-env|export-env
    compile             Rebuild instruction surfaces
    dream               Memory consolidation cycle
    proposals <cmd>     Review / apply optimizer proposals (list|apply|revert)
    task <cmd>          Enqueue daemon work (open envelope)
    daemon <cmd>        Background worker (start|stop|status)
    skill <cmd>         Skills registry, deploy, multi-repo sync
    plugin <cmd>        Plugin manager: list, install, search, remove, info
    harness <cmd>       Meta-harness manager: list, usage (5h/weekly quotas), dispatch, council
    agent <cmd>         Process controller: spawn, list, logs, kill across mesh
    brain <cmd>         Register / ensure any project brain
    status / doctor     Health and diagnostics
    brief               Session-start brief: state, runtime, rules, harnesses, trackers
    startup check|ensure Readiness checks / missing managed local runtime start
${pluginsSection}
  Optional:
    update [--apply]    Auto-download total-recall-brain for registered repos
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
    npx total-recall auth secret list

  Options:
    --help, -h          Show this help
    --version, -v       Show version
`);
  console.log(`  Complete built-in command list:\n    ${Object.keys(COMMANDS).join(', ')}\n`);
}

async function main() {
  const args = process.argv.slice(2);
  const command = args[0];
  // These names must not reappear through generic API or composed routing.
  if (command === 'secret' || command === 'secrets') {
    console.error('Credential commands belong to the auth plugin. Use total-recall auth secret --help.');
    process.exit(1);
  }

  if (!command || command === '--help' || command === '-h') {
    await printHelp();
    process.exit(0);
  }

  if (command === '--version' || command === '-v') {
    const pkg = await import(path.join(__dirname, '..', 'package.json'), { with: { type: 'json' } });
    console.log(`total-recall v${pkg.default.version}`);
    process.exit(0);
  }

  // Core built-in memory and rules commands that always run from core
  const CORE_BUILTINS = new Set([
    'remember', 'forget', 'edit', 'recall', 'context', 'rules',
    'compile', 'rebuild', 'dream', 'proposals', 'proposal', 'task',
    'daemon', 'skill', 'plugin', 'plugins',
    'harness', 'agent', 'agents', 'brain', 'status',
    'doctor', 'brief', 'startup', 'init', 'connect', 'new'
  ]);

  // Check installed plugins first for any non-core commands (e.g. deploy, phone, text)
  if (!CORE_BUILTINS.has(command)) {
    try {
      const { discoverPlugins } = await import('../src/core/plugin-loader.mjs');
      const plugins = discoverPlugins(process.cwd());
      for (const p of plugins) {
        if (p.valid && p.manifest.cli?.command === command) {
          const handlerRel = p.manifest.cli.handler;
          if (handlerRel) {
            const { runPluginCommand } = await import('../src/core/plugin-runner.mjs');
            const pluginArgs = args.slice(1);
            const result = await runPluginCommand(p, { args: pluginArgs, stdin: 'inherit' });
            if (result.stdout !== undefined) {
              if(result.stdout)process.stdout.write(result.stdout);
              if(result.stderr)process.stderr.write(result.stderr);
            }else if(result.output)process.stdout.write(result.output);
            process.exit(result.ok ? 0 : (result.exitCode || 1));
          }
        }
      }
    } catch (err) {
      console.error(`Error executing plugin command: ${err.message}`);
      process.exit(1);
    }
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
          return;
        }
      }

      // Check for custom global-level commands next
      let globalAgentDir = null;
      try {
        const gBrain = resolveBrainLayer('global');
        globalAgentDir = gBrain.agentDir;
      } catch (e) { /* ignore */ }

      if (globalAgentDir) {
        const customCmdPath = path.join(globalAgentDir, 'commands', `${command}.mjs`);
        if (fs.existsSync(customCmdPath)) {
          const handler = await import(customCmdPath);
          if (handler.run) {
            await handler.run(process.argv);
          } else {
            await handler.default(process.argv.slice(3));
          }
          return;
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
      console.error(`Error executing dynamic command: ${err.message}`);
      process.exit(1);
    }

    // Any HTTP API route group without a dedicated verb: `total-recall <group> <action> …`
    try {
      const { loadApiRoutes } = await import('../src/core/api-routes.mjs');
      if ((await loadApiRoutes()).some((r) => r.group === command)) {
        const { default: apiCli } = await import('../src/cli/api.mjs');
        await apiCli(args);
        process.exit(process.exitCode ?? 0);
      }
    } catch (err) {
      console.error(`Error: ${err.message}`);
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
    if (err.code === 'ERR_MODULE_NOT_FOUND' && !fs.existsSync(handlerPath)) {
      console.error(`Command '${command}' is not yet implemented.`);
      console.error(`Expected handler at: ${handlerPath}`);
      process.exit(1);
    }
    console.error(`Error executing '${command}':`, err.message);
    process.exit(1);
  }
}

main();
