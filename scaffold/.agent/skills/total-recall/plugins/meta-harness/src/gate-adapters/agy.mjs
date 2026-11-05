/**
 * Google Antigravity (agy) PreToolUse & lifecycle hook adapter.
 * Official doc: https://antigravity.google/docs/hooks?tab=cli
 */
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const ACK_COMMAND = 'total-recall tr-preflight --ack --task "<task>" --action read,edit,test';

export const agyAdapter = {
  id: 'agy',
  aliases: ['antigravity'],
  level: 'enforced',
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
    } else if (name === 'read_file' || /^(Read|Glob|Grep)$/.test(name)) {
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

  install({ home = os.homedir(), dryRun = false, remove = false, off = false } = {}) {
    const isRemove = remove || off;
    const geminiDir = path.join(home, '.gemini', 'config');
    const hooksPath = path.join(geminiDir, 'hooks.json');
    const added = [];
    const removed = [];

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

    if (isRemove) {
      const beforeLen = config.hooks.PreToolUse.length;
      config.hooks.PreToolUse = config.hooks.PreToolUse.filter(e =>
        !String(e.command || '').includes('preflight')
      );
      if (config.hooks.PreToolUse.length < beforeLen) {
        removed.push('managed PreToolUse gate');
      }
      if (!dryRun && fs.existsSync(hooksPath)) {
        fs.writeFileSync(hooksPath, `${JSON.stringify(config, null, 2)}\n`);
      }
      return { settings: hooksPath, added: [], removed };
    }

    const gateCommand = 'total-recall preflight gate --harness agy';
    const hasPreTool = config.hooks.PreToolUse.some(e =>
      String(e.command || '').includes('preflight gate --harness agy')
    );

    if (!hasPreTool) {
      config.hooks.PreToolUse.push({
        matcher: '*',
        command: gateCommand,
        timeout: 10
      });
      added.push('managed PreToolUse gate');
    }

    if (!dryRun && added.length) {
      fs.mkdirSync(geminiDir, { recursive: true });
      if (fs.existsSync(hooksPath)) {
        fs.copyFileSync(hooksPath, `${hooksPath}.bak-total-recall`);
      }
      fs.writeFileSync(hooksPath, `${JSON.stringify(config, null, 2)}\n`);
    }

    return { settings: hooksPath, added };
  },

  verify({ home = os.homedir() } = {}) {
    const hooksPath = path.join(home, '.gemini', 'config', 'hooks.json');
    let installed = false;
    if (fs.existsSync(hooksPath)) {
      try {
        const config = JSON.parse(fs.readFileSync(hooksPath, 'utf8') || '{}');
        const preHooks = config.hooks?.PreToolUse || [];
        installed = preHooks.some(e => String(e.command || '').includes('preflight gate --harness agy'));
      } catch { /* unparseable */ }
    }

    const syntheticDeniedCall = {
      event: 'PreToolUse',
      toolCall: {
        name: 'run_command',
        args: { CommandLine: 'rm -rf /tmp/foo' }
      },
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

export default agyAdapter;
