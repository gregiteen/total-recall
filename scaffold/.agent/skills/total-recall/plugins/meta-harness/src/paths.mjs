/** Every persistent path resolves here, at call time, so an isolated environment reaches no live store. */
import os from 'node:os';
import path from 'node:path';

export function brainDir(env = process.env) {
  const dir = env.TR_SECRETS_BRAIN || path.join(env.AGENT_DIR || path.join(env.HOME || os.homedir(), '.agent'), 'skills/total-recall');
  // The node test runner marks its children. A run without test/isolate.mjs must fail, not write fake runs into the live ledger.
  if (env.NODE_TEST_CONTEXT && !path.resolve(dir).startsWith(path.resolve(os.tmpdir()))) {
    throw new Error(`Refusing to reach the live store ${dir} from a test: run the suite with npm test.`);
  }
  return dir;
}
export const configDir = (env = process.env) => path.join(brainDir(env), 'config', 'meta-harness');
export const derivedDir = (env = process.env) => path.join(brainDir(env), 'memory-derived', 'meta-harness');
export const threadsFile = (env = process.env) => path.join(brainDir(env), 'config', 'meta-harness-threads.json');
export const receiptsFile = (env = process.env) => path.join(configDir(env), 'runs.jsonl');
