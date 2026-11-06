/**
 * Pi Coding Agent extension hook adapter.
 * Official doc: https://raw.githubusercontent.com/badlogic/pi-mono/main/packages/coding-agent/docs/extensions.md
 */
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

import { removeDeadGateFile } from './hook-files.mjs';

const ACK_COMMAND = 'total-recall tr-preflight --ack --task "<task>" --action read,edit,test';

/**
 * Pi loads extensions as modules, so the gate is a small one that asks Total Recall. Text
 * after a tool_call cannot carry a warning, so it goes through pi.sendMessage. Anything that
 * goes wrong blocks, as the gate does in every harness.
 */
export const PI_EXTENSION = `// Total Recall preflight gate. Written by \`total-recall preflight install\`.
import { spawnSync } from 'node:child_process';

export default function totalRecallGate(pi) {
  pi.on('tool_call', async (event, ctx) => {
    const input = JSON.stringify({ event: 'tool_call', toolName: event.toolName, input: event.input, cwd: ctx.cwd, sessionId: ctx.sessionManager?.getSessionId?.() });
    const result = spawnSync('total-recall', ['preflight', 'gate', '--harness', 'pi'], { input, encoding: 'utf8', timeout: 10000 });
    let answer = {};
    try { answer = JSON.parse(result.stdout || '{}'); } catch { /* handled below */ }
    if (result.status === 0 && !answer.block) {
      if (answer.warning) pi.sendMessage({ customType: 'total-recall-note', content: answer.warning, display: true }, { deliverAs: 'steer' });
      return undefined;
    }
    return { block: true, reason: answer.reason || result.stderr || 'The Total Recall gate could not run.' };
  });
}
`;

export const piAdapter = {
  id: 'pi',
  level: 'enforced (unverified live)',
  warnings: {
    delivery: 'documented',
    via: 'pi.sendMessage, from the installed extension',
    source: 'https://raw.githubusercontent.com/badlogic/pi-mono/main/packages/coding-agent/docs/extensions.md',
  },
  source: {
    url: 'https://raw.githubusercontent.com/badlogic/pi-mono/main/packages/coding-agent/docs/extensions.md',
    retrieved: '2026-11-04',
    note: 'Pi Coding Agent tool_call extensions in ~/.pi/agent/extensions/'
  },
  limits: [
    'Pi loaded extensions must fail closed explicitly',
    'Returns { block: true, reason } on denied calls'
  ],

  parse(input = {}) {
    const event = input.event || 'tool_call';
    const toolName = input.toolName || input.tool || '';
    const toolInput = input.input || input.params || {};
    const cwd = input.cwd || process.cwd();

    let tool = 'other';
    let command;
    let filePath;

    if (toolName === 'bash' || toolName === 'execute' || toolName === 'Bash' || toolName === 'shell') {
      tool = 'shell';
      command = toolInput.command || toolInput.cmd || '';
    } else if (toolName === 'edit' || toolName === 'write' || toolName === 'patch') {
      tool = 'write';
      filePath = toolInput.path || toolInput.file || '';
    } else if (/^(read|grep|find|ls)$/.test(toolName)) {
      tool = 'read';
      filePath = toolInput.path || toolInput.file || '';
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
      const payload = decision.warning ? { block: false, warning: decision.warning } : { block: false };
      return { stdout: `${JSON.stringify(payload)}\n`, exitCode: 0 };
    }

    const reason = decision?.reason || `TR-PREFLIGHT gate: action denied. Run: ${decision?.fix || ACK_COMMAND}`;
    const payload = {
      block: true,
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
    const piDir = path.join(home, '.pi', 'agent', 'extensions');
    const extensionPath = path.join(piDir, 'total-recall-preflight.ts');
    const removed = removeDeadGateFile(path.join(piDir, 'total-recall-preflight.json'), 'pi', { dryRun });
    const added = [];
    if (remove || off) {
      if (fs.existsSync(extensionPath)) {
        if (!dryRun) fs.rmSync(extensionPath);
        removed.push('managed tool_call extension');
      }
      return { settings: extensionPath, added, removed };
    }
    const current = fs.existsSync(extensionPath) ? fs.readFileSync(extensionPath, 'utf8') : null;
    if (current !== PI_EXTENSION) {
      if (!dryRun) {
        fs.mkdirSync(piDir, { recursive: true });
        fs.writeFileSync(extensionPath, PI_EXTENSION);
      }
      added.push('managed tool_call extension');
    }
    return { settings: extensionPath, added, removed };
  },

  verify({ home = os.homedir() } = {}) {
    const installed = fs.existsSync(path.join(home, '.pi', 'agent', 'extensions', 'total-recall-preflight.ts'));
    const out = this.emit({ decision: 'deny', reason: 'receipt missing', fix: ACK_COMMAND }, 'tool_call', '/nonexistent-directory-without-receipt');
    return {
      installed,
      exercised: out.exitCode === 2 && out.stdout.includes('"block":true'),
      level: this.level,
      native: out.stdout.trim()
    };
  }
};

export default piAdapter;
