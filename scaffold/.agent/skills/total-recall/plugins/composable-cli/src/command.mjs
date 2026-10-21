import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { spawn } from 'node:child_process';
import { EXIT_CODES } from './contract.mjs';

const COMMAND_NAME = /^[a-z][a-z0-9-]{0,63}$/;
export const RISKS = new Set(['read', 'write', 'money', 'dns-cert', 'production-deploy', 'secret-revoke']);

export function safeCommandName(name) {
  if (!COMMAND_NAME.test(name || '')) {
    throw new Error('Command name must be lowercase kebab-case (1–64 characters)');
  }
  return name;
}

export function isSafeRelativePath(p) {
  if (typeof p !== 'string' || !p.trim() || p.includes('\0')) return false;
  if (path.isAbsolute(p)) return false;
  const normalized = path.normalize(p);
  if (normalized.startsWith(`..${path.sep}`) || normalized === '..') return false;
  return true;
}

export function builtinCommandNames() {
  return new Set([
    'help',
    'version',
    'status',
    'recall',
    'remember',
    'compile',
    'resolve',
    'secret',
    'secrets',
    'harness',
    'agent',
    'mesh',
    'brief',
    'group',
    'groups',
    'project-id',
    'skill',
    'skills',
    'plugin',
    'plugins',
    'app',
    'command',
    'start',
  ]);
}

function headerTags(description, risk) {
  const one = (v) => String(v).replace(/[\r\n]+/g, ' ').trim();
  return (description ? `// @description ${one(description)}\n` : '') + (risk ? `// @risk ${risk}\n` : '');
}

function existingTag(file, key) {
  try {
    return fs.readFileSync(file, 'utf8').match(new RegExp(`^// @${key} (.+)$`, 'm'))?.[1] || undefined;
  } catch {
    return undefined;
  }
}

export function generatePluginCommand(pluginDir, name, commandsDir) {
  safeCommandName(name);
  const root = fs.realpathSync(pluginDir);
  const manifestPath = path.join(root, 'plugin.json');
  if (!fs.existsSync(manifestPath) || !fs.statSync(manifestPath).isFile()) {
    throw new Error('Plugin manifest must be a regular file');
  }
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
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

export function generateSkillConfigCommand(skillId, name, commandsDir, options = {}) {
  safeCommandName(name);
  safeCommandName(skillId);
  const repoRoot = options.repoRoot || path.resolve(commandsDir, '..', '..');
  const schemaPath = path.join(repoRoot, '.agent', 'skills', skillId, 'core', 'config.schema.json');
  if (!fs.existsSync(schemaPath) || !fs.statSync(schemaPath).isFile()) {
    throw new Error(`Skill '${skillId}' in ${repoRoot} has no core/config.schema.json; deploy the layered skill first`);
  }
  fs.mkdirSync(commandsDir, { recursive: true });
  const commandPath = path.join(commandsDir, `${name}.mjs`);
  if (fs.existsSync(commandPath)) throw new Error(`Command '${name}' already exists`);

  const content = `// Generated repo-layer config command for skill ${skillId}; the contract is .agent/skills/${skillId}/core/config.schema.json.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const skillId = ${JSON.stringify(skillId)};
const name = ${JSON.stringify(name)};

export async function run(argv = process.argv) {
  const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
  const candidate = path.join(repoRoot, '.agent', 'skills', 'total-recall', 'src', 'cli', 'skill-config.mjs');
  const { runSkillConfig } = await import(pathToFileURL(candidate).href);
  return runSkillConfig(skillId, argv.slice(3), { repoRoot, prefix: 'total-recall ' + name });
}
`;
  fs.writeFileSync(commandPath, content, { encoding: 'utf8', flag: 'wx', mode: 0o644 });
  return commandPath;
}

export function commandCreate(options = {}) {
  const {
    name,
    code,
    description,
    risk,
    commandsDir,
    fromPlugin,
    configForSkill,
    repoRoot,
  } = options;

  safeCommandName(name);

  if (builtinCommandNames().has(name)) {
    const err = new Error(`'${name}' is a built-in Total Recall command; a custom command with that name could never run.`);
    err.exitCode = EXIT_CODES.USAGE;
    throw err;
  }

  if (configForSkill) {
    return generateSkillConfigCommand(configForSkill, name, commandsDir, { repoRoot });
  }

  if (fromPlugin) {
    return generatePluginCommand(fromPlugin, name, commandsDir);
  }

  if (!code) {
    const err = new Error('Missing code snippet for the command');
    err.exitCode = EXIT_CODES.USAGE;
    throw err;
  }

  fs.mkdirSync(commandsDir, { recursive: true });
  const commandPath = path.join(commandsDir, `${name}.mjs`);
  if (fs.existsSync(commandPath)) {
    const err = new Error(`Custom command '${name}' already exists.`);
    err.exitCode = EXIT_CODES.ERROR;
    throw err;
  }

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
  return commandPath;
}

export function commandRead(name, commandsDir) {
  safeCommandName(name);
  const commandPath = path.join(commandsDir, `${name}.mjs`);
  if (!fs.existsSync(commandPath)) {
    const err = new Error(`Custom command '${name}' does not exist in ${commandsDir}.`);
    err.exitCode = EXIT_CODES.ERROR;
    throw err;
  }
  return fs.readFileSync(commandPath, 'utf8');
}

export function commandUpdate(options = {}) {
  const {
    name,
    code,
    description,
    risk,
    commandsDir,
  } = options;

  safeCommandName(name);
  const commandPath = path.join(commandsDir, `${name}.mjs`);
  if (!fs.existsSync(commandPath)) {
    const err = new Error(`Custom command '${name}' does not exist in ${commandsDir}.`);
    err.exitCode = EXIT_CODES.ERROR;
    throw err;
  }

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
  return commandPath;
}

export function commandRemove(name, commandsDir) {
  safeCommandName(name);
  const commandPath = path.join(commandsDir, `${name}.mjs`);
  if (!fs.existsSync(commandPath)) {
    const err = new Error(`Custom command '${name}' does not exist.`);
    err.exitCode = EXIT_CODES.ERROR;
    throw err;
  }
  fs.unlinkSync(commandPath);
  return true;
}

export function commandList(targets = []) {
  const results = [];
  for (const t of targets) {
    if (fs.existsSync(t.dir)) {
      const files = fs.readdirSync(t.dir).filter((f) => f.endsWith('.mjs'));
      for (const f of files) {
        const fullPath = path.join(t.dir, f);
        const name = f.replace(/\.mjs$/, '');
        results.push({
          name,
          scope: t.scope || 'project',
          path: fullPath,
          description: existingTag(fullPath, 'description') || null,
          risk: existingTag(fullPath, 'risk') || null,
        });
      }
    }
  }
  return results;
}
