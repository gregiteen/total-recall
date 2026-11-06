/**
 * Hermes Agent Runtime hook adapter.
 * Official doc: https://hermes-agent.nousresearch.com/docs/user-guide/features/hooks
 */
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

import { gateCommandWithPath, removeDeadGateFile } from './hook-files.mjs';

const ACK_COMMAND = 'total-recall tr-preflight --ack --task "<task>" --action read,edit,test';

const GATE = 'preflight gate --harness hermes';
const ENTRY = (command) => `    - matcher: ".*"
      command: "${command}"
      timeout: 10
      fail_closed: true
`;
const ENTRY_LINES = new RegExp(`    - matcher: ".*"\\n      command: "[^"\\n]*${GATE}"\\n      timeout: 10\\n      fail_closed: true\\n`);

/** Hermes reads shell hooks from config.yaml, so the gate goes there, beside any others. */
function withGate(text) {
  const entry = ENTRY(gateCommandWithPath('hermes'));
  if (/^  pre_tool_call:[ \t]*\n/m.test(text)) return text.replace(/^  pre_tool_call:[ \t]*\n/m, (line) => `${line}${entry}`);
  if (/^hooks:[ \t]*\n/m.test(text)) return text.replace(/^hooks:[ \t]*\n/m, (line) => `${line}  pre_tool_call:\n${entry}`);
  if (/^hooks:/m.test(text)) throw new Error('config.yaml sets hooks: on one line; expand it before installing the gate');
  return `${text.replace(/\n*$/, text ? '\n' : '')}\nhooks:\n  pre_tool_call:\n${entry}`;
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
    'Pre-tool hook returns {"action":"block","message":...} with exit 2'
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

  install({ home = os.homedir(), dryRun = false, remove = false, off = false } = {}) {
    const hermesDir = path.join(home, '.hermes');
    const configPath = path.join(hermesDir, 'config.yaml');
    const removed = removeDeadGateFile(path.join(hermesDir, 'hooks.json'), 'hermes', { dryRun });
    const added = [];
    const text = fs.existsSync(configPath) ? fs.readFileSync(configPath, 'utf8') : '';
    const present = text.includes(GATE);
    if (remove || off) {
      if (present) {
        if (!dryRun) fs.writeFileSync(configPath, text.replace(ENTRY_LINES, ''));
        removed.push('managed pre_tool_call gate');
      }
      return { settings: configPath, added, removed };
    }
    if (!present) {
      if (!dryRun) {
        fs.mkdirSync(hermesDir, { recursive: true });
        if (text) fs.copyFileSync(configPath, `${configPath}.bak-total-recall`);
        fs.writeFileSync(configPath, withGate(text));
      }
      added.push('managed pre_tool_call gate');
    }
    return { settings: configPath, added, removed, note: 'Hermes asks to approve a new hook on first use, unless hooks_auto_accept is on.' };
  },

  verify({ home = os.homedir() } = {}) {
    const installed = fs.existsSync(path.join(home, '.hermes', 'config.yaml')) && fs.readFileSync(path.join(home, '.hermes', 'config.yaml'), 'utf8').includes(GATE);
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
