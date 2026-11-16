/**
 * Hermes Agent Runtime hook adapter.
 * Official doc: https://hermes-agent.nousresearch.com/docs/user-guide/features/hooks
 */
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

import { gateBinary, gateLauncherScript, writeGateLauncher, removeDeadGateFile, LAUNCHER_HOOK_TIMEOUT_SECONDS } from './hook-files.mjs';

const ACK_COMMAND = 'total-recall tr-preflight --ack --task "<task>" --action read,edit,test';

const GATE = 'preflight gate --harness hermes';
const HOOK_TIMEOUT_SECONDS = LAUNCHER_HOOK_TIMEOUT_SECONDS;
/**
 * The gate arguments as they may appear in config.yaml. Another tool that rewrites the file can
 * wrap a long string at 80 columns: core's lesson hooks did, and split this text over two lines,
 * so the adapter no longer saw its own entry and added another on every install.
 */
const spaced = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/ +/g, '[\\s\\\\]+');
const GATE_RE = new RegExp(spaced(GATE));
const ENTRY = (command) => `    - matcher: ".*"
      command: "${command}"
      timeout: ${HOOK_TIMEOUT_SECONDS}
      fail_closed: true
`;
const ENTRY_LINES = new RegExp(`    - matcher: ".*"\\n      command: "[^"\\n]*${GATE}"\\n      timeout: \\d+\\n      fail_closed: true\\n`);

/**
 * The launcher sits outside the Total Recall package and is named like the command, so the hook
 * line still reads `total-recall preflight gate --harness hermes` to everything that looks for it.
 */
export const launcherPath = (home = os.homedir()) => path.join(home, '.hermes', 'agent-hooks', 'total-recall');

/** What the hook runs: the shared launcher, answering in Hermes's own block shape. */
export const launcherScript = (cli) => gateLauncherScript(cli, (message) => ({ action: 'block', message }));

/** The hook line: the launcher, then the gate arguments it passes on. */
const hookCommand = (home) => `${launcherPath(home)} ${GATE}`;

/** Hermes reads shell hooks from config.yaml, so the gate goes there, beside any others. */
function withGate(text, command) {
  const entry = ENTRY(command);
  if (/^  pre_tool_call:[ \t]*\n/m.test(text)) return text.replace(/^  pre_tool_call:[ \t]*\n/m, (line) => `${line}${entry}`);
  if (/^hooks:[ \t]*\n/m.test(text)) return text.replace(/^hooks:[ \t]*\n/m, (line) => `${line}  pre_tool_call:\n${entry}`);
  if (/^hooks:/m.test(text)) throw new Error('config.yaml sets hooks: on one line; expand it before installing the gate');
  return `${text.replace(/\n*$/, text ? '\n' : '')}\nhooks:\n  pre_tool_call:\n${entry}`;
}

/**
 * Remove every hook list item whose command runs the gate. Other tools rewrite config.yaml (the
 * lesson hooks re-serialize it), so the item is found by indentation, not by its exact text: the
 * item runs from its `- ` line to the next line indented no deeper than that dash.
 */
export function withoutGate(text) {
  if (!GATE_RE.test(text)) return text;
  const exact = text.replace(ENTRY_LINES, '');
  if (!GATE_RE.test(exact)) return exact;
  let lines = text.split('\n');
  const indent = (line) => line.match(/^ */)[0].length;
  for (let guard = 0; guard < 50; guard++) {
    // The line the gate text starts on; a wrapped entry continues on the next one.
    const found = GATE_RE.exec(lines.join('\n'));
    if (!found) break;
    const hit = lines.join('\n').slice(0, found.index).split('\n').length - 1;
    let start = hit;
    while (start >= 0 && !/^ *- /.test(lines[start])) start--;
    if (start < 0 || indent(lines[start]) > indent(lines[hit])) break;
    const dash = indent(lines[start]);
    let end = start + 1;
    while (end < lines.length && (lines[end].trim() === '' || indent(lines[end]) > dash)) end++;
    while (end > start + 1 && lines[end - 1].trim() === '') end--;
    lines = [...lines.slice(0, start), ...lines.slice(end)];
  }
  return lines.join('\n');
}

export const hermesAdapter = {
  id: 'hermes',
  level: 'enforced',
  warnings: {
    delivery: 'none',
    via: null,
    source: 'https://hermes-agent.nousresearch.com/docs/user-guide/features/hooks',
    why: 'pre_tool_call has no text field that lets the tool run. pre_llm_call adds context for the next turn, and is a different hook.',
  },
  source: {
    url: 'https://hermes-agent.nousresearch.com/docs/user-guide/features/hooks',
    retrieved: '2026-11-04',
    note: 'Hermes shell & plugin hooks in ~/.hermes/config.yaml'
  },
  limits: [
    'Hermes plugin callbacks fail closed on timeout',
    'Pre-tool hook returns {"action":"block","message":...} with exit 2',
    'Hermes reports a missing hook command only as "command not found", so the hook runs a launcher outside the Total Recall package'
  ],

  parse(input = {}) {
    const event = input.event || input.hook_event_name || 'pre_tool_call';
    const toolName = input.tool_name || input.tool || '';
    const toolInput = input.tool_input || input.params || input.args || {};
    const cwd = input.cwd || process.cwd();

    let tool = 'other';
    let command;
    let filePath;

    if (toolName === 'terminal' || toolName === 'Bash' || toolName === 'shell' || toolName === 'exec') {
      tool = 'shell';
      command = toolInput.command || toolInput.cmd || '';
    } else if (toolName === 'write_file' || toolName === 'patch' || toolName === 'Edit' || toolName === 'Write') {
      tool = 'write';
      filePath = toolInput.path || toolInput.file_path || '';
    } else if (toolName === 'read_file' || toolName === 'search_files' || toolName === 'session_search' || toolName === 'Read') {
      tool = 'read';
      filePath = toolInput.path || toolInput.file_path || '';
    } else if (toolName === 'delegate_task') {
      tool = 'agent';
    } else if (/^(web_search|web_extract|x_search)$/.test(toolName)) {
      tool = 'web';
    } else if (/^(clarify|todo)$/.test(toolName)) {
      tool = 'meta';
    }

    return {
      event,
      tool,
      command,
      path: filePath,
      cwd,
      raw: input
    };
  },

  emit(decision, event, cwd = process.cwd()) {
    if (decision?.decision === 'allow') {
      const payload = { action: 'allow' };
      return { stdout: `${JSON.stringify(payload)}\n`, exitCode: 0 };
    }

    const reason = decision?.reason || `TR-PREFLIGHT gate: action denied. Run: ${decision?.fix || ACK_COMMAND}`;
    const payload = {
      action: 'block',
      message: reason,
      fix: decision?.fix || ACK_COMMAND
    };
    return { stdout: `${JSON.stringify(payload)}\n`, exitCode: 2 };
  },

  async run({ stdin, decideWith }) {
    const parsed = this.parse(stdin);
    const decision = decideWith({
      tool: parsed.tool,
      command: parsed.command,
      path: parsed.path,
      cwd: parsed.cwd
    });
    return this.emit(decision, parsed.event, parsed.cwd);
  },

  install({ home = os.homedir(), dryRun = false, remove = false, off = false, env = process.env } = {}) {
    const hermesDir = path.join(home, '.hermes');
    const configPath = path.join(hermesDir, 'config.yaml');
    const launcher = launcherPath(home);
    const removed = removeDeadGateFile(path.join(hermesDir, 'hooks.json'), 'hermes', { dryRun });
    const added = [];
    const text = fs.existsSync(configPath) ? fs.readFileSync(configPath, 'utf8') : '';
    const present = GATE_RE.test(text);
    if (remove || off) {
      if (present) {
        const next = withoutGate(text);
        if (GATE_RE.test(next)) throw new Error(`could not remove the gate from ${configPath}; remove the pre_tool_call entry that runs "${GATE}" by hand`);
        if (!dryRun) fs.writeFileSync(configPath, next);
        removed.push('managed pre_tool_call gate');
      }
      // Only after the hook line is gone: a line left pointing at a deleted launcher blocks every call.
      if (fs.existsSync(launcher)) {
        if (!dryRun) fs.rmSync(launcher);
        removed.push('gate launcher');
      }
      return { settings: configPath, added, removed };
    }
    // The launcher goes in before the hook line that names it, and is rewritten when it differs.
    const wrote = writeGateLauncher(launcher, launcherScript(gateBinary('hermes', env)), { dryRun });
    if (wrote) added.push(wrote);
    const command = hookCommand(home);
    const wired = new RegExp(spaced(command)).test(text);
    if (!wired) {
      // An entry that runs the command directly is replaced: it is the one an update breaks.
      const base = present ? withoutGate(text) : text;
      if (GATE_RE.test(base)) throw new Error(`could not replace the gate in ${configPath}; remove the pre_tool_call entry that runs "${GATE}" by hand`);
      if (!dryRun) {
        fs.mkdirSync(hermesDir, { recursive: true });
        if (text) fs.copyFileSync(configPath, `${configPath}.bak-total-recall`);
        fs.writeFileSync(configPath, withGate(base, command));
      }
      added.push(present ? 'managed pre_tool_call gate (now runs through the launcher)' : 'managed pre_tool_call gate');
    }
    return { settings: configPath, added, removed, note: 'Hermes asks to approve a new hook on first use, unless hooks_auto_accept is on. A running gateway keeps the hooks it started with until it restarts.' };
  },

  verify({ home = os.homedir() } = {}) {
    const configPath = path.join(home, '.hermes', 'config.yaml');
    const text = fs.existsSync(configPath) ? fs.readFileSync(configPath, 'utf8') : '';
    // A hook line that names a launcher which is not there blocks every call, so it is not installed.
    const installed = GATE_RE.test(text) && (!text.includes(launcherPath(home)) || fs.existsSync(launcherPath(home)));
    const out = this.emit({ decision: 'deny', reason: 'receipt missing', fix: ACK_COMMAND }, 'pre_tool_call', '/nonexistent-directory-without-receipt');
    return {
      installed,
      exercised: out.exitCode === 2 && out.stdout.includes('"action":"block"'),
      level: this.level,
      native: out.stdout.trim()
    };
  }
};

export default hermesAdapter;
