/**
 * Where a repository keeps its code-quality state (config.json, reports, lock).
 * The runner itself lives in this plugin and is never copied into a repo.
 * TR_CODE_QUALITY_STATE overrides; otherwise the nearest enclosing
 * .agent/skills/code-quality directory, or one beside the current directory.
 */
import fs from 'node:fs';
import path from 'node:path';

export function stateDir(start = process.cwd()) {
  if (process.env.TR_CODE_QUALITY_STATE) return path.resolve(process.env.TR_CODE_QUALITY_STATE);
  let dir = path.resolve(start);
  for (;;) {
    const candidate = path.join(dir, '.agent', 'skills', 'code-quality');
    if (fs.existsSync(candidate)) return candidate;
    const parent = path.dirname(dir);
    if (parent === dir) return path.join(path.resolve(start), '.agent', 'skills', 'code-quality');
    dir = parent;
  }
}
