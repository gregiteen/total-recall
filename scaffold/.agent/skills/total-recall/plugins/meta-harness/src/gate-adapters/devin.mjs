/**
 * Devin CLI & Windsurf Cascade hook adapter.
 * Official doc: https://docs.devin.ai/cli/extensibility/hooks/lifecycle-hooks
 */
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const ACK_COMMAND = 'total-recall tr-preflight --ack --task "<task>" --action read,edit,test';

export const devinAdapter = {
  id: 'devin',
  aliases: ['windsurf'],
  level: 'enforced (unverified live)',
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
    const event = input.event || input.hookEventName || 'PreToolUse';
    const toolName = input.tool || input.toolName || input.tool_name || '';
    const toolInput = input.toolInput || input.input || {};
    const cwd = input.cwd || process.cwd();

    let tool = 'other';
    let command;
    let filePath;

    if (toolName === 'exec' || toolName === 'Bash' || toolName === 'shell') {
      tool = 'shell';
      command = toolInput.cmd || toolInput.command || '';
    } else if (toolName === 'edit' || toolName === 'write') {
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

  install({ home = os.homedir(), dryRun = false } = {}) {
    const devinDir = path.join(home, '.config', 'devin');
    const hooksPath = path.join(devinDir, 'hooks.json');
    const added = [];

    let config = { hooks: {} };
    if (fs.existsSync(hooksPath)) {
      try {
        config = JSON.parse(fs.readFileSync(hooksPath, 'utf8') || '{}');
      } catch (err) {
        throw new Error(`${hooksPath} is not valid JSON; fix it before installing hooks: ${err.message}`);
      }
    }
    config.hooks = config.hooks || {};
    config.hooks.PreToolUse = config.hooks.PreToolUse || [];

    const gateCommand = 'total-recall preflight gate --harness devin';
    const hasHook = config.hooks.PreToolUse.some(e =>
      String(e.command || '').includes('preflight gate --harness devin')
    );

    if (!hasHook) {
      config.hooks.PreToolUse.push({
        matcher: '*',
        command: gateCommand,
        timeout: 10
      });
      added.push('managed PreToolUse gate');
    }

    if (!dryRun && added.length) {
      fs.mkdirSync(devinDir, { recursive: true });
      if (fs.existsSync(hooksPath)) {
        fs.copyFileSync(hooksPath, `${hooksPath}.bak-total-recall`);
      }
      fs.writeFileSync(hooksPath, `${JSON.stringify(config, null, 2)}\n`);
    }

    return { settings: hooksPath, added };
  },

  verify({ home = os.homedir() } = {}) {
    const hooksPath = path.join(home, '.config', 'devin', 'hooks.json');
    let installed = false;
    if (fs.existsSync(hooksPath)) {
      try {
        const config = JSON.parse(fs.readFileSync(hooksPath, 'utf8') || '{}');
        const preHooks = config.hooks?.PreToolUse || [];
        installed = preHooks.some(e => String(e.command || '').includes('preflight gate --harness devin'));
      } catch { /* unparseable */ }
    }

    const syntheticDeniedCall = {
      event: 'PreToolUse',
      tool: 'exec',
      toolInput: { cmd: 'rm -rf /tmp/foo' },
      cwd: '/nonexistent-directory-without-receipt'
    };

    const out = this.emit(
      { decision: 'deny', reason: 'receipt missing', fix: ACK_COMMAND },
      'PreToolUse',
      syntheticDeniedCall.cwd
    );

    const exercised = out.exitCode === 2 && out.stdout.includes('"decision":"deny"');

    return {
      installed,
      exercised,
      level: 'enforced (unverified live)',
      native: out.stdout.trim()
    };
  }
};

export default devinAdapter;
