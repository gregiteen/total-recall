/** One native runtime-management boundary for every installed agent. */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { ADAPTERS, findBinary, runProcess, agentEnvironment } from './worker.mjs';

export async function manageRuntime(agent, args = [], { env = process.env, probe = runProcess, cwd = process.cwd() } = {}) {
  const adapter = ADAPTERS.find(item => item.id === agent);
  if (!adapter) throw new Error('Unknown agent adapter');
  if (!Array.isArray(args) || args.length > 64 || args.some(arg => typeof arg !== 'string' || arg.length > 8192)) throw new Error('Invalid native runtime arguments');
  if (args.some(arg => /(?:api[-_]?key|password|secret|access[-_]?token|refresh[-_]?token)/i.test(arg))) throw new Error('Credential values and mutations belong to the auth owner, never runtime argv');
  if (agent === 'dsh' && ['status','sessions','tools','models','model','plugins','help','--help','-h'].includes(args[0] || 'status')) {
    const { run } = await import('./adapters/dsh.mjs');
    const lines = [], errors = [], log = console.log, error = console.error;
    const previous = process.exitCode;
    let result, code;
    try {
      console.log = (...parts) => lines.push(parts.join(' ')); console.error = (...parts) => errors.push(parts.join(' '));
      result = await run([process.execPath, 'cli-agents', 'dsh', ...args]);
      code = process.exitCode || 0;
    } finally { console.log = log; console.error = error; process.exitCode = previous; }
    return { ok:code === 0, agent, exitCode:code, data:result?.data, output:lines.join('\n'), error:errors.join('\n') || undefined };
  }
  if (agent === 'hermes' && args[0] === 'auth') {
    const binary = findBinary('total-recall', env);
    if (!binary) throw new Error('Total Recall auth CLI is unavailable');
    const home = env.HERMES_HOME || path.join(env.HOME || os.homedir(), '.hermes');
    fs.mkdirSync(home, { recursive:true, mode:0o700 });
    const result = await probe(binary, ['auth','secret','export-env','--path',home,'--keys','OPENROUTER_API_KEY,TELEGRAM_BOT_TOKEN,TELEGRAM_ALLOWED_USERS'], { cwd, timeoutMs:30000, env:agentEnvironment(env) });
    return { ok:result.exitCode===0 && !result.reason, agent, authority:'auth', exitCode:result.exitCode, output:result.stdout, error:result.reason || (result.exitCode ? 'Auth projection failed' : undefined) };
  }
  const binary = findBinary(adapter.binary, env);
  if (!binary) throw new Error(`${adapter.name} is not installed on the selected node`);
  const result = await probe(binary, args.length ? args : ['--help'], { cwd, timeoutMs:60000, env:agentEnvironment(env) });
  return { ok:result.exitCode===0 && !result.reason, agent, exitCode:result.exitCode, output:result.stdout, error:result.reason || (result.exitCode ? result.stderr || 'Runtime command failed' : undefined) };
}
