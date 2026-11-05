/**
 * OpenClaw Messaging Bridge hook adapter.
 * Official doc: https://docs.openclaw.ai/plugins/hooks
 */
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const ACK_COMMAND = 'total-recall tr-preflight --ack --task "<task>" --action read,edit,test';

export const openclawAdapter = {
  id: 'openclaw',
  level: 'enforced',
  source: {
    url: 'https://docs.openclaw.ai/plugins/hooks',
    retrieved: '2026-11-04',
    note: 'OpenClaw before_tool_call plugin hooks with fail-closed timeout'
  },
  limits: [
    'OpenClaw before_tool_call fails closed on timeout or exception',
    'Returns { block: true, blockReason: reason } on deny'
  ],

  parse(input = {}) {
    const event = input.event || 'before_tool_call';
    const toolName = input.toolName || input.tool_name || input.tool || '';
    const params = input.params || input.args || {};
    const cwd = input.cwd || process.cwd();

    let tool = 'other';
    let command;
    let filePath;

    if (toolName === 'execute' || toolName === 'Bash' || toolName === 'shell') {
      tool = 'shell';
      command = params.command || params.cmd || '';
    } else if (toolName === 'write' || toolName === 'edit' || toolName === 'Edit' || toolName === 'Write') {
      tool = 'write';
      filePath = params.path || params.file_path || '';
    } else if (toolName === 'read' || toolName === 'Read') {
      tool = 'read';
      filePath = params.path || params.file_path || '';
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
      blockReason: reason,
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
    const isRemove = remove || off;
    const openclawDir = path.join(home, '.openclaw');
    const hooksPath = path.join(openclawDir, 'hooks.json');
    const added = [];
    const removed = [];

    let hooksConfig = { hooks: {} };
    if (fs.existsSync(hooksPath)) {
      try {
        hooksConfig = JSON.parse(fs.readFileSync(hooksPath, 'utf8') || '{}');
      } catch (err) {
        throw new Error(`${hooksPath} is not valid JSON; fix it before installing hooks: ${err.message}`);
      }
    }
    hooksConfig.hooks = hooksConfig.hooks || {};
    hooksConfig.hooks.before_tool_call = hooksConfig.hooks.before_tool_call || [];

    if (isRemove) {
      const beforeLen = hooksConfig.hooks.before_tool_call.length;
      hooksConfig.hooks.before_tool_call = hooksConfig.hooks.before_tool_call.filter(e =>
        !String(e.command || '').includes('preflight')
      );
      if (hooksConfig.hooks.before_tool_call.length < beforeLen) {
        removed.push('managed before_tool_call gate');
      }
      if (!dryRun && fs.existsSync(hooksPath)) {
        fs.writeFileSync(hooksPath, `${JSON.stringify(hooksConfig, null, 2)}\n`);
      }
      return { settings: hooksPath, added: [], removed };
    }

    const gateCommand = 'total-recall preflight gate --harness openclaw';
    const hasPreTool = hooksConfig.hooks.before_tool_call.some(e =>
      String(e.command || '').includes('preflight gate --harness openclaw')
    );

    if (!hasPreTool) {
      hooksConfig.hooks.before_tool_call.push({
        matcher: '*',
        command: gateCommand,
        timeout: 10
      });
      added.push('managed before_tool_call gate');
    }

    if (!dryRun && added.length) {
      fs.mkdirSync(openclawDir, { recursive: true });
      if (fs.existsSync(hooksPath)) {
        fs.copyFileSync(hooksPath, `${hooksPath}.bak-total-recall`);
      }
      fs.writeFileSync(hooksPath, `${JSON.stringify(hooksConfig, null, 2)}\n`);
    }

    return { settings: hooksPath, added };
  },

  verify({ home = os.homedir() } = {}) {
    const hooksPath = path.join(home, '.openclaw', 'hooks.json');
    let installed = false;
    if (fs.existsSync(hooksPath)) {
      try {
        const config = JSON.parse(fs.readFileSync(hooksPath, 'utf8') || '{}');
        const preHooks = config.hooks?.before_tool_call || [];
        installed = preHooks.some(e => String(e.command || '').includes('preflight gate --harness openclaw'));
      } catch { /* unparseable */ }
    }

    const syntheticDeniedCall = {
      event: 'before_tool_call',
      toolName: 'execute',
      params: { command: 'rm -rf /tmp/foo' },
      cwd: '/nonexistent-directory-without-receipt'
    };

    const out = this.emit(
      { decision: 'deny', reason: 'receipt missing', fix: ACK_COMMAND },
      'before_tool_call',
      syntheticDeniedCall.cwd
    );

    const exercised = out.exitCode === 2 && out.stdout.includes('"block":true');

    return {
      installed,
      exercised,
      level: 'enforced',
      native: out.stdout.trim()
    };
  }
};

export default openclawAdapter;
