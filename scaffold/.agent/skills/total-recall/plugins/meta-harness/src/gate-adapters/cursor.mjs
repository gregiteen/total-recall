/**
 * Cursor IDE & agent hook adapter.
 * Official doc: https://cursor.com/docs/hooks
 */
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const ACK_COMMAND = 'total-recall tr-preflight --ack --task "<task>" --action read,edit,test';

export const cursorAdapter = {
  id: 'cursor',
  level: 'enforced (unverified live)',
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
    const event = input.event || input.hookEventName || 'preToolUse';
    const toolName = input.toolName || input.tool || '';
    const toolInput = input.toolInput || input.input || {};
    const cwd = input.cwd || input.workspaceRoot || process.cwd();

    let tool = 'other';
    let command;
    let filePath;

    if (event === 'beforeShellExecution' || toolName === 'execute' || toolName === 'terminal' || toolName === 'Bash') {
      tool = 'shell';
      command = input.command || toolInput.command || toolInput.cmd || '';
    } else if (event === 'beforeReadFile' || toolName === 'readFile' || toolName === 'Read') {
      tool = 'read';
      filePath = input.file || input.path || toolInput.file || toolInput.path || '';
    } else if (toolName === 'edit' || toolName === 'Write' || toolName === 'Edit') {
      tool = 'write';
      filePath = input.file || input.path || toolInput.file || toolInput.path || '';
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
      const payload = { permission: 'allow' };
      return { stdout: `${JSON.stringify(payload)}\n`, exitCode: 0 };
    }

    const reason = decision?.reason || `TR-PREFLIGHT gate: action denied. Run: ${decision?.fix || ACK_COMMAND}`;
    const payload = {
      permission: 'deny',
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
    const cursorDir = path.join(home, '.cursor');
    const hooksPath = path.join(cursorDir, 'hooks.json');
    const added = [];

    let config = { hooks: {}, failClosed: true };
    if (fs.existsSync(hooksPath)) {
      try {
        config = JSON.parse(fs.readFileSync(hooksPath, 'utf8') || '{}');
      } catch (err) {
        throw new Error(`${hooksPath} is not valid JSON; fix it before installing hooks: ${err.message}`);
      }
    }
    config.failClosed = true;
    config.hooks = config.hooks || {};
    config.hooks.preToolUse = config.hooks.preToolUse || [];

    const gateCommand = 'total-recall preflight gate --harness cursor';
    const hasHook = config.hooks.preToolUse.some(e =>
      String(e.command || '').includes('preflight gate --harness cursor')
    );

    if (!hasHook) {
      config.hooks.preToolUse.push({
        matcher: '*',
        command: gateCommand,
        timeout: 10
      });
      added.push('managed preToolUse gate (failClosed: true)');
    }

    if (!dryRun && added.length) {
      fs.mkdirSync(cursorDir, { recursive: true });
      if (fs.existsSync(hooksPath)) {
        fs.copyFileSync(hooksPath, `${hooksPath}.bak-total-recall`);
      }
      fs.writeFileSync(hooksPath, `${JSON.stringify(config, null, 2)}\n`);
    }

    return { settings: hooksPath, added };
  },

  verify({ home = os.homedir() } = {}) {
    const hooksPath = path.join(home, '.cursor', 'hooks.json');
    let installed = false;
    if (fs.existsSync(hooksPath)) {
      try {
        const config = JSON.parse(fs.readFileSync(hooksPath, 'utf8') || '{}');
        const preHooks = config.hooks?.preToolUse || [];
        installed = preHooks.some(e => String(e.command || '').includes('preflight gate --harness cursor'));
      } catch { /* unparseable */ }
    }

    const syntheticDeniedCall = {
      event: 'preToolUse',
      toolName: 'execute',
      toolInput: { command: 'rm -rf /tmp/foo' },
      cwd: '/nonexistent-directory-without-receipt'
    };

    const out = this.emit(
      { decision: 'deny', reason: 'receipt missing', fix: ACK_COMMAND },
      'preToolUse',
      syntheticDeniedCall.cwd
    );

    const exercised = out.exitCode === 2 && out.stdout.includes('"permission":"deny"');

    return {
      installed,
      exercised,
      level: installed ? 'enforced (unverified live)' : 'enforced (unverified live)',
      native: out.stdout.trim()
    };
  }
};

export default cursorAdapter;
