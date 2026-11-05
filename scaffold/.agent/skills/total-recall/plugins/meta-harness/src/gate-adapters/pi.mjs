/**
 * Pi Coding Agent extension hook adapter.
 * Official doc: https://raw.githubusercontent.com/badlogic/pi-mono/main/packages/coding-agent/docs/extensions.md
 */
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const ACK_COMMAND = 'total-recall tr-preflight --ack --task "<task>" --action read,edit,test';

export const piAdapter = {
  id: 'pi',
  level: 'enforced (unverified live)',
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

    if (toolName === 'execute' || toolName === 'Bash' || toolName === 'shell') {
      tool = 'shell';
      command = toolInput.command || toolInput.cmd || '';
    } else if (toolName === 'edit' || toolName === 'write' || toolName === 'patch') {
      tool = 'write';
      filePath = toolInput.path || toolInput.file || '';
    } else if (toolName === 'read') {
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
      const payload = { block: false };
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

  install({ home = os.homedir(), dryRun = false } = {}) {
    const piDir = path.join(home, '.pi', 'agent', 'extensions');
    const hookPath = path.join(piDir, 'total-recall-preflight.json');
    const added = [];

    const hookDef = {
      name: 'total-recall-preflight',
      command: 'total-recall preflight gate --harness pi',
      timeout: 5
    };

    if (!dryRun) {
      fs.mkdirSync(piDir, { recursive: true });
      fs.writeFileSync(hookPath, `${JSON.stringify(hookDef, null, 2)}\n`);
      added.push('managed Pi extension gate');
    }

    return { settings: hookPath, added };
  },

  verify({ home = os.homedir() } = {}) {
    const hookPath = path.join(home, '.pi', 'agent', 'extensions', 'total-recall-preflight.json');
    const installed = fs.existsSync(hookPath);

    const syntheticDeniedCall = {
      event: 'tool_call',
      toolName: 'execute',
      input: { command: 'rm -rf /tmp/foo' },
      cwd: '/nonexistent-directory-without-receipt'
    };

    const out = this.emit(
      { decision: 'deny', reason: 'receipt missing', fix: ACK_COMMAND },
      'tool_call',
      syntheticDeniedCall.cwd
    );

    const exercised = out.exitCode === 2 && out.stdout.includes('"block":true');

    return {
      installed,
      exercised,
      level: 'enforced (unverified live)',
      native: out.stdout.trim()
    };
  }
};

export default piAdapter;
