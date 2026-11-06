/**
 * Google Antigravity (agy) PreToolUse & lifecycle hook adapter.
 * Official doc: https://antigravity.google/docs/hooks?tab=cli
 */
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

import { hasGate, mergeGate, readJsonFile, readJsonQuietly, writeJsonFile } from './hook-files.mjs';

const ACK_COMMAND = 'total-recall tr-preflight --ack --task "<task>" --action read,edit,test';

const HOOK_NAME = 'total-recall-preflight';

export const agyAdapter = {
  id: 'agy',
  aliases: ['antigravity'],
  level: 'enforced',
  warnings: {
    delivery: 'documented',
    via: 'reason',
    source: 'agy-customizations/docs/hooks.md, bundled with the CLI',
  },
  source: {
    url: 'https://antigravity.google/docs/hooks?tab=cli',
    retrieved: '2026-11-04',
    note: 'Antigravity CLI hooks in ~/.gemini/config/hooks.json or .agents/hooks.json'
  },
  readablePaths: [
    /\/\.gemini\/antigravity\/brain\/[^/]+\/\.system_generated\/tasks\/[^/]+\.log$/,
    /\/\.gemini\/antigravity\/brain\/[^/]+\/\.system_generated\/steps\/[^/]+\/output\.txt$/
  ],
  limits: [
    'Hooks receive camelCase toolCall fields: toolCall.name and toolCall.args',
    'PreToolUse blocks execution with decision: "deny" and exit code 2'
  ],

  parse(input = {}) {
    const event = input.event || input.hookEventName || 'PreToolUse';
    const toolCall = input.toolCall || {};
    const name = toolCall.name || input.toolName || input.tool_name || '';
    const args = toolCall.args || input.toolArgs || input.tool_input || {};
    const cwd = input.cwd || input.workspacePaths?.[0] || process.cwd();

    let tool = 'other';
    let command;
    let filePath;

    if (name === 'run_command' || name === 'Bash') {
      tool = 'shell';
      command = args.CommandLine || args.command || '';
    } else if (name === 'read_file' || name === 'view_file' || /^(Read|Glob|Grep)$/.test(name)) {
      tool = 'read';
      filePath = args.Path || args.file_path || args.path || '';
    } else if (name === 'write_file' || name === 'edit_file' || /^(Edit|Write)$/.test(name)) {
      tool = 'write';
      filePath = args.Path || args.file_path || args.path || '';
    } else if (name === 'search_web' || /^(WebFetch|WebSearch)$/.test(name)) {
      tool = 'web';
    } else if (/^(ask_question|show_message|manage_task)$/.test(name)) {
      tool = 'meta';
    } else if (/^(invoke_subagent|send_message|manage_subagents)$/.test(name)) {
      tool = 'agent';
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
      // `allow` means automatic approval here, and the gate must not approve commands or edits.
      // `ask` leaves the user's normal prompt and "Always Allow" choices in charge. A run Meta
      // Harness started has already chosen its permission mode, and reads need no approval.
      const answer = process.env.TR_META_HARNESS_RUN || decision.readOnly ? 'allow' : 'ask';
      const payload = decision.warning ? { decision: answer, reason: decision.warning } : { decision: answer };
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
    return this.emit({ ...decision, readOnly: ['read', 'search', 'web', 'meta', 'ui', 'agent'].includes(parsed.tool) }, parsed.event, parsed.cwd);
  },

  install({ home = os.homedir(), dryRun = false, remove = false, off = false } = {}) {
    const hooksPath = path.join(home, '.gemini', 'config', 'hooks.json');
    const config = readJsonFile(hooksPath, {});
    // Top-level keys are hook names. Earlier installs wrote a hook called "hooks" with entries
    // Antigravity skips.
    const stale = mergeGate(config.hooks?.PreToolUse, 'agy', { remove: true });
    const removed = stale.removed;
    if (config.hooks) {
      config.hooks.PreToolUse = stale.groups;
      if (!config.hooks.PreToolUse.length) delete config.hooks.PreToolUse;
      if (!Object.keys(config.hooks).length) delete config.hooks;
    }
    const current = config[HOOK_NAME]?.PreToolUse;
    const { groups, added, removed: gone } = mergeGate(current, 'agy', { remove: remove || off });
    removed.push(...gone);
    if (groups.length) config[HOOK_NAME] = { ...(config[HOOK_NAME] || {}), PreToolUse: groups };
    else delete config[HOOK_NAME];
    if (!dryRun && (added.length || removed.length)) writeJsonFile(hooksPath, config);
    return { settings: hooksPath, added, removed };
  },

  verify({ home = os.homedir() } = {}) {
    const installed = hasGate(readJsonQuietly(path.join(home, '.gemini', 'config', 'hooks.json'))[HOOK_NAME]?.PreToolUse, 'agy');
    const out = this.emit({ decision: 'deny', reason: 'receipt missing', fix: ACK_COMMAND }, 'PreToolUse', '/nonexistent-directory-without-receipt');
    return {
      installed,
      exercised: out.exitCode === 2 && out.stdout.includes('"decision":"deny"'),
      level: this.level,
      native: out.stdout.trim()
    };
  }
};

export default agyAdapter;
