/**
 * Hook files for harnesses that read Claude Code's shape: an event maps to groups, and each
 * group holds a matcher and a `hooks` array. An entry with `command` directly on the group is
 * skipped by these harnesses, so earlier installs that wrote that form never fired.
 */
import fs from 'node:fs';
import path from 'node:path';

export const gateCommand = (harness) => `total-recall preflight gate --harness ${harness}`;

/**
 * The gate command with the binary's full path, for a harness that may run outside this
 * shell's PATH (a background gateway) and fails closed when it cannot find the command.
 */
export function gateCommandWithPath(harness, env = process.env) {
  for (const dir of String(env.PATH || '').split(path.delimiter)) {
    const candidate = path.join(dir || '.', 'total-recall');
    try {
      fs.accessSync(candidate, fs.constants.X_OK);
      return `${candidate} preflight gate --harness ${harness}`;
    } catch { /* keep looking */ }
  }
  return gateCommand(harness);
}

const isGate = (command, harness) => String(command || '').includes(`preflight gate --harness ${harness}`);
const nested = (group, harness) => Array.isArray(group?.hooks) && group.hooks.some((hook) => isGate(hook?.command, harness));
const flat = (group, harness) => isGate(group?.command, harness);

/** True when the gate is in the form the harness runs. */
export function hasGate(groups, harness) {
  return Array.isArray(groups) && groups.some((group) => nested(group, harness));
}

/**
 * The groups for one event with the gate present, or absent when `remove` is set. Other
 * hooks are left alone. An entry in the form the harness skips is replaced.
 */
export function mergeGate(groups, harness, { remove = false, matcher = '*', timeout = 10, command = gateCommand(harness) } = {}) {
  const existing = Array.isArray(groups) ? groups : [];
  const added = [];
  const removed = [];
  const kept = existing.filter((group) => {
    if (flat(group, harness)) { removed.push('gate entry in a form the harness skips'); return false; }
    if (remove && nested(group, harness)) { removed.push('managed gate'); return false; }
    return true;
  });
  if (!remove && !hasGate(kept, harness)) {
    kept.push({ ...(matcher ? { matcher } : {}), hooks: [{ type: 'command', command, timeout }] });
    added.push('managed PreToolUse gate');
  }
  return { groups: kept, added, removed };
}

export function readJsonFile(file, fallback = {}) {
  if (!fs.existsSync(file)) return fallback;
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8') || '{}');
  } catch (err) {
    throw new Error(`${file} is not valid JSON; fix it before installing hooks: ${err.message}`);
  }
}

export function readJsonQuietly(file) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return {}; }
}

export function writeJsonFile(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  if (fs.existsSync(file)) fs.copyFileSync(file, `${file}.bak-total-recall`);
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);
}

/**
 * Delete a file an earlier install wrote where the harness never looks. Only a file whose
 * sole content is this gate goes; anything else in it means someone else is using it.
 */
export function removeDeadGateFile(file, harness, { dryRun = false } = {}) {
  if (!fs.existsSync(file)) return [];
  const text = fs.readFileSync(file, 'utf8');
  const commands = [...text.matchAll(/"command"\s*:\s*"([^"]*)"/g)].map((match) => match[1]);
  if (!commands.length || !commands.every((command) => isGate(command, harness))) return [];
  if (!dryRun) fs.rmSync(file);
  return [`${path.basename(file)}, which the harness does not read`];
}
