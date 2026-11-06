/**
 * Devin CLI & Windsurf Cascade hook adapter.
 * Official doc: https://docs.devin.ai/cli/extensibility/hooks/lifecycle-hooks
 */
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

import { hasGate, mergeGate, readJsonFile, readJsonQuietly, removeDeadGateFile, writeJsonFile } from './hook-files.mjs';

const ACK_COMMAND = 'total-recall tr-preflight --ack --task "<task>" --action read,edit,test';

/** Devin's documented tool names. Anything else counts as a working tool. */
const TOOL_CLASSES = {
  exec: 'shell', Bash: 'shell', shell: 'shell',
  read: 'read', notebook_read: 'read', grep: 'read', glob: 'read', get_output: 'read',
  write: 'write', edit: 'write', apply_patch: 'write', notebook_edit: 'write',
  webfetch: 'web',
  run_subagent: 'agent', read_subagent: 'agent',
  todo_write: 'meta', exit_plan_mode: 'meta', skill: 'meta', request_scope: 'meta',
  mcp_list_servers: 'meta', mcp_list_tools: 'meta', mcp_call_tool: 'mcp', mcp_read_resource: 'mcp',
};

export const devinAdapter = {
  id: 'devin',
  aliases: ['windsurf'],
  level: 'enforced (unverified live)',
  warnings: {
    delivery: 'none',
    via: null,
    source: 'https://docs.devin.ai/cli/extensibility/hooks/lifecycle-hooks',
    why: 'additionalContext is documented only for UserPromptSubmit and SessionStart.',
  },
  source: {
    url: 'https://docs.devin.ai/cli/extensibility/hooks/lifecycle-hooks',
    retrieved: '2026-11-04',
    note: 'Devin/Windsurf hooks in ~/.config/devin/config.json or .devin/hooks.v1.json'
  },
  limits: [
    'Hooks do not run when Devin operates in Restricted Mode',
    'Exit 2 blocks tool execution in PreToolUse'
  ],

  parse(input = {}) {
    const event = input.hook_event_name || input.event || input.hookEventName || 'PreToolUse';
    const toolName = input.tool || input.toolName || input.tool_name || '';
    const toolInput = input.tool_input || input.toolInput || input.input || {};
    const cwd = input.cwd || process.cwd();

    const tool = /^mcp__/.test(toolName) ? 'mcp' : (TOOL_CLASSES[toolName] || 'other');
    let command;
    let filePath;

    if (tool === 'shell') command = toolInput.cmd || toolInput.command || '';
    else if (tool === 'write' || tool === 'read') filePath = toolInput.file_path || toolInput.path || toolInput.file || '';

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
      return { stdout: '', exitCode: 0 };
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
    const devinDir = path.join(home, '.config', 'devin');
    const configPath = path.join(devinDir, 'config.json');
    const config = readJsonFile(configPath, {});
    config.hooks = config.hooks || {};
    const { groups, added, removed } = mergeGate(config.hooks.PreToolUse, 'devin', { remove: remove || off });
    config.hooks.PreToolUse = groups;
    if (!dryRun && (added.length || removed.length)) writeJsonFile(configPath, config);
    removed.push(...removeDeadGateFile(path.join(devinDir, 'hooks.json'), 'devin', { dryRun }));
    return { settings: configPath, added, removed };
  },

  verify({ home = os.homedir() } = {}) {
    const installed = hasGate(readJsonQuietly(path.join(home, '.config', 'devin', 'config.json')).hooks?.PreToolUse, 'devin');
    const out = this.emit({ decision: 'deny', reason: 'receipt missing', fix: ACK_COMMAND }, 'PreToolUse', '/nonexistent-directory-without-receipt');
    return {
      installed,
      exercised: out.exitCode === 2 && out.stdout.includes('"decision":"deny"'),
      level: this.level,
      native: out.stdout.trim()
    };
  }
};

export default devinAdapter;
