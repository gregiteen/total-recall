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

/**
 * Seconds a launcher waits for a command an update is replacing: the one measured outage ran
 * past 13 seconds. The hook timeout covers the wait and the gate's own run.
 */
export const LAUNCHER_WAIT_SECONDS = 15;
export const LAUNCHER_HOOK_TIMEOUT_SECONDS = 30;

/** The binary a gate command runs, with its full path when it is on PATH. */
export const gateBinary = (harness, env = process.env) => gateCommandWithPath(harness, env).slice(0, -` preflight gate --harness ${harness}`.length);

/**
 * A launcher for a harness that blocks every call when its hook command is missing.
 *
 * Such a harness tells the agent only that the command was not found. An update replaces the
 * Total Recall command, so on every release it is absent for some seconds, and then present but
 * unfinished for a few more. The launcher lives outside that package, so it is always there: it
 * keeps the payload, waits for the command, passes a real decision through untouched, and when
 * the gate still gives none it answers in the harness's own shape with what happened and what to
 * do. `denial` builds that answer from a message placeholder.
 * @param {string} cli
 * @param {(message: string) => object} denial
 */
export function gateLauncherScript(cli, denial) {
  const quoted = `'${String(cli).replace(/'/g, `'\\''`)}'`;
  const template = JSON.stringify(denial('%s')).replace(/'/g, `'\\''`);
  const slots = template.split('%s').length - 1;
  return `#!/bin/sh
# Total Recall gate launcher. Written by Total Recall when it installs its gate; edits are
# overwritten. It is not the Total Recall command: it runs the one named in CLI below.
#
# This harness blocks every tool call when a hook command is missing and says only that it was
# not found. An update replaces the Total Recall command, so it is briefly missing on every
# release. This file is outside that package: it waits for the command, and says what to do when
# the gate cannot run.
CLI=${quoted}
payload=$(cat)
wait=\${TR_GATE_WAIT_SECONDS:-${LAUNCHER_WAIT_SECONDS}}
tries=0
why='is missing'
while [ "$tries" -le "$wait" ]; do
  if command -v "$CLI" >/dev/null 2>&1; then
    out=$(printf '%s' "$payload" | "$CLI" "$@")
    code=$?
    if [ "$code" -eq 0 ] || [ "$code" -eq 2 ]; then
      [ -n "$out" ] && printf '%s\\n' "$out"
      exit "$code"
    fi
    why="exited with status $code and gave no decision"
  fi
  tries=$((tries + 1))
  [ "$tries" -le "$wait" ] && sleep 1
done
msg="The Total Recall gate could not run: the total-recall command $why. An update replacing it is the usual cause, and this is not about your preflight. Wait 30 seconds and repeat the same call. If it still fails after two minutes, stop and tell the operator that total-recall needs repair on this machine."
printf '${template}\\n' ${Array(slots).fill('"$msg"').join(' ')}
exit 2
`;
}

/** Write a launcher when it is missing or differs. Returns what was done, or null. */
export function writeGateLauncher(file, script, { dryRun = false } = {}) {
  const current = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : null;
  if (current === script) return null;
  if (!dryRun) {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const pending = `${file}.${process.pid}.tmp`;
    fs.writeFileSync(pending, script, { mode: 0o755 });
    fs.renameSync(pending, file);
  }
  return current === null ? 'gate launcher' : 'gate launcher (updated)';
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
