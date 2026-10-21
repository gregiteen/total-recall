#!/usr/bin/env node
/**
 * Composable CLI CLI Handler
 * Executed via: npx total-recall composable-cli <subcommand>
 *
 * Also serves as the `command` subcommand entry point:
 * total-recall command <create|read|update|remove|list|show|history|rollback|test|promote>
 */
import path from 'node:path';
import {
  commandCreate,
  commandRead,
  commandUpdate,
  commandRemove,
  commandList,
  safeCommandName,
} from './src/command.mjs';
import { writeRegistry, readRegistry, listHistory, rollback, snapshotForHistory } from './src/registry.mjs';
import { detectShadow, getCommandTargets, resolveCommand, shadowWarning } from './src/resolve.mjs';
import { validateRisk, hasRiskGate } from './src/risk.mjs';
import { EXIT_CODES } from './src/contract.mjs';
import fs from 'node:fs';
import { buildCliLibrary } from './src/library.mjs';
import { MUTATIONS, compileCommandMutation } from './src/compile.mjs';
import { deleteCommandDocument } from './src/ssss-documents.mjs';

function resolveCommandsDir() {
  return path.join(process.cwd(), '.agent', 'commands');
}

/**
 * Determine the scope for a new command.
 * Checks project, then global based on --global flag.
 */
function detectScope(args, commandsDir) {
  if (args.includes('--global')) {
    const homeDir = process.env.HOME || process.env.USERPROFILE;
    const globalDir = path.join(homeDir, '.agent', 'commands');
    return { scope: 'global', dir: globalDir };
  }
  // Check for --group <id>
  const gi = args.indexOf('--group');
  if (gi >= 0 && args[gi + 1]) {
    const groupId = args[gi + 1];
    const homeDir = process.env.HOME || process.env.USERPROFILE;
    const groupDir = path.join(homeDir, '.agent', 'commands', 'groups', groupId);
    return { scope: 'group', dir: groupDir };
  }
  return { scope: 'project', dir: commandsDir };
}

const IMPLEMENTED = {
  library: async (args) => {
    const catalog = await buildCliLibrary();
    const index = args.indexOf('--plugin');
    if (index >= 0) {
      const id = args[index + 1];
      if (!id || !catalog.plugins.some(plugin => plugin.id === id)) throw new Error('Selected plugin is not installed');
      catalog.plugins = catalog.plugins.filter(plugin => plugin.id === id);
      catalog.commands = catalog.commands.filter(command => command.plugin === id);
      catalog.composedCommands = [];
    }
    if (args.includes('--json')) console.log(JSON.stringify(catalog));
    else {
      for (const command of catalog.commands) console.log(`${command.command} [${command.effect || 'undeclared effect'}] — ${command.description}`);
      for (const command of catalog.composedCommands) console.log(`${command.command} [${command.risk || 'undeclared risk'}] — ${command.description}`);
    }
  },
  create: async (args) => {
    const name = args[0];
    const code = args[1];
    const commandsDir = resolveCommandsDir();

    // Parse description, risk from args
    const di = args.indexOf('--description');
    const description = di >= 0 ? args[di + 1] : undefined;
    const ri = args.indexOf('--risk');
    const risk = ri >= 0 ? args[ri + 1] : 'write';
    const fromPlugin = args.findIndex((a) => a === '--from-plugin');
    const pluginDir = fromPlugin >= 0 ? args[fromPlugin + 1] : undefined;
    const configForSkill = args.findIndex((a) => a === '--config-for-skill');
    const skillId = configForSkill >= 0 ? args[configForSkill + 1] : undefined;

    // Detect scope
    const { scope, dir } = detectScope(args, commandsDir);

    // Shadow detection: refuse built-in names, warn on scope shadowing
    const warning = shadowWarning(name);
    if (warning && warning.startsWith("'")) {
      // Built-in — refuse
      const err = new Error(warning);
      err.exitCode = EXIT_CODES.USAGE;
      throw err;
    }
    if (warning) {
      console.error(warning);
    }

    const commandPath = commandCreate({
      name,
      code,
      description,
      risk,
      commandsDir: dir,
      fromPlugin: pluginDir,
      configForSkill: skillId,
      repoRoot: process.cwd(),
    });

    // Write registry document
    const author = process.env.AGENT_ID || 'user';
    writeRegistry({
      name,
      commandsDir: dir,
      scope,
      risk: risk || 'write',
      version: 1,
      author,
      description: description || '',
      source: fromPlugin ? 'from-plugin' : configForSkill ? 'config-for-skill' : 'inline',
    });

    console.log(` Created command: ${name} -> ${commandPath} (${scope})`);
  },

  read: async (args) => {
    const name = args[0];
    const commandsDir = resolveCommandsDir();
    const { scope, dir } = detectScope(args, commandsDir);
    console.log(commandRead(name, dir));
  },

  update: async (args) => {
    const name = args[0];
    const code = args[1];
    const commandsDir = resolveCommandsDir();

    // Parse optional metadata tags
    const di = args.indexOf('--description');
    const description = di >= 0 ? args[di + 1] : undefined;
    const ri = args.indexOf('--risk');
    const risk = ri >= 0 ? args[ri + 1] : undefined;

    const { dir } = detectScope(args, commandsDir);

    // Snapshot current version before updating
    snapshotForHistory(name, dir);

    commandUpdate({
      name,
      code,
      description,
      risk,
      commandsDir: dir,
    });

    // Bump registry version
    const doc = readRegistry(name, dir);
    if (doc) {
      writeRegistry({
        name,
        commandsDir: dir,
        scope: doc.scope || 'project',
        risk: risk || doc.risk || 'write',
        version: (doc.version || 0) + 1,
        author: doc.author || 'user',
        description: description || doc.description || '',
        source: doc.source || 'inline',
        background: doc.background_allowed || false,
      });
    }

    console.log(` Updated command: ${name}`);
  },

  remove: async (args) => {
    const name = args[0];
    const commandsDir = resolveCommandsDir();
    const { dir } = detectScope(args, commandsDir);
    const docPath = path.join(dir, `${name}.md`);
    safeCommandName(name);
    if (fs.existsSync(docPath)) deleteCommandDocument(docPath);
    commandRemove(name, dir);
    console.log(` Removed command: ${name}`);
  },

  list: async (args) => {
    const json = args.includes('--json');
    const commandsDir = resolveCommandsDir();
    const targets = getCommandTargets({ cwd: process.cwd() });
    const items = commandList(targets);
    if (json) {
      console.log(JSON.stringify(items));
    } else {
      if (!items.length) {
        console.log('No custom commands found.');
      } else {
        for (const item of items) {
          console.log(`  - ${item.name} (${item.scope}, ${item.path})${item.description ? ' — ' + item.description : ''}${item.risk ? ' [' + item.risk + ']' : ''}`);
        }
      }
    }
  },

  show: async (args) => {
    const name = args[0];
    const json = args.includes('--json');
    const commandsDir = resolveCommandsDir();
    const { dir } = detectScope(args, commandsDir);

    const code = commandRead(name, dir);
    const doc = readRegistry(name, dir);

    if (json) {
      console.log(JSON.stringify({ registry: doc || null, code }));
    } else {
      if (doc) {
        console.log(`Command: ${doc.name}`);
        console.log(`Scope: ${doc.scope}`);
        console.log(`Risk: ${doc.risk}`);
        console.log(`Version: ${doc.version}`);
        console.log(`Author: ${doc.author}`);
        console.log(`Created: ${doc.created}`);
        console.log(`Updated: ${doc.updated}`);
        if (doc.description) console.log(`Description: ${doc.description}`);
        console.log('');
      }
      console.log(code);
    }
  },

  history: async (args) => {
    const name = args[0];
    const json = args.includes('--json');
    const commandsDir = resolveCommandsDir();
    const { dir } = detectScope(args, commandsDir);
    const versions = listHistory(name, dir);
    if (json) {
      console.log(JSON.stringify({ name, versions }));
    } else {
      if (!versions.length) {
        console.log(`No history for '${name}'.`);
      } else {
        console.log(`History for '${name}':`);
        for (const v of versions) {
          console.log(`  v${v}`);
        }
      }
    }
  },

  rollback: async (args) => {
    const name = args[0];
    const version = parseInt(args[1], 10);
    const commandsDir = resolveCommandsDir();
    const { dir } = detectScope(args, commandsDir);
    if (isNaN(version)) {
      const err = new Error('Usage: command rollback <name> <version>');
      err.exitCode = EXIT_CODES.USAGE;
      throw err;
    }
    rollback(name, version, dir);
    console.log(` Rolled back '${name}' to v${version}`);
  },

  test: async (args) => {
    const name = args[0];
    const json = args.includes('--json');
    const commandsDir = resolveCommandsDir();
    const { dir } = detectScope(args, commandsDir);
    const testFile = path.join(dir, `${name}.test.mjs`);
    if (!fs.existsSync(testFile)) {
      const err = new Error(`No test file found for '${name}' at ${testFile}`);
      err.exitCode = EXIT_CODES.ERROR;
      throw err;
    }
    console.log(`Test file for '${name}' found at ${testFile}. Run with: node --test ${testFile}`);
    if (json) console.log(JSON.stringify({ name, testFile }));
  },

  promote: async (args) => {
    const name = args[0];
    const pi = args.indexOf('--to-plugin');
    const pluginDir = pi >= 0 ? args[pi + 1] : undefined;
    const commandsDir = resolveCommandsDir();
    const { dir } = detectScope(args, commandsDir);

    if (!pluginDir) {
      const err = new Error('Usage: command promote <name> --to-plugin <dir>');
      err.exitCode = EXIT_CODES.USAGE;
      throw err;
    }

    const cmdPath = path.join(dir, `${name}.mjs`);
    if (!fs.existsSync(cmdPath)) {
      const err = new Error(`Command '${name}' does not exist in ${dir}.`);
      err.exitCode = EXIT_CODES.ERROR;
      throw err;
    }

    // Copy command file and test into the plugin directory
    fs.mkdirSync(path.join(pluginDir, 'commands'), { recursive: true });
    fs.copyFileSync(cmdPath, path.join(pluginDir, 'commands', `${name}.mjs`));

    const testPath = path.join(dir, `${name}.test.mjs`);
    if (fs.existsSync(testPath)) {
      fs.copyFileSync(testPath, path.join(pluginDir, 'commands', `${name}.test.mjs`));
    }

    console.log(` Promoted '${name}' to plugin at ${pluginDir}/commands/`);
  },
};

export async function run(argv = [], dependencies = {}) {
  const args = Array.isArray(argv) ? argv.slice(3) : [];
  const sub = args[0] || 'status';
  const json = args.includes('--json');

  if (sub === 'status' || sub === '--help' || sub === '-h' || sub === 'help') {
    if (sub === '--help' || sub === '-h' || sub === 'help') {
      console.log(`
  total-recall composable-cli — Dynamic agent command composition engine

  Usage:
    total-recall composable-cli status [--json]
    total-recall composable-cli library [--plugin <id>] [--json]
    total-recall composable-cli create <name> "<code>" [--global] [--description "…"] [--risk <class>]
    total-recall composable-cli read <name> [--global]
    total-recall composable-cli update <name> "<code>" [--global] [--description "…"] [--risk <class>]
    total-recall composable-cli remove <name> [--global]
    total-recall composable-cli list [--global] [--json]
    total-recall composable-cli show <name> [--global]
    total-recall composable-cli history <name> [--global]
    total-recall composable-cli rollback <name> [--version <n>] [--global]
    total-recall composable-cli test <name> [--global]
    total-recall composable-cli promote <name> --plugin <dir>

  Or use the primary verb:
    total-recall command <create|read|update|remove|list|…>
`);
      return;
    }
    const status = {
      plugin: 'composable-cli',
      implemented: ['status', ...Object.keys(IMPLEMENTED)],
      scope: {
        project: resolveCommandsDir(),
        global: process.env.HOME ? path.join(process.env.HOME, '.agent', 'commands') : undefined,
      },
    };
    if (json) console.log(JSON.stringify(status));
    else {
      console.log(`Composable CLI v0.2.0 — implemented subcommands: ${status.implemented.join(', ')}`);
      console.log(`Project commands: ${status.scope.project}`);
      if (status.scope.global) console.log(`Global commands: ${status.scope.global}`);
    }
    return;
  }

  if (IMPLEMENTED[sub]) {
    try {
      await IMPLEMENTED[sub](args.slice(1));
      if (MUTATIONS.has(sub)) await compileCommandMutation(args.slice(1), dependencies);
    } catch (err) {
      console.error(`Error: ${err.message}`);
      process.exitCode = err.exitCode || 1;
    }
    return;
  }

  console.error(`Composable CLI: "${sub}" is not implemented.`);
  process.exitCode = 2;
}

export default run;
