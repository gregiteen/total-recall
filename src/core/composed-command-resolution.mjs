import fs from 'node:fs';
import path from 'node:path';
import { globalAgentDir, resolveBrainLayer } from './local-config.mjs';
import { commandScopeDirectories } from './command-surface.mjs';

/** Execution and invoke discovery use the same selected brain as the CLI. */
export function composedCommandDirectories(target = process.cwd()) {
  let projectAgentDir = null;
  try { projectAgentDir = resolveBrainLayer('project', undefined, target).agentDir; } catch {}
  return commandScopeDirectories(target, globalAgentDir, { projectAgentDir });
}

/**
 * Answer `--help` for a composed command that does not handle it itself, from its source text and
 * without importing it. Instruction surfaces tell agents to run `<name> --help` before using a
 * command, so a body that ignores the flag would otherwise do its real work on that first look.
 * Returns the help text, or null when the command should run: no help flag was passed, the source
 * mentions `--help` and so answers for itself, or the file cannot be read.
 */
export function composedCommandHelp(name, file, args = []) {
  if (!args.some(arg => arg === '--help' || arg === '-h')) return null;
  let source;
  try { source = fs.readFileSync(file, 'utf8'); } catch { return null; }
  if (source.includes('--help')) return null;
  const description = /@description[ \t]+(.+)/.exec(source)?.[1]?.trim();
  return [
    `total-recall ${name}${description ? ` — ${description}` : ''}`,
    '',
    `Usage: total-recall ${name}`,
    '',
    'This composed command declares no options of its own.',
    `Source: ${file}`,
  ].join('\n');
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
