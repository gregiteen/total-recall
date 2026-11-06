#!/usr/bin/env node
/**
 * Composable CLI CLI Handler
 * Executed via: npx total-recall composable-cli <subcommand>
 *
 * Also serves as the `command` subcommand entry point:
 * total-recall command <create|read|update|remove|list|show|history|rollback|test|promote>
 */
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import {
  commandCreate,
  commandRead,
  commandUpdate,
  commandRemove,
  commandList,
  safeCommandName,
} from './src/command.mjs';
import { writeRegistry, readRegistry, listHistory, rollback, snapshotForHistory } from './src/registry.mjs';
import { detectShadow, getCommandTargets, resolveCommand, resolveGroupDirs, shadowWarning } from './src/resolve.mjs';
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
  if (args.includes('--global') && args.includes('--group')) throw new Error('Select one command scope');
  if (args.includes('--global')) {
    const homeDir = process.env.HOME || process.env.USERPROFILE;
    const globalDir = path.join(homeDir, '.agent', 'commands');
    return { scope: 'global', dir: globalDir };
  }
  // Check for --group <id>
  const gi = args.indexOf('--group');
  if (gi >= 0) {
    const groupId = args[gi + 1];
    if (!/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,127}$/.test(groupId ?? '')) throw new Error('Invalid group identifier');
    const homeDir = process.env.HOME || process.env.USERPROFILE;
    const groupDir = path.join(homeDir, '.agent', 'commands', 'groups', groupId);
    if (!resolveGroupDirs(process.cwd()).includes(groupDir)) throw new Error('The selected project is not a member of that command group');
    return { scope: 'group', dir: groupDir };
  }
  return { scope: 'project', dir: commandsDir };
}

function locateTest(args) {
  const name = safeCommandName(args[0]);
  const { scope, dir } = detectScope(args, resolveCommandsDir());
  const testFile = path.join(dir, `${name}.test.mjs`);
  if (!fs.existsSync(testFile) || !fs.lstatSync(testFile).isFile() || fs.realpathSync(testFile) !== path.join(fs.realpathSync(dir), path.basename(testFile))) {
    throw new Error(`No regular test file found for '${name}' in the selected ${scope} scope`);
  }
  return { name, scope, testFile };
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
      source: pluginDir ? 'from-plugin' : skillId ? 'config-for-skill' : 'inline',
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

  'test-path': async (args) => {
    const found = locateTest(args);
    console.log(args.includes('--json') ? JSON.stringify({ ok: true, ...found }) : found.testFile);
  },

  test: async (args) => {
    const found = locateTest(args);
    const env = { ...process.env };
    delete env.NODE_TEST_CONTEXT;
    const execution = spawnSync(process.execPath, ['--test', found.testFile], {
      cwd: process.cwd(), env, encoding: 'utf8', timeout: 120_000, maxBuffer: 128 * 1024, stdio: ['ignore', 'pipe', 'pipe'],
    });
    const result = { ok: !execution.error && execution.status === 0, ...found,
      exitCode: execution.status ?? null, signal: execution.signal ?? null,
      stdout: execution.stdout ?? '', stderr: execution.stderr ?? '', error: execution.error?.code ?? null };
    if (!result.ok) process.exitCode = result.exitCode || EXIT_CODES.ERROR;
    if (args.includes('--json')) console.log(JSON.stringify(result));
    else {
      if (result.stdout) console.log(result.stdout.trimEnd());
      if (result.stderr) console.error(result.stderr.trimEnd());
      if (result.error) console.error(`Could not finish the test process: ${result.error}`);
    }
  },

  promote: async (args, { packageRoot = process.env.TR_PACKAGE_ROOT } = {}) => {
    const name = safeCommandName(args[0]);
    const pi = args.indexOf('--to-plugin');
    const pluginDir = pi >= 0 ? args[pi + 1] : undefined;
    if (!pluginDir || pluginDir.startsWith('--')) throw Object.assign(new Error('Usage: command promote <name> --to-plugin <dir>'), { exitCode: EXIT_CODES.USAGE });
    const { dir } = detectScope(args, resolveCommandsDir());
    const sourceRoot = fs.realpathSync(dir);
    const cmdPath = path.join(dir, `${name}.mjs`);
    const registryPath = path.join(dir, `${name}.md`);
    const localRegularFile = file => fs.lstatSync(file).isFile() && fs.realpathSync(file) === path.join(sourceRoot, path.basename(file));
    if (!localRegularFile(cmdPath) || !localRegularFile(registryPath)) throw new Error('Promotion needs regular command and registry files');
    const registry = readRegistry(name, dir);
    const code = fs.readFileSync(cmdPath);
    // Older inline commands used the same generated header but were misclassified as from-plugin.
    if (registry?.name !== name || registry.code_sha256 !== createHash('sha256').update(code).digest('hex') || !code.toString().startsWith(`// Auto-generated custom CLI command: ${name}\n`)) {
      throw new Error('Promotion requires a registered inline command whose digest matches its source');
    }
    if (!['read', 'write'].includes(registry.risk)) throw new Error('Promotion of gated commands requires a destination handler that preserves the risk gate');
    const testPath = path.join(dir, `${name}.test.mjs`);
    const testSource = fs.lstatSync(testPath, { throwIfNoEntry: false });
    if (testSource && !localRegularFile(testPath)) throw new Error('Promotion test must be a regular file');
    if (!packageRoot || !path.isAbsolute(packageRoot) || JSON.parse(fs.readFileSync(path.join(packageRoot, 'package.json'), 'utf8')).name !== 'total-recall-brain') {
      throw new Error('Verified Total Recall host package context required to validate the promoted manifest');
    }
    const { validatePluginManifest } = await import(pathToFileURL(path.join(packageRoot, 'src/core/plugin-loader.mjs')).href);
    const root = fs.realpathSync(pluginDir);
    const manifestPath = path.join(root, 'plugin.json');
    const lock = path.join(root, '.command-promotion.lock');
    const lockFd = fs.openSync(lock, 'wx', 0o600);
    const stagedManifest = path.join(root, `.plugin-promotion-${randomUUID()}.json`);
    const created = [];
    try {
      const stat = fs.lstatSync(manifestPath);
      if (!stat.isFile()) throw new Error('Destination manifest must be a regular file');
      const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
      const initial = validatePluginManifest(manifest);
      if (!initial.valid) throw new Error(`Destination manifest is invalid: ${initial.errors.join('; ')}`);
      if ([manifest.id, manifest.cli?.command, manifest.cli?.alias].includes(name) || manifest.commands?.some(command => command.name === name)) throw new Error(`Destination already declares '${name}'`);
      const handler = `commands/${name}.mjs`;
      manifest.commands = [...(manifest.commands || []), { name, handler, description: registry.description || '', risk: registry.risk }];
      const validation = validatePluginManifest(manifest);
      if (!validation.valid) throw new Error(`Promoted manifest is invalid: ${validation.errors.join('; ')}`);
      const destination = path.join(root, 'commands');
      if (!fs.existsSync(destination)) fs.mkdirSync(destination);
      if (!fs.lstatSync(destination).isDirectory()) throw new Error('Destination commands directory must be a real directory');
      const target = path.join(root, handler);
      fs.writeFileSync(target, code, { flag: 'wx' });
      created.push(target);
      if (testSource) {
        const testTarget = path.join(destination, path.basename(testPath));
        fs.copyFileSync(testPath, testTarget, fs.constants.COPYFILE_EXCL);
        created.push(testTarget);
      }
      fs.writeFileSync(stagedManifest, JSON.stringify(manifest, null, 2) + '\n', { flag: 'wx', mode: stat.mode & 0o777 });
      fs.renameSync(stagedManifest, manifestPath);
      return { name, plugin: manifest.id, handler, risk: registry.risk };
    } catch (error) {
      for (const file of created) fs.rmSync(file, { force: true });
      throw error;
    } finally {
      fs.rmSync(stagedManifest, { force: true });
      fs.closeSync(lockFd);
      fs.unlinkSync(lock);
    }
  },
};

export async function run(argv = [], dependencies = {}) {
  const args = Array.isArray(argv) ? argv.slice(3) : [];
  const sub = args[0] || 'status';
  const json = args.includes('--json');

  if (sub === 'status' || args.includes('--help') || args.includes('-h') || sub === 'help') {
    if (args.includes('--help') || args.includes('-h') || sub === 'help') {
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
    total-recall composable-cli test <name> [--global|--group <id>] [--json]
    total-recall composable-cli test-path <name> [--global|--group <id>] [--json]
    total-recall composable-cli promote <name> --to-plugin <dir>

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

  if (Object.hasOwn(IMPLEMENTED, sub)) {
    try {
      const result = await IMPLEMENTED[sub](args.slice(1), dependencies);
      if (MUTATIONS.has(sub)) await compileCommandMutation(args.slice(1), dependencies);
      if (sub === 'promote') console.log(json ? JSON.stringify({ ok: true, ...result }) : `Promoted '${result.name}' to ${result.plugin} (${result.handler})`);
    } catch (err) {
      if (json) console.log(JSON.stringify({ ok: false, error: err.message }));
      else console.error(`Error: ${err.message}`);
      process.exitCode = err.exitCode || 1;
    }
    return;
  }

  console.error(`Composable CLI: "${sub}" is not implemented.`);
  process.exitCode = 2;
}

export default run;
