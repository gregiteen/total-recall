/**
 * Cursor IDE & agent hook adapter.
 * Official doc: https://cursor.com/docs/hooks
 */
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

import { gateBinary, gateLauncherScript, writeGateLauncher, readJsonFile, readJsonQuietly, writeJsonFile, LAUNCHER_HOOK_TIMEOUT_SECONDS } from './hook-files.mjs';

const ACK_COMMAND = 'total-recall tr-preflight --ack --task "<task>" --action read,edit,test';

const GATE = 'preflight gate --harness cursor';
/** Named like the command, and outside its package, so an update cannot remove what the hook runs. */
export const launcherPath = (home = os.homedir()) => path.join(home, '.cursor', 'hooks', 'total-recall');
const isGate = (row) => String(row?.command || '').includes(GATE);

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
    'User-level hooks apply across workspaces; requires failClosed flag',
    'A failClosed hook whose command is missing blocks every call, so the hook runs a launcher outside the Total Recall package'
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

  install({ home = os.homedir(), dryRun = false, remove = false, off = false, env = process.env } = {}) {
    const hooksPath = path.join(home, '.cursor', 'hooks.json');
    const launcher = launcherPath(home);
    const config = readJsonFile(hooksPath, {});
    const added = [];
    const removed = [];
    if (remove || off) {
      const gates = config.hooks?.preToolUse;
      const kept = Array.isArray(gates) ? gates.filter((row) => !isGate(row)) : [];
      if (Array.isArray(gates) && kept.length !== gates.length) {
        config.hooks.preToolUse = kept;
        removed.push('managed gate');
        if (!dryRun) writeJsonFile(hooksPath, config);
      }
      // Only after the hook line is gone: a line left pointing at a deleted launcher blocks every call.
      if (fs.existsSync(launcher)) {
        if (!dryRun) fs.rmSync(launcher);
        removed.push('gate launcher');
      }
      return { settings: hooksPath, added, removed };
    }
    config.version = config.version || 1;
    // failClosed is a field on each hook, not on the file.
    if ('failClosed' in config) { delete config.failClosed; removed.push('file-level failClosed, which Cursor does not read'); }
    config.hooks = config.hooks || {};
    // The launcher goes in before the hook line that names it.
    const wrote = writeGateLauncher(launcher, gateLauncherScript(gateBinary('cursor', env),
      (message) => ({ permission: 'deny', user_message: message, agent_message: message })), { dryRun });
    if (wrote) added.push(wrote);
    const command = `${launcher} ${GATE}`;
    const list = config.hooks.preToolUse = config.hooks.preToolUse || [];
    const entry = list.find(isGate);
    if (!entry) {
      list.push({ command, matcher: '*', timeout: LAUNCHER_HOOK_TIMEOUT_SECONDS, failClosed: true });
      added.push('managed preToolUse gate (failClosed: true)');
    } else {
      if (entry.failClosed !== true) {
        entry.failClosed = true;
        added.push('failClosed on the managed gate');
      }
      // An entry that runs the command directly is the one an update breaks.
      if (entry.command !== command) {
        entry.command = command;
        entry.timeout = LAUNCHER_HOOK_TIMEOUT_SECONDS;
        added.push('managed gate (now runs through the launcher)');
      }
    }
    if (!dryRun && (added.length || removed.length)) writeJsonFile(hooksPath, config);
    return { settings: hooksPath, added, removed };
  },

  verify({ home = os.homedir() } = {}) {
    // A hook line that names a launcher which is not there blocks every call, so it is not installed.
    const installed = (readJsonQuietly(path.join(home, '.cursor', 'hooks.json')).hooks?.preToolUse || []).some((row) => isGate(row) && row.failClosed === true
      && (!String(row.command).includes(launcherPath(home)) || fs.existsSync(launcherPath(home))));
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
