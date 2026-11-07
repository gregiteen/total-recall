/** Runtime observations and explicit maintenance. Agent work belongs to dispatch. */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { getActiveAdapters, findBinary, runProcess, agentEnvironment } from './worker.mjs';

const DSH_OBSERVATIONS = ['status', 'sessions', 'tools', 'models', 'model', 'plugins', 'help'];
const MAINTENANCE = new Map([
  ['claude', [['auth', 'status']]],
  ['codex', [['login', 'status']]],
  ['cursor', [['status']]],
  ['dsh', [...DSH_OBSERVATIONS.map(operation => [operation]), ['model', '--cache']]],
  ['hermes', [['status'], ['status', '--full'], ['gateway', 'status'], ['skills', 'list'], ['plugins', 'list'], ['auth']]],
  ['ollama', [['list'], ['ps']]],
  ['openclaw', [['status'], ['health'], ['gateway', 'status'], ['plugins', 'list']]],
]);

export function validateRuntimeOperation(agent, args = []) {
  if (typeof agent !== 'string' || !/^[a-z][a-z0-9-]{0,63}$/.test(agent)) throw new Error('Invalid agent adapter');
  if (!Array.isArray(args) || args.length > 64 || args.some(arg => typeof arg !== 'string' || arg.length > 8192)) throw new Error('Invalid native runtime arguments');
  if (args.some(arg => /(?:api[-_]?key|password|secret|access[-_]?token|refresh[-_]?token)/i.test(arg))) throw new Error('Credential values and mutations belong to the auth owner, never runtime argv');
  const command = args.length ? args : [agent === 'dsh' ? 'status' : '--help'];
  const supported = [['--help'], ['-h'], ['--version'], ...(MAINTENANCE.get(agent) || [])];
  if (!supported.some(tuple => tuple.length === command.length && tuple.every((word, index) => word === command[index]))) {
    throw new Error('Runtime accepts only supported maintenance commands. Use meta-harness dispatch or route --execute for agent work, or the owning plugin for service changes.');
  }
  return command;
}

export async function manageRuntime(agent, args = [], { env = process.env, probe = runProcess, cwd = process.cwd() } = {}) {
  args = validateRuntimeOperation(agent, args);
  const adapter = getActiveAdapters().find(item => item.id === agent);
  if (!adapter) throw new Error('Unknown agent adapter');
  if (agent === 'dsh' && DSH_OBSERVATIONS.includes(args[0])) {
    const { run } = await import('./adapters/dsh.mjs');
    const lines = [], errors = [], log = console.log, error = console.error;
    const previous = process.exitCode;
    let result, code;
    try {
      console.log = (...parts) => lines.push(parts.join(' ')); console.error = (...parts) => errors.push(parts.join(' '));
      result = await run([process.execPath, 'meta-harness', 'dsh', ...args]);
      code = process.exitCode || 0;
    } finally { console.log = log; console.error = error; process.exitCode = previous; }
    return { ok:code === 0, agent, exitCode:code, data:result?.data, output:lines.join('\n'), error:errors.join('\n') || undefined };
  }
  if (agent === 'hermes' && args[0] === 'auth') {
    const binary = findBinary('total-recall', env);
    if (!binary) throw new Error('Total Recall auth CLI is unavailable');
    const home = env.HERMES_HOME || path.join(env.HOME || os.homedir(), '.hermes');
    fs.mkdirSync(home, { recursive:true, mode:0o700 });
    const result = await probe(binary, ['auth','secret','export-env','--path',home,'--keys','OPENROUTER_API_KEY,HERMES_TELEGRAM_BOT_TOKEN,TELEGRAM_ALLOWED_USERS','--rename','HERMES_TELEGRAM_BOT_TOKEN=TELEGRAM_BOT_TOKEN','--no-example'], { cwd:home, timeoutMs:30000, env:agentEnvironment(env) });
    return { ok:result.exitCode===0 && !result.reason, agent, authority:'auth', exitCode:result.exitCode, output:result.stdout, error:result.reason || (result.exitCode ? 'Auth projection failed' : undefined) };
  }
  const binary = findBinary(adapter.binary, env);
  if (!binary) throw new Error(`${adapter.name} is not installed on the selected node`);
  const result = await probe(binary, args, { cwd, timeoutMs:60000, env:agentEnvironment(env) });
  return { ok:result.exitCode===0 && !result.reason, agent, exitCode:result.exitCode, output:result.stdout || (result.exitCode === 0 ? result.stderr : ''), error:result.reason || (result.exitCode ? result.stderr || 'Runtime command failed' : undefined) };
}
