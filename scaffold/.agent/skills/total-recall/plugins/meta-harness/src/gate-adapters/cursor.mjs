/**
 * Cursor IDE & agent hook adapter.
 * Official doc: https://cursor.com/docs/hooks
 */
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

import { gateCommand, readJsonFile, readJsonQuietly, writeJsonFile } from './hook-files.mjs';

const ACK_COMMAND = 'total-recall tr-preflight --ack --task "<task>" --action read,edit,test';

export const cursorAdapter = {
  id: 'cursor',
  level: 'enforced (unverified live)',
  warnings: {
    delivery: 'unconfirmed',
    via: 'agent_message',
    source: 'https://cursor.com/docs/agent/hooks',
    why: 'The documentation ties agent_message to denial for preToolUse, so delivery on allow is unconfirmed.',
  },
  source: {
    url: 'https://cursor.com/docs/hooks',
    retrieved: '2026-11-04',
    note: 'Cursor hooks in ~/.cursor/hooks.json and .cursor/hooks.json'
  },
  limits: [
    'Cursor defaults to fail-open unless failClosed: true is set',
    'User-level hooks apply across workspaces; requires failClosed flag'
  ],

  parse(input = {}) {
    const event = input.hook_event_name || input.event || input.hookEventName || 'preToolUse';
    const toolName = input.tool_name || input.toolName || input.tool || '';
    const toolInput = input.tool_input || input.toolInput || input.input || {};
    const cwd = input.cwd || input.workspace_roots?.[0] || input.workspaceRoot || process.cwd();

    let tool = 'other';
    let command;
    let filePath;

    if (event === 'beforeShellExecution' || toolName === 'Shell' || toolName === 'execute' || toolName === 'terminal' || toolName === 'Bash') {
      tool = 'shell';
      command = input.command || toolInput.command || toolInput.cmd || '';
    } else if (event === 'beforeReadFile' || toolName === 'readFile' || toolName === 'Read' || toolName === 'Grep') {
      tool = 'read';
      filePath = input.file || input.path || toolInput.file_path || toolInput.file || toolInput.path || '';
    } else if (toolName === 'edit' || toolName === 'Write' || toolName === 'Edit' || toolName === 'Delete') {
      tool = 'write';
      filePath = input.file || input.path || toolInput.file_path || toolInput.file || toolInput.path || '';
    } else if (toolName === 'Task') {
      tool = 'agent';
    } else if (toolName.startsWith('MCP:')) {
      tool = 'mcp';
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
      const payload = decision.warning ? { permission: 'allow', agent_message: decision.warning } : { permission: 'allow' };
      return { stdout: `${JSON.stringify(payload)}\n`, exitCode: 0 };
    }

    const reason = decision?.reason || `TR-PREFLIGHT gate: action denied. Run: ${decision?.fix || ACK_COMMAND}`;
    const payload = {
      permission: 'deny',
      user_message: reason,
      agent_message: reason
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
    const hooksPath = path.join(home, '.cursor', 'hooks.json');
    const config = readJsonFile(hooksPath, {});
    const added = [];
    const removed = [];
    if (remove || off) {
      const gates = config.hooks?.preToolUse;
      const kept = Array.isArray(gates) ? gates.filter((row) => !String(row?.command || '').includes('preflight gate --harness cursor')) : [];
      if (Array.isArray(gates) && kept.length !== gates.length) {
        config.hooks.preToolUse = kept;
        removed.push('managed gate');
        if (!dryRun) writeJsonFile(hooksPath, config);
      }
      return { settings: hooksPath, added, removed };
    }
    config.version = config.version || 1;
    // failClosed is a field on each hook, not on the file.
    if ('failClosed' in config) { delete config.failClosed; removed.push('file-level failClosed, which Cursor does not read'); }
    config.hooks = config.hooks || {};
    const command = gateCommand('cursor');
    const list = config.hooks.preToolUse = config.hooks.preToolUse || [];
    const entry = list.find((row) => String(row?.command || '').includes('preflight gate --harness cursor'));
    if (!entry) {
      list.push({ command, matcher: '*', timeout: 10, failClosed: true });
      added.push('managed preToolUse gate (failClosed: true)');
    } else if (entry.failClosed !== true) {
      entry.failClosed = true;
      added.push('failClosed on the managed gate');
    }
    if (!dryRun && (added.length || removed.length)) writeJsonFile(hooksPath, config);
    return { settings: hooksPath, added, removed };
  },

  verify({ home = os.homedir() } = {}) {
    const installed = (readJsonQuietly(path.join(home, '.cursor', 'hooks.json')).hooks?.preToolUse || []).some((row) => String(row?.command || '').includes('preflight gate --harness cursor') && row.failClosed === true);
    const out = this.emit({ decision: 'deny', reason: 'receipt missing', fix: ACK_COMMAND }, 'preToolUse', '/nonexistent-directory-without-receipt');
    return {
      installed,
      exercised: out.exitCode === 2 && out.stdout.includes('"permission":"deny"'),
      level: this.level,
      native: out.stdout.trim()
    };
  }
};

export default cursorAdapter;
