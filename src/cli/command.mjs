import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { spawn } from 'node:child_process';
import { resolveBrainLayer } from '../core/config.mjs';
import { isSafeRelativePath, validatePluginManifest } from '../core/plugin-loader.mjs';

const COMMAND_NAME = /^[a-z][a-z0-9-]{0,63}$/;

function safeCommandName(name) {
  if (!COMMAND_NAME.test(name || '')) throw new Error('Command name must be lowercase kebab-case (1–64 characters)');
  return name;
}

/** Generate a composable command from one validated plugin manifest entry. */
export function generatePluginCommand(pluginDir, name, commandsDir) {
  safeCommandName(name);
  const root = fs.realpathSync(pluginDir);
  const manifestPath = path.join(root, 'plugin.json');
  if (!fs.statSync(manifestPath).isFile() || fs.lstatSync(manifestPath).isSymbolicLink()) {
    throw new Error('Plugin manifest must be a regular file');
  }
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  const validation = validatePluginManifest(manifest);
  if (!validation.valid) throw new Error(`Invalid plugin manifest: ${validation.errors.join('; ')}`);
  const spec = (manifest.commands || []).find((entry) => entry.name === name);
  if (!spec) throw new Error(`Plugin '${manifest.id}' has no command '${name}'`);
  if (!isSafeRelativePath(spec.handler) || spec.handler.includes('\\') || !spec.handler.endsWith('.mjs')) {
    throw new Error(`Command '${name}' needs a safe .mjs handler path`);
  }
  const handlerPath = path.resolve(root, spec.handler);
  const relative = path.relative(root, handlerPath);
  if (!relative || relative.startsWith(`..${path.sep}`) || relative === '..' || path.isAbsolute(relative)
      || !fs.statSync(handlerPath).isFile() || fs.realpathSync(handlerPath) !== handlerPath) {
    throw new Error(`Command '${name}' handler must be a regular file inside the plugin`);
  }
  fs.mkdirSync(commandsDir, { recursive: true });
  const commandPath = path.join(commandsDir, `${name}.mjs`);
  if (fs.existsSync(commandPath)) throw new Error(`Command '${name}' already exists`);
  const handlerUrl = pathToFileURL(handlerPath).href;
  const content = `// Generated from plugin ${manifest.id}; edit the plugin manifest/handler, then regenerate.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const name = ${JSON.stringify(name)};
const description = ${JSON.stringify(spec.description || '')};
const handlerUrl = ${JSON.stringify(handlerUrl)};
const backgroundAllowed = ${spec.background === true};

export async function run(argv = process.argv, direct = false) {
  const args = argv.slice(direct ? 2 : 3);
  const json = args.includes('--json');
  if (args.includes('--help') || args.includes('-h')) {
    console.log('Usage: total-recall ' + name + ' [args…] [--json]' + (backgroundAllowed ? ' [--background]' : '') + '\\n\\n' + description);
    return;
  }
  try {
    if (args.includes('--background')) {
      if (!backgroundAllowed) throw Object.assign(new Error('Background execution is not enabled for this command'), { exitCode: 2 });
      const reports = path.join(path.dirname(fileURLToPath(import.meta.url)), 'reports');
      fs.mkdirSync(reports, { recursive: true, mode: 0o700 });
      const report = path.join(reports, name + '-' + crypto.randomUUID() + '.log');
      const fd = fs.openSync(report, 'wx', 0o600);
      const child = spawn(process.execPath, [fileURLToPath(import.meta.url), ...args.filter((a) => a !== '--background')], {
        detached: true, stdio: ['ignore', fd, fd]
      });
      fs.closeSync(fd);
      child.unref();
      const status = { ok: true, pid: child.pid, report };
      if (json) console.log(JSON.stringify(status));
      else console.log('Started ' + name + ' in background (pid ' + child.pid + '); report: ' + report);
      return status;
    }
    const handler = await import(handlerUrl);
    const entry = handler.run || handler.default;
    if (typeof entry !== 'function') throw new Error('Plugin command handler must export run() or default function');
    const handlerArgs = args.filter((arg) => arg !== '--json');
    const result = await entry(handler.run ? [process.execPath, 'total-recall', name, ...handlerArgs] : handlerArgs);
    const exitCode = Number.isInteger(result?.exitCode) ? result.exitCode : 0;
    if (json) console.log(JSON.stringify({ ok: exitCode === 0, exit_code: exitCode, result: result?.data ?? result ?? null }));
    process.exitCode = exitCode;
    return result;
  } catch (error) {
    const exitCode = Number.isInteger(error?.exitCode) ? error.exitCode : 1;
    if (json) console.log(JSON.stringify({ ok: false, exit_code: exitCode, error: error.message }));
    else console.error(error.message);
    process.exitCode = exitCode;
  }
}

if (process.argv[1] && fs.realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await run(process.argv, true);
}
`;
  fs.writeFileSync(commandPath, content, { encoding: 'utf8', flag: 'wx', mode: 0o644 });
  return commandPath;
}

/**
 * Generate `total-recall <name> config|<collection>|detect|init` for a layered
 * skill deployed in the repo that owns `commandsDir` (<repo>/.agent/commands).
 * The wrapper holds no config logic: it delegates to the running Total Recall
 * CLI, so the layer contract in the skill core stays the only source of truth.
 */
export function generateSkillConfigCommand(skillId, name, commandsDir) {
  safeCommandName(name);
  safeCommandName(skillId);
  const repoRoot = path.resolve(commandsDir, '..', '..');
  const schemaPath = path.join(repoRoot, '.agent', 'skills', skillId, 'core', 'config.schema.json');
  if (!fs.existsSync(schemaPath) || !fs.statSync(schemaPath).isFile()) {
    throw new Error(`Skill '${skillId}' in ${repoRoot} has no core/config.schema.json; deploy the layered skill first`);
  }
  fs.mkdirSync(commandsDir, { recursive: true });
  const commandPath = path.join(commandsDir, `${name}.mjs`);
  if (fs.existsSync(commandPath)) throw new Error(`Command '${name}' already exists`);
  const fallbackModule = pathToFileURL(path.join(path.dirname(fileURLToPath(import.meta.url)), 'skill-config.mjs')).href;
  const content = `// Generated repo-layer config command for skill ${skillId}; the contract is .agent/skills/${skillId}/core/config.schema.json.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const skillId = ${JSON.stringify(skillId)};
const name = ${JSON.stringify(name)};
const fallbackModule = ${JSON.stringify(fallbackModule)};

// Prefer the Total Recall install that is running this command, so upgrades apply.
function configModule() {
  try {
    const bin = fs.realpathSync(process.argv[1]);
    const candidate = path.join(path.dirname(path.dirname(bin)), 'src', 'cli', 'skill-config.mjs');
    if (path.basename(bin) === 'total-recall.mjs' && fs.existsSync(candidate)) return pathToFileURL(candidate).href;
  } catch { /* fall back to the generating install */ }
  return fallbackModule;
}

export async function run(argv = process.argv) {
  const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
  const { runSkillConfig } = await import(configModule());
  return runSkillConfig(skillId, argv.slice(3), { repoRoot, prefix: 'total-recall ' + name });
}
`;
  fs.writeFileSync(commandPath, content, { encoding: 'utf8', flag: 'wx', mode: 0o644 });
  return commandPath;
}

function printHelp() {
  console.log(`
  total-recall command — Manage custom composable CLI commands

  Usage:
    total-recall command create <name> "<code>" [--global] [--description "<when to use>"] [--risk <class>]
                                                             Create a custom CLI command (listed in instruction surfaces)
    total-recall command create <name> --from-plugin <dir>   Generate from a plugin manifest
    total-recall command create <name> --config-for-skill <id>
                                                             Generate repo-layer config verbs for a
                                                             layered skill deployed in this repo
    total-recall command read <name> [--global]              Read the code of a custom CLI command
    total-recall command update <name> "<code>" [--global]   Update an existing custom CLI command
    total-recall command remove <name> [--global]            Remove a custom CLI command
    total-recall command list [--global] [--json]            List custom CLI commands

  Examples:
    npx total-recall command create hello "console.log('Hello from the brain!');"
    npx total-recall command create my-tool "console.log(args);" --global
    npx total-recall command read hello
    npx total-recall command list
`);
}

export function resolveTargetDir(isGlobal) {
  if (isGlobal) {
    try {
      const gBrain = resolveBrainLayer('global');
      return path.join(gBrain.agentDir, 'commands');
    } catch {
      return path.join(process.env.HOME || '/root', '.agent', 'commands');
    }
  }

  try {
    const pBrain = resolveBrainLayer('project');
    return path.join(pBrain.agentDir, 'commands');
  } catch {
    try {
      const gBrain = resolveBrainLayer('global');
      return path.join(gBrain.agentDir, 'commands');
    } catch {
      return path.join(process.env.HOME || '/root', '.agent', 'commands');
    }
  }
}

export async function run(argv = []) {
  const args = Array.isArray(argv) ? argv.slice(3) : [];
  return commandCmd(args);
}

/**
 * Built-in verbs resolve before custom commands (bin/total-recall.mjs), so a
 * custom command with a built-in name could never run. Read the names from the
 * dispatcher itself so this list cannot drift.
 */
export function builtinCommandNames() {
  try {
    const bin = fs.readFileSync(new URL('../../bin/total-recall.mjs', import.meta.url), 'utf8');
    const block = bin.match(/^const COMMANDS = \{([\s\S]*?)^\};/m)?.[1] || '';
    return new Set([...block.matchAll(/^\s+'?([a-z][a-z0-9-]*)'?\s*:/gm)].map((m) => m[1]));
  } catch {
    return new Set();
  }
}

const RISKS = new Set(['read', 'write', 'money', 'dns-cert', 'production-deploy', 'secret-revoke']);

/** Pull `--flag <value>` pairs out of argv so positional parsing is unaffected. */
function takeOption(list, flag) {
  const i = list.indexOf(flag);
  if (i === -1) return { list, value: undefined };
  return { list: [...list.slice(0, i), ...list.slice(i + 2)], value: list[i + 1] };
}

function headerTags(description, risk) {
  const one = (v) => String(v).replace(/[\r\n]+/g, ' ').trim();
  return (description ? `// @description ${one(description)}\n` : '') + (risk ? `// @risk ${risk}\n` : '');
}

function existingTag(file, key) {
  try { return fs.readFileSync(file, 'utf8').match(new RegExp(`^// @${key} (.+)$`, 'm'))?.[1] || undefined; } catch { return undefined; }
}

/**
 * Composable instructions: the surfaces list every command, so any change to
 * the command set recompiles them (project layer, or every project for global).
 */
export function recompileSurfaces(isGlobal) {
  if (process.env.TR_COMMAND_NO_COMPILE === '1' || !process.argv[1]) return;
  try {
    const child = spawn(process.execPath, [process.argv[1], 'compile', isGlobal ? '--global' : '--project'], { detached: true, stdio: 'ignore' });
    child.unref();
    console.log('  ⏳ Instruction surfaces recompiling in the background (command list updated).');
  } catch (error) {
    console.warn(`  ⚠️  Command saved, but surface recompile failed to start: ${error.message}`);
  }
}

/**
 * Register every `commands` entry of an installed plugin as a composable command.
 * A command that already exists and was generated from this plugin is refreshed;
 * one that exists from anywhere else is left alone and reported.
 */
export function syncPluginCommands(pluginDir, { global: isGlobal = false } = {}) {
  const manifest = JSON.parse(fs.readFileSync(path.join(fs.realpathSync(pluginDir), 'plugin.json'), 'utf8'));
  const commandsDir = resolveTargetDir(isGlobal);
  const result = { created: [], skipped: [] };
  for (const entry of manifest.commands || []) {
    const file = path.join(commandsDir, `${entry.name}.mjs`);
    if (fs.existsSync(file)) {
      if (!fs.readFileSync(file, 'utf8').startsWith(`// Generated from plugin ${manifest.id};`)) {
        result.skipped.push({ name: entry.name, reason: 'a different command with this name exists' });
        continue;
      }
      fs.rmSync(file);
    }
    generatePluginCommand(pluginDir, entry.name, commandsDir);
    result.created.push(entry.name);
  }
  if (result.created.length) recompileSurfaces(isGlobal);
  return result;
}

/** Remove the commands a plugin generated (only files carrying its generated header). */
export function removePluginCommands(pluginId, { global: isGlobal = false } = {}) {
  const commandsDir = resolveTargetDir(isGlobal);
  const removed = [];
  if (!fs.existsSync(commandsDir)) return removed;
  for (const name of fs.readdirSync(commandsDir)) {
    if (!name.endsWith('.mjs')) continue;
    const file = path.join(commandsDir, name);
    if (fs.readFileSync(file, 'utf8').startsWith(`// Generated from plugin ${pluginId};`)) {
      fs.rmSync(file);
      removed.push(name.replace(/\.mjs$/, ''));
    }
  }
  if (removed.length) recompileSurfaces(isGlobal);
  return removed;
}

export default async function commandCmd(rawArgs = []) {
  const isGlobal = rawArgs.includes('--global') || rawArgs.includes('-g');
  const asJson = rawArgs.includes('--json');
  let cleanArgs = rawArgs.filter(a => a !== '--global' && a !== '-g' && a !== '--json');
  let description; let risk;
  ({ list: cleanArgs, value: description } = takeOption(cleanArgs, '--description'));
  ({ list: cleanArgs, value: risk } = takeOption(cleanArgs, '--risk'));
  if (risk !== undefined && !RISKS.has(risk)) {
    console.error(`Error: --risk must be one of ${[...RISKS].join(', ')}`);
    process.exitCode = 2;
    return;
  }

  const action = cleanArgs[0];
  const name = cleanArgs[1];

  if (!action || action === '--help' || action === '-h') {
    printHelp();
    return;
  }

  if (!name && action !== 'list') {
    console.error(`Error: Missing command name.`);
    console.error(`Usage: total-recall command ${action} <name> [--global]`);
    process.exit(1);
  }

  if (name) {
    try { safeCommandName(name); }
    catch (error) { console.error(`Error: ${error.message}`); process.exitCode = 2; return; }
  }

  const commandsDir = resolveTargetDir(isGlobal);

  if (action === 'create') {
    if (builtinCommandNames().has(name)) {
      console.error(`Error: '${name}' is a built-in Total Recall command; a custom command with that name could never run. Choose another name.`);
      process.exitCode = 2;
      return;
    }
    const otherDir = resolveTargetDir(!isGlobal);
    if (path.resolve(otherDir) !== path.resolve(commandsDir) && fs.existsSync(path.join(otherDir, `${name}.mjs`))) {
      console.warn(`  ⚠️  A ${isGlobal ? 'project' : 'global'} command '${name}' already exists (${otherDir}); the project one runs first here.`);
    }
    const forSkill = cleanArgs.indexOf('--config-for-skill');
    if (forSkill !== -1) {
      try {
        if (isGlobal) throw new Error('Repo-layer config commands belong to one repository; omit --global');
        if (!cleanArgs[forSkill + 1]) throw new Error('Missing skill id after --config-for-skill');
        const commandPath = generateSkillConfigCommand(cleanArgs[forSkill + 1], name, commandsDir);
        console.log(`✔ Generated npx total-recall ${name} config|detect|init; saved to: ${commandPath}`);
        recompileSurfaces(isGlobal);
      } catch (error) {
        console.error(`Error: ${error.message}`);
        process.exitCode = 1;
      }
      return;
    }
    const fromPlugin = cleanArgs.indexOf('--from-plugin');
    if (fromPlugin !== -1) {
      try {
        if (!cleanArgs[fromPlugin + 1]) throw new Error('Missing plugin directory after --from-plugin');
        const commandPath = generatePluginCommand(cleanArgs[fromPlugin + 1], name, commandsDir);
        console.log(`✔ Generated npx total-recall ${name} from plugin; saved to: ${commandPath}`);
        recompileSurfaces(isGlobal);
      } catch (error) {
        console.error(`Error: ${error.message}`);
        process.exitCode = 1;
      }
      return;
    }
    const code = cleanArgs[2];
    if (!code) {
      console.error(`Error: Missing code snippet for the command.`);
      console.error(`Usage: total-recall command create <name> "<code>" [--global]`);
      process.exit(1);
    }

    if (!fs.existsSync(commandsDir)) {
      fs.mkdirSync(commandsDir, { recursive: true });
    }

    const commandPath = path.join(commandsDir, `${name}.mjs`);
    if (fs.existsSync(commandPath)) {
      console.error(`Error: Custom command '${name}' already exists.`);
      process.exitCode = 1;
      return;
    }
    
    // Wrap code in an exported run/default function for composable CLI execution
    const fileContent = `// Auto-generated custom CLI command: ${name}
${headerTags(description, risk)}export async function run(argv = []) {
  const args = Array.isArray(argv) ? argv.slice(3) : [];
  ${code}
}
export default async function (args = []) {
  ${code}
}
`;

    fs.writeFileSync(commandPath, fileContent, 'utf8');
    console.log(`\x1b[32m✔ Successfully created custom command: \x1b[1mnpx total-recall ${name}\x1b[0m`);
    console.log(`  Saved to: ${commandPath}`);
    if (!description) console.log('  Tip: add --description "<when to use it>" so the instruction surfaces say when to use this command.');
    recompileSurfaces(isGlobal);
  } else if (action === 'read') {
    const commandPath = path.join(commandsDir, `${name}.mjs`);
    if (fs.existsSync(commandPath)) {
      console.log(fs.readFileSync(commandPath, 'utf8'));
    } else {
      console.error(`Error: Custom command '${name}' does not exist in ${commandsDir}.`);
      process.exit(1);
    }
  } else if (action === 'update') {
    const code = cleanArgs[2];
    if (!code) {
      console.error(`Error: Missing code snippet for the command.`);
      console.error(`Usage: total-recall command update <name> "<code>" [--global]`);
      process.exit(1);
    }

    const commandPath = path.join(commandsDir, `${name}.mjs`);
    if (!fs.existsSync(commandPath)) {
      console.error(`Error: Custom command '${name}' does not exist in ${commandsDir}.`);
      process.exit(1);
    }

    // Keep the declared description/risk unless the update replaces them.
    const keptDescription = description ?? existingTag(commandPath, 'description');
    const keptRisk = risk ?? existingTag(commandPath, 'risk');
    const fileContent = `// Auto-generated custom CLI command: ${name}
${headerTags(keptDescription, keptRisk)}export async function run(argv = []) {
  const args = Array.isArray(argv) ? argv.slice(3) : [];
  ${code}
}
export default async function (args = []) {
  ${code}
}
`;

    fs.writeFileSync(commandPath, fileContent, 'utf8');
    console.log(`\x1b[32m✔ Successfully updated custom command: \x1b[1m${name}\x1b[0m`);
    console.log(`  Saved to: ${commandPath}`);
    recompileSurfaces(isGlobal);
  } else if (action === 'list') {
    const targets = isGlobal 
      ? [{ label: 'Global', dir: resolveTargetDir(true) }]
      : [
          { label: 'Project', dir: resolveTargetDir(false) },
          { label: 'Global', dir: resolveTargetDir(true) }
        ];

    if (asJson) {
      const { listSurfaceCommands } = await import('../core/command-surface.mjs');
      console.log(JSON.stringify(listSurfaceCommands(targets.map((t) => ({ scope: t.label.toLowerCase(), dir: t.dir })))));
      return;
    }
    let foundAny = false;
    for (const t of targets) {
      if (fs.existsSync(t.dir)) {
        const files = fs.readdirSync(t.dir).filter(f => f.endsWith('.mjs'));
        if (files.length > 0) {
          foundAny = true;
          console.log(`\x1b[1m${t.label} CLI commands (${t.dir}):\x1b[0m`);
          files.forEach(f => {
            console.log(`  - \x1b[36m${f.replace('.mjs', '')}\x1b[0m (npx total-recall ${f.replace('.mjs', '')})`);
          });
        }
      }
    }
    if (!foundAny) {
      console.log('No custom commands found.');
    }
  } else if (action === 'remove') {
    const commandPath = path.join(commandsDir, `${name}.mjs`);
    if (fs.existsSync(commandPath)) {
      fs.unlinkSync(commandPath);
      console.log(`\x1b[32m✔ Successfully removed custom command: \x1b[1m${name}\x1b[0m`);
      recompileSurfaces(isGlobal);
    } else {
      console.error(`Error: Custom command '${name}' does not exist.`);
      process.exit(1);
    }
  } else {
    console.error(`Unknown action: ${action}`);
    printHelp();
    process.exit(1);
  }
}
