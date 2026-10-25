import fs from 'node:fs';
import path from 'node:path';
import { globalAgentDir, resolveBrainLayer } from './config.mjs';
import { commandScopeDirectories } from './command-surface.mjs';

/** Execution and invoke discovery use the same selected brain as the CLI. */
export function composedCommandDirectories(target = process.cwd()) {
  let projectAgentDir = null;
  try { projectAgentDir = resolveBrainLayer('project', undefined, target).agentDir; } catch {}
  return commandScopeDirectories(target, globalAgentDir, { projectAgentDir });
}

/** Resolve statically; importing a candidate is an execution boundary. */
export function resolveComposedCommand(name, dirs = composedCommandDirectories()) {
  if (!/^[a-z][a-z0-9-]{0,63}$/.test(name)) return null;
  for (const { dir } of dirs) {
    const file = path.join(dir, `${name}.mjs`);
    try { if (fs.statSync(file).isFile()) return file; } catch {}
  }
  return null;
}
