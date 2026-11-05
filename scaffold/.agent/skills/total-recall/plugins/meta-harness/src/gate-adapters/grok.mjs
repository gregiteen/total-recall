/**
 * xAI Grok Build CLI hook adapter.
 * Official doc: https://docs.x.ai/build/features/hooks
 */
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const ACK_COMMAND = 'total-recall tr-preflight --ack --task "<task>" --action read,edit,test';

export const grokAdapter = {
  id: 'grok',
  level: 'enforced (unverified live)',
  source: {
    url: 'https://docs.x.ai/build/features/hooks',
    retrieved: '2026-11-04',
    note: 'Grok Build hooks in ~/.grok/hooks/ or .grok/hooks/'
  },
  limits: [
    'Timeouts, crashes and malformed outputs fail open in Grok Build',
    'Project-level hooks require trust in ~/.grok/trusted_folders.toml'
  ],

  parse(input = {}) {
    const event = input.hookEventName || input.event || 'PreToolUse';
    const toolName = input.toolName || input.tool_name || input.tool || '';
    const toolInput = input.toolInput || input.tool_input || input.input || {};
    const cwd = input.cwd || input.workspaceRoot || process.cwd();

    let tool = 'other';
    let command;
    let filePath;

    if (toolName === 'Bash' || toolName === 'exec' || toolName === 'shell') {
      tool = 'shell';
      command = toolInput.command || toolInput.cmd || '';
    } else if (/^(Edit|Write)$/.test(toolName)) {
      tool = 'write';
      filePath = toolInput.file_path || toolInput.path || '';
    } else if (/^(Read|Glob|Grep)$/.test(toolName)) {
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
      const payload = { decision: 'allow' };
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
    return this.emit(decision, parsed.event, parsed.cwd);
  },

  install({ home = os.homedir(), dryRun = false } = {}) {
    const grokDir = path.join(home, '.grok', 'hooks');
    const hooksPath = path.join(grokDir, 'total-recall-preflight.json');
    const added = [];

    const hookDef = {
      name: 'total-recall-preflight',
      description: 'Fail-closed preflight gate for Total Recall',
      events: ['PreToolUse'],
      matcher: '*',
      command: 'total-recall preflight gate --harness grok',
      timeout: 5
    };

    if (!dryRun) {
      fs.mkdirSync(grokDir, { recursive: true });
      fs.writeFileSync(hooksPath, `${JSON.stringify(hookDef, null, 2)}\n`);
      added.push('managed Grok PreToolUse hook');
    }

    return { settings: hooksPath, added };
  },

  verify({ home = os.homedir() } = {}) {
    const hooksPath = path.join(home, '.grok', 'hooks', 'total-recall-preflight.json');
    const installed = fs.existsSync(hooksPath);

    const syntheticDeniedCall = {
      hookEventName: 'PreToolUse',
      toolName: 'Bash',
      toolInput: { command: 'rm -rf /tmp/foo' },
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

export default grokAdapter;
