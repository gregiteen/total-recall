/**
 * xAI Grok Build CLI hook adapter.
 * Official doc: https://docs.x.ai/build/features/hooks
 */
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

import { hasGate, mergeGate, readJsonFile, readJsonQuietly, writeJsonFile } from './hook-files.mjs';

const ACK_COMMAND = 'total-recall tr-preflight --ack --task "<task>" --action read,edit,test';

export const grokAdapter = {
  id: 'grok',
  level: 'enforced (unverified live)',
  warnings: {
    delivery: 'none',
    via: null,
    source: 'https://docs.x.ai/build/features/hooks',
    why: 'Exit 0 allows, and only a deny carries text.',
  },
  source: {
    url: 'https://docs.x.ai/build/features/hooks',
    retrieved: '2026-11-04',
    note: 'Grok Build hooks in ~/.grok/hooks/ or .grok/hooks/'
  },
  limits: [
    'Timeouts, crashes and malformed outputs fail open in Grok Build',
    'Project-level hooks require trust in ~/.grok/trusted_folders.toml'
  ],

  parse(input = {}) {
    const event = input.hookEventName || input.event || 'PreToolUse';
    const toolName = input.toolName || input.tool_name || input.tool || '';
    const toolInput = input.toolInput || input.tool_input || input.input || {};
    const cwd = input.cwd || input.workspaceRoot || process.cwd();

    let tool = 'other';
    let command;
    let filePath;

    if (toolName === 'Bash' || toolName === 'exec' || toolName === 'shell') {
      tool = 'shell';
      command = toolInput.command || toolInput.cmd || '';
    } else if (/^(Edit|Write)$/.test(toolName)) {
      tool = 'write';
      filePath = toolInput.file_path || toolInput.path || '';
    } else if (/^(Read|Glob|Grep)$/.test(toolName)) {
      tool = 'read';
      filePath = toolInput.file_path || toolInput.path || '';
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
      const payload = { decision: 'allow' };
      return { stdout: `${JSON.stringify(payload)}\n`, exitCode: 0 };
    }

    const reason = decision?.reason || `TR-PREFLIGHT gate: action denied. Run: ${decision?.fix || ACK_COMMAND}`;
    const payload = {
      decision: 'deny',
      reason,
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
    const hooksPath = path.join(home, '.grok', 'hooks', 'total-recall-preflight.json');
    const config = readJsonFile(hooksPath, { hooks: {} });
    config.hooks = config.hooks || {};
    // Grok's matcher is a regular expression and optional, so leave it off to match every tool.
    const { groups, added, removed } = mergeGate(config.hooks.PreToolUse, 'grok', { remove: remove || off, matcher: null });
    config.hooks.PreToolUse = groups;
    if (!dryRun && (added.length || removed.length)) writeJsonFile(hooksPath, config);
    return { settings: hooksPath, added, removed };
  },

  verify({ home = os.homedir() } = {}) {
    const installed = hasGate(readJsonQuietly(path.join(home, '.grok', 'hooks', 'total-recall-preflight.json')).hooks?.PreToolUse, 'grok');
    const out = this.emit({ decision: 'deny', reason: 'receipt missing', fix: ACK_COMMAND }, 'PreToolUse', '/nonexistent-directory-without-receipt');
    return {
      installed,
      exercised: out.exitCode === 2 && out.stdout.includes('"decision":"deny"'),
      level: this.level,
      native: out.stdout.trim()
    };
  }
};

export default grokAdapter;
