/**
 * Cline Agent SDK & plugin hook adapter.
 * Official doc: https://docs.cline.bot/sdk/plugins.md
 */
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

import { removeDeadGateFile } from './hook-files.mjs';

const ACK_COMMAND = 'total-recall tr-preflight --ack --task "<task>" --action read,edit,test';

const DEAD_FILE = (home) => path.join(home, 'Documents', 'Cline', 'Hooks', 'preflight-hook.json');

export const clineAdapter = {
  id: 'cline',
  level: 'not wired',
  warnings: {
    delivery: 'unconfirmed',
    via: 'appendContext',
    source: 'https://docs.cline.bot/sdk/plugins.md',
    why: 'The documentation does not say how appendContext reaches the model.',
  },
  source: {
    url: 'https://docs.cline.bot/sdk/plugins.md',
    retrieved: '2026-11-04',
    note: 'Cline SDK plugin beforeTool hooks; hookErrorMode default is ignore (fail-open)'
  },
  limits: [
    'Cline defaults hookErrorMode to ignore (fail-open); requires explicit strict config',
    'Returns { skip: true, reason } or { cancel: true } on denied calls'
  ],

  parse(input = {}) {
    const event = input.event || 'beforeTool';
    const toolName = input.toolName || input.tool || '';
    const toolInput = input.input || input.params || input.toolInput || {};
    const cwd = input.cwd || process.cwd();

    let tool = 'other';
    let command;
    let filePath;

    if (toolName === 'execute_command' || toolName === 'Bash' || toolName === 'shell') {
      tool = 'shell';
      command = toolInput.command || toolInput.cmd || '';
    } else if (toolName === 'write_to_file' || toolName === 'replace_in_file' || toolName === 'Edit' || toolName === 'Write') {
      tool = 'write';
      filePath = toolInput.path || toolInput.file_path || '';
    } else if (toolName === 'read_file' || toolName === 'list_files') {
      tool = 'read';
      filePath = toolInput.path || '';
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
      const payload = decision.warning ? { skip: false, cancel: false, appendContext: decision.warning } : { skip: false, cancel: false };
      return { stdout: `${JSON.stringify(payload)}\n`, exitCode: 0 };
    }

    const reason = decision?.reason || `TR-PREFLIGHT gate: action denied. Run: ${decision?.fix || ACK_COMMAND}`;
    const payload = {
      skip: true,
      cancel: true,
      reason,
      errorMessage: reason,
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

  install({ home = os.homedir(), dryRun = false } = {}) {
    const removed = removeDeadGateFile(DEAD_FILE(home), 'cline', { dryRun });
    return { settings: null, added: [], removed, unsupported: 'Cline runs hooks from an SDK plugin, and no plugin is built yet. Cline is not installed on any machine this was tested on.' };
  },

  verify({ home = os.homedir() } = {}) {
    const installed = false;
    const out = this.emit({ decision: 'deny', reason: 'receipt missing', fix: ACK_COMMAND }, 'beforeTool', '/nonexistent-directory-without-receipt');
    return {
      installed,
      exercised: out.exitCode === 2 && out.stdout.includes('"cancel":true'),
      level: this.level,
      native: out.stdout.trim(),
      note: 'Cline runs hooks from an SDK plugin, and no plugin is built yet. Cline is not installed on any machine this was tested on.'
    };
  }
};

export default clineAdapter;
