/** Every persistent path resolves here, at call time, so an isolated environment reaches no live store. */
import os from 'node:os';
import path from 'node:path';

export function brainDir(env = process.env) {
  return env.TR_SECRETS_BRAIN || path.join(env.AGENT_DIR || path.join(env.HOME || os.homedir(), '.agent'), 'skills/total-recall');
}
export const configDir = (env = process.env) => path.join(brainDir(env), 'config', 'meta-harness');
export const derivedDir = (env = process.env) => path.join(brainDir(env), 'memory-derived', 'meta-harness');
export const threadsFile = (env = process.env) => path.join(brainDir(env), 'config', 'meta-harness-threads.json');
export const receiptsFile = (env = process.env) => path.join(configDir(env), 'runs.jsonl');
