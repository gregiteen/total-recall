import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
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

function printHelp() {
  console.log(`
  total-recall command — Manage custom composable CLI commands

  Usage:
    total-recall command create <name> "<code>" [--global]   Create a custom CLI command
    total-recall command create <name> --from-plugin <dir>   Generate from a plugin manifest
    total-recall command read <name> [--global]              Read the code of a custom CLI command
    total-recall command update <name> "<code>" [--global]   Update an existing custom CLI command
    total-recall command remove <name> [--global]            Remove a custom CLI command
    total-recall command list [--global]                     List custom CLI commands

  Examples:
    npx total-recall command create hello "console.log('Hello from the brain!');"
    npx total-recall command create my-tool "console.log(args);" --global
    npx total-recall command read hello
    npx total-recall command list
`);
}

function resolveTargetDir(isGlobal) {
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

export default async function commandCmd(rawArgs = []) {
  const isGlobal = rawArgs.includes('--global') || rawArgs.includes('-g');
  const cleanArgs = rawArgs.filter(a => a !== '--global' && a !== '-g');

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
    const fromPlugin = cleanArgs.indexOf('--from-plugin');
    if (fromPlugin !== -1) {
      try {
        if (!cleanArgs[fromPlugin + 1]) throw new Error('Missing plugin directory after --from-plugin');
        const commandPath = generatePluginCommand(cleanArgs[fromPlugin + 1], name, commandsDir);
        console.log(`✔ Generated npx total-recall ${name} from plugin; saved to: ${commandPath}`);
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
export async function run(argv = []) {
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

    const fileContent = `// Auto-generated custom CLI command: ${name}
export async function run(argv = []) {
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
  } else if (action === 'list') {
    const targets = isGlobal 
      ? [{ label: 'Global', dir: resolveTargetDir(true) }]
      : [
          { label: 'Project', dir: resolveTargetDir(false) },
          { label: 'Global', dir: resolveTargetDir(true) }
        ];

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
