/**
 * Shared `.agent/` directory resolver for CLI commands that operate on
 * a vault. Workspace-local wins over the user's global brain when
 * `./.agent/memory-vault/` exists, so `cd my-project && total-recall <cmd>`
 * targets the project's vault rather than the personal one.
 *
 * Commands that legitimately target the host-global brain (deploy, daemon
 * start/stop, upgrade, sync — which uses its own brain.json) bypass this
 * helper.
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export function resolveAgentDir() {
  if (process.env.AGENT_DIR) {
    return process.env.AGENT_DIR;
  }
  const localDir = path.join(process.cwd(), '.agent');
  if (fs.existsSync(path.join(localDir, 'memory-vault'))) {
    return localDir;
  }
  return path.join(os.homedir(), '.agent');
}
