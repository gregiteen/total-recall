/**
 * Where a repository keeps its code-quality state (config.json, reports, lock).
 * The runner itself lives in this plugin and is never copied into a repo.
 * TR_CODE_QUALITY_STATE overrides; otherwise state belongs to the nearest
 * repository and is never inherited from another repository or the home skill.
 */
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

export function stateDir(start = process.cwd(), env = process.env) {
  if (env.TR_CODE_QUALITY_STATE) return path.resolve(env.TR_CODE_QUALITY_STATE);
  const origin = path.resolve(start);
  const home = path.resolve(env.HOME || os.homedir());
  const stateAt = directory => path.join(directory, '.agent', 'skills', 'code-quality');
  let dir = origin;
  for (;;) {
    // A shared home skill supplies methods, never another project's configuration.
    if (dir === home && dir !== origin) return stateAt(origin);
    const candidate = stateAt(dir);
    if (fs.existsSync(candidate)) return candidate;
    // Linked worktrees and submodules use a .git file instead of a directory.
    if (fs.existsSync(path.join(dir, '.git'))) return candidate;
    const parent = path.dirname(dir);
    if (parent === dir) return stateAt(origin);
    dir = parent;
  }
}
