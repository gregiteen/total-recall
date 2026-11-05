/**
 * Hermes Agent Runtime hook adapter.
 * Official doc: https://hermes-agent.nousresearch.com/docs/user-guide/features/hooks
 */
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const ACK_COMMAND = 'total-recall tr-preflight --ack --task "<task>" --action read,edit,test';

export const hermesAdapter = {
  id: 'hermes',
  level: 'enforced',
  source: {
    url: 'https://hermes-agent.nousresearch.com/docs/user-guide/features/hooks',
    retrieved: '2026-11-04',
    note: 'Hermes shell & plugin hooks in ~/.hermes/config.yaml'
  },
  limits: [
    'Hermes plugin callbacks fail closed on timeout',
    'Pre-tool hook returns {"action":"block","message":...} with exit 2'
  ],

  parse(input = {}) {
    const event = input.event || input.hook_event_name || 'pre_tool_call';
    const toolName = input.tool_name || input.tool || '';
    const toolInput = input.tool_input || input.params || input.args || {};
    const cwd = input.cwd || process.cwd();

    let tool = 'other';
    let command;
    let filePath;

    if (toolName === 'terminal' || toolName === 'Bash' || toolName === 'shell' || toolName === 'exec') {
      tool = 'shell';
      command = toolInput.command || toolInput.cmd || '';
    } else if (toolName === 'write_file' || toolName === 'Edit' || toolName === 'Write') {
      tool = 'write';
      filePath = toolInput.path || toolInput.file_path || '';
    } else if (toolName === 'read_file' || toolName === 'Read') {
      tool = 'read';
      filePath = toolInput.path || toolInput.file_path || '';
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
      const payload = { action: 'allow' };
      return { stdout: `${JSON.stringify(payload)}\n`, exitCode: 0 };
    }

    const reason = decision?.reason || `TR-PREFLIGHT gate: action denied. Run: ${decision?.fix || ACK_COMMAND}`;
    const payload = {
      action: 'block',
      message: reason,
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
    const hermesDir = path.join(home, '.hermes');
    const hooksPath = path.join(hermesDir, 'hooks.json');
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
    hooksConfig.hooks.pre_tool_call = hooksConfig.hooks.pre_tool_call || [];

    if (isRemove) {
      const beforeLen = hooksConfig.hooks.pre_tool_call.length;
      hooksConfig.hooks.pre_tool_call = hooksConfig.hooks.pre_tool_call.filter(e =>
        !String(e.command || '').includes('preflight')
      );
      if (hooksConfig.hooks.pre_tool_call.length < beforeLen) {
        removed.push('managed pre_tool_call gate');
      }
      if (!dryRun && fs.existsSync(hooksPath)) {
        fs.writeFileSync(hooksPath, `${JSON.stringify(hooksConfig, null, 2)}\n`);
      }
      return { settings: hooksPath, added: [], removed };
    }

    const gateCommand = 'total-recall preflight gate --harness hermes';
    const hasPreTool = hooksConfig.hooks.pre_tool_call.some(e =>
      String(e.command || '').includes('preflight gate --harness hermes')
    );

    if (!hasPreTool) {
      hooksConfig.hooks.pre_tool_call.push({
        matcher: '*',
        command: gateCommand,
        timeout: 10
      });
      added.push('managed pre_tool_call gate');
    }

    if (!dryRun && added.length) {
      fs.mkdirSync(hermesDir, { recursive: true });
      if (fs.existsSync(hooksPath)) {
        fs.copyFileSync(hooksPath, `${hooksPath}.bak-total-recall`);
      }
      fs.writeFileSync(hooksPath, `${JSON.stringify(hooksConfig, null, 2)}\n`);
    }

    return { settings: hooksPath, added };
  },

  verify({ home = os.homedir() } = {}) {
    const hooksPath = path.join(home, '.hermes', 'hooks.json');
    let installed = false;
    if (fs.existsSync(hooksPath)) {
      try {
        const config = JSON.parse(fs.readFileSync(hooksPath, 'utf8') || '{}');
        const preHooks = config.hooks?.pre_tool_call || [];
        installed = preHooks.some(e => String(e.command || '').includes('preflight gate --harness hermes'));
      } catch { /* unparseable */ }
    }

    const syntheticDeniedCall = {
      event: 'pre_tool_call',
      tool_name: 'terminal',
      tool_input: { command: 'rm -rf /tmp/foo' },
      cwd: '/nonexistent-directory-without-receipt'
    };

    const out = this.emit(
      { decision: 'deny', reason: 'receipt missing', fix: ACK_COMMAND },
      'pre_tool_call',
      syntheticDeniedCall.cwd
    );

    const exercised = out.exitCode === 2 && out.stdout.includes('"action":"block"');

    return {
      installed,
      exercised,
      level: 'enforced',
      native: out.stdout.trim()
    };
  }
};

export default hermesAdapter;
