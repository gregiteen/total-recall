/**
 * DeepSeek Harness (DSH) PreToolUse hook adapter.
 * Migrates legacy tr-first.sh / tr-wrapper.sh into managed preflight gate.
 */
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const ACK_COMMAND = 'total-recall tr-preflight --ack --task "<task>" --action read,edit,test';

export const dshAdapter = {
  id: 'dsh',
  level: 'enforced',
  source: {
    note: 'DeepSeek Harness hook configuration in ~/.dsh/hooks/hooks.json',
    retrieved: '2026-11-04'
  },
  limits: [
    'Claude-compatible PreToolUse contract: exit code 2 blocks execution',
    'Repository sweep checks enforce Total Recall consult requirement'
  ],

  parse(input = {}) {
    const event = input.hook_event_name || input.event || 'PreToolUse';
    const toolName = input.tool_name || input.toolName || '';
    const toolInput = input.tool_input || input.toolInput || {};
    const cwd = input.cwd || process.cwd();

    let tool = 'other';
    let command;
    let filePath;

    if (toolName === 'Bash' || toolName === 'shell') {
      tool = 'shell';
      command = toolInput.command || toolInput.cmd || '';
    } else if (toolName === 'Edit' || toolName === 'Write') {
      tool = 'write';
      filePath = toolInput.file_path || toolInput.path || '';
    } else if (toolName === 'Read' || /^(Glob|Grep)$/.test(toolName)) {
      tool = 'read';
      filePath = toolInput.file_path || toolInput.path || '';
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
      permissionDecision: 'deny',
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
    const isRemove = remove || off;
    const dshDir = path.join(home, '.dsh', 'hooks');
    const hooksPath = path.join(dshDir, 'hooks.json');
    const legacyTrFirst = path.join(dshDir, 'tr-first.sh');
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
    hooksConfig.hooks.PreToolUse = hooksConfig.hooks.PreToolUse || [];

    if (isRemove) {
      const beforeLen = hooksConfig.hooks.PreToolUse.length;
      hooksConfig.hooks.PreToolUse = hooksConfig.hooks.PreToolUse.filter(e =>
        !String(e.command || '').includes('preflight') && !String(e.command || '').includes('tr-first')
      );
      if (hooksConfig.hooks.PreToolUse.length < beforeLen) {
        removed.push('managed PreToolUse gate');
      }
      if (!dryRun && fs.existsSync(hooksPath)) {
        fs.writeFileSync(hooksPath, `${JSON.stringify(hooksConfig, null, 2)}\n`);
      }
      return { settings: hooksPath, added: [], removed };
    }

    // Remove legacy unmanaged tr-first.sh scripts if present (F-011)
    const beforeLen = hooksConfig.hooks.PreToolUse.length;
    hooksConfig.hooks.PreToolUse = hooksConfig.hooks.PreToolUse.filter(e => {
      const cmd = String(e.command || '');
      return !cmd.includes('tr-first.sh') && !cmd.includes('tr-wrapper.sh');
    });
    if (hooksConfig.hooks.PreToolUse.length < beforeLen) {
      removed.push('legacy tr-first.sh hook entry');
    }

    const gateCommand = 'total-recall preflight gate --harness dsh';
    const hasPreTool = hooksConfig.hooks.PreToolUse.some(e =>
      String(e.command || '').includes('preflight gate --harness dsh')
    );

    if (!hasPreTool) {
      hooksConfig.hooks.PreToolUse.push({
        matcher: '*',
        command: gateCommand,
        timeout: 10
      });
      added.push('managed PreToolUse gate');
    }

    if (!dryRun && (added.length || removed.length)) {
      fs.mkdirSync(dshDir, { recursive: true });
      if (fs.existsSync(hooksPath)) {
        fs.copyFileSync(hooksPath, `${hooksPath}.bak-total-recall`);
      }
      fs.writeFileSync(hooksPath, `${JSON.stringify(hooksConfig, null, 2)}\n`);
    }

    return { settings: hooksPath, added, removed };
  },

  verify({ home = os.homedir() } = {}) {
    const hooksPath = path.join(home, '.dsh', 'hooks', 'hooks.json');
    let installed = false;
    if (fs.existsSync(hooksPath)) {
      try {
        const config = JSON.parse(fs.readFileSync(hooksPath, 'utf8') || '{}');
        const preHooks = config.hooks?.PreToolUse || [];
        installed = preHooks.some(e => String(e.command || '').includes('preflight gate --harness dsh'));
      } catch { /* unparseable */ }
    }

    const syntheticDeniedCall = {
      hook_event_name: 'PreToolUse',
      tool_name: 'Bash',
      tool_input: { command: 'rm -rf /tmp/foo' },
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
      level: 'enforced',
      native: out.stdout.trim()
    };
  }
};

export default dshAdapter;
