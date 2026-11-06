/**
 * OpenAI Codex PreToolUse hook adapter.
 * Official doc: https://learn.chatgpt.com/docs/hooks
 */
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

import { hasGate, mergeGate, readJsonFile, readJsonQuietly, writeJsonFile } from './hook-files.mjs';

const ACK_COMMAND = 'total-recall tr-preflight --ack --task "<task>" --action read,edit,test';

export const codexAdapter = {
  id: 'codex',
  level: 'enforced',
  warnings: {
    delivery: 'documented',
    via: 'hookSpecificOutput.additionalContext',
    source: 'https://learn.chatgpt.com/docs/hooks.md',
  },
  source: {
    url: 'https://learn.chatgpt.com/docs/hooks',
    retrieved: '2026-11-04',
    note: 'Codex CLI hooks in ~/.codex/hooks.json or inline in config.toml'
  },
  limits: [
    'Non-managed hooks require trust in config.toml [hooks.state]',
    'Blocks with exit 2 and decision: "block" / permissionDecision: "deny"'
  ],

  parse(input = {}) {
    const event = input.hook_event_name || input.event || 'PreToolUse';
    const toolName = input.tool_name || input.toolName || '';
    const toolInput = input.tool_input || input.toolInput || {};
    const cwd = input.cwd || process.cwd();

    let tool = 'other';
    let command;
    let filePath;

    if (toolName === 'exec_command' || toolName === 'Bash' || toolName === 'shell') {
      tool = 'shell';
      command = toolInput.cmd || toolInput.command || '';
    } else if (toolName === 'apply_patch' || toolName === 'Edit' || toolName === 'Write') {
      tool = 'write';
      filePath = toolInput.path || toolInput.file_path || '';
    } else if (toolName === 'read_file' || toolName === 'view_image' || toolName === 'Read' || /^(Glob|Grep)$/.test(toolName)) {
      tool = 'read';
      filePath = toolInput.path || toolInput.file_path || '';
    } else if (toolName === 'spawn_agent' || toolName === 'Agent' || /^collaboration/.test(toolName)) {
      // Real sessions report these with the dot removed, such as collaborationsend_message.
      tool = 'agent';
    } else if (/^mcp__/.test(toolName)) {
      tool = 'mcp';
    } else if (/^web/.test(toolName)) {
      tool = 'web';
    } else if (toolName === 'update_plan' || /^clock/.test(toolName)) {
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
      if (decision.warning) {
        const payload = { hookSpecificOutput: { hookEventName: 'PreToolUse', additionalContext: decision.warning } };
        return { stdout: `${JSON.stringify(payload)}\n`, exitCode: 0 };
      }
      return { stdout: '', exitCode: 0 };
    }

    const reason = decision?.reason || `TR-PREFLIGHT gate: action denied. Run: ${decision?.fix || ACK_COMMAND}`;
    const payload = {
      decision: 'block',
      hookSpecificOutput: {
        permissionDecision: 'deny',
        permissionDecisionReason: reason
      },
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
    const hooksPath = path.join(home, '.codex', 'hooks.json');
    const config = readJsonFile(hooksPath, { hooks: {} });
    config.hooks = config.hooks || {};
    // A hand-made gate from an earlier release stays until this one is trusted in /hooks,
    // because Codex skips a new hook until then.
    const { groups, added, removed } = mergeGate(config.hooks.PreToolUse, 'codex', { remove: remove || off });
    config.hooks.PreToolUse = groups;
    if (!dryRun && (added.length || removed.length)) writeJsonFile(hooksPath, config);
    return { settings: hooksPath, added, removed, note: this.limits[0] };
  },

  verify({ home = os.homedir() } = {}) {
    const installed = hasGate(readJsonQuietly(path.join(home, '.codex', 'hooks.json')).hooks?.PreToolUse, 'codex');
    const out = this.emit({ decision: 'deny', reason: 'receipt missing', fix: ACK_COMMAND }, 'PreToolUse', '/nonexistent-directory-without-receipt');
    return {
      installed,
      exercised: out.exitCode === 2 && out.stdout.includes('"permissionDecision":"deny"'),
      level: this.level,
      native: out.stdout.trim(),
      note: 'Codex skips a new or changed hook until it is trusted in /hooks.'
    };
  }
};

export default codexAdapter;
