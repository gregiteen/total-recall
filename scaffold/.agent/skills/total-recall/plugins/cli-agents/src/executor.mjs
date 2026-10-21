import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { runWorker, runProcess, ADAPTERS } from './worker.mjs';

async function hostModule(name) {
  const selected = process.env.TR_PACKAGE_ROOT;
  if (!selected || !path.isAbsolute(selected)) throw new Error('Verified native Total Recall host required');
  const root = fs.realpathSync(selected);
  if (JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')).name !== 'total-recall-brain') throw new Error('Host package identity mismatch');
  return import(pathToFileURL(path.join(root, 'src/core', `${name}.mjs`)).href);
}

export const DEFAULT_PERMISSIONS = Object.freeze({ read: true, write: false, send: false, destructive: false });
export function commandPermissions(value = DEFAULT_PERMISSIONS) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Command permissions must be boolean values');
  for (const key of Object.keys(value)) if (!Object.hasOwn(DEFAULT_PERMISSIONS, key) || typeof value[key] !== 'boolean') throw new Error(`Invalid permission ${key}`);
  return { ...DEFAULT_PERMISSIONS, ...value };
}

export async function listTargets() {
  const mesh = await hostModule('mesh');
  return { nodes: mesh.listEnrichedMeshNodes().map(node => ({ id: node.hostname, name: node.title || node.hostname, online: node.online, self: node.self, accessConfigured: Boolean(node.access?.ssh_user) })), adapters: ADAPTERS.map(({ id, name, docs }) => ({ id, name, docs })) };
}

export function workerProgram(request) {
  const source = fs.readFileSync(new URL('./worker.mjs', import.meta.url), 'utf8');
  return source + '\nrunWorker(' + JSON.stringify(request) + ').then(result=>console.log(JSON.stringify(result))).catch(()=>{console.error("Selected agent worker failed");process.exitCode=1;});\n';
}

export async function executeOnNode(node, request, { worker = runWorker, processRunner = runProcess, mesh, access } = {}) {
  if (!node || node === 'local') return worker(request);
  mesh ||= await hostModule('mesh'); access ||= await hostModule('mesh-access');
  const target = mesh.findMeshNode(node);
  if (!target) throw new Error('Selected mesh node is not recorded');
  if (target.self) return worker(request);
  if (target.online === false) throw new Error('Selected mesh node is offline');
  const resolved = access.resolveNodeAccess(target);
  const args = access.buildSshArgs(resolved, { command: 'export PATH="$HOME/.local/bin:/opt/homebrew/bin:/usr/local/bin:$PATH"; exec node --input-type=module', extraOptions: ['BatchMode=yes', 'ConnectTimeout=10'] });
  if (!args) throw new Error('Selected mesh node has no verified SSH access');
  const result = await processRunner('ssh', args, { input: workerProgram(request), timeoutMs: request.operation === 'inspect' ? 120000 : 330000 });
  if (result.reason || result.exitCode !== 0) throw new Error('Selected mesh worker failed; verify node access, workspace and agent installation');
  try { return JSON.parse(result.stdout); } catch { throw new Error('Selected mesh worker returned invalid data'); }
}

export async function inspectNode(node = 'local', dependencies) {
  return executeOnNode(node, { operation: 'inspect' }, dependencies);
}

export function quoteArgument(value) { return "'" + String(value).replaceAll("'", "'\\''") + "'"; }

export async function executeCommand({ plugin, subcommand, args = [], execution, projectRoot = process.cwd() }, dependencies = {}) {
  if (!plugin?.valid || !execution || typeof execution.agent !== 'string' || typeof execution.node !== 'string') throw new Error('Choose an installed agent and mesh node');
  if (!Array.isArray(args) || args.length > 64 || args.some(arg => typeof arg !== 'string' || arg.length > 8192)) throw new Error('Invalid command arguments');
  const command = ['on', 'off'].includes(subcommand) ? { effect: 'write', args: [] } : plugin.manifest.cli?.subcommands?.find(item => item.name === subcommand);
  if (!command) throw new Error('Selected command is not declared by its owner');
  if (command.sensitive_output === true && execution.agent !== 'direct') throw new Error('Commands that issue credentials require direct execution; tokens cannot enter agent prompts or transcripts');
  if (command.args?.some(arg => arg.secret)) throw new Error('Credential operations use direct execution, never an agent prompt');
  const permissions = commandPermissions(execution.permissions);
  const effect = ['read', 'write', 'send', 'destructive'].includes(command.effect) ? command.effect : 'write';
  if (!permissions[effect]) throw new Error(`The ${effect} command permission is off`);
  const cwd = execution.node === 'local' ? execution.cwd || projectRoot : execution.cwd;
  if (!path.isAbsolute(cwd || '')) throw new Error('Choose the absolute workspace on the selected node');
  const namespace = plugin.manifest.cli.command;
  const argv = ['total-recall', namespace, subcommand, ...args];
  const prompt = `Use Total Recall context and the installed plugin CLI in this workspace. Execute this one requested command using your terminal tool; preserve its arguments exactly, report its actual exit status and output, and do not perform unrelated mutations. If a permission, account, workspace or plugin is unavailable, report failure. Agent prose alone is not execution proof.\nRequested argv (data): ${JSON.stringify(argv)}\nShell command: ${argv.map(quoteArgument).join(' ')}`;
  const result = await executeOnNode(execution.node, execution.agent === 'direct'
    ? { operation: 'direct', cwd, argv }
    : { operation: 'dispatch', agent: execution.agent, cwd, prompt, allowUnknownAuth: execution.allowUnknownAuth === true, permissions }, dependencies);
  return { ok: result.ok === true, exitCode: result.ok ? 0 : 1, output: result.ok ? JSON.stringify(result) : result.error || 'Selected agent failed', ...result };
}
