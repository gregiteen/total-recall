import os from 'node:os';
import path from 'node:path';

/**
 * The host credential authority is independent of a caller's project brain.
 * TR_SECRETS_BRAIN is the explicit operational override. The _TR_TEST_* roots
 * preserve disposable test isolation without making AGENT_DIR/TR_BRAIN stores.
 * This selector only resolves a path; it never opens or initializes a store.
 */
export function hostSecretsBrainDir() {
  if (process.env.TR_SECRETS_BRAIN) return process.env.TR_SECRETS_BRAIN;
  if (process.env._TR_TEST_BRAIN_DIR) return process.env._TR_TEST_BRAIN_DIR;
  const agentRoot = process.env._TR_TEST_AGENT_DIR || path.join(os.homedir(), '.agent');
  return path.join(agentRoot, 'skills', 'total-recall');
}
