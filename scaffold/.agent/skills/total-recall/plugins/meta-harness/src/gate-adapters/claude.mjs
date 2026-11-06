/**
 * Claude Code PreToolUse & UserPromptSubmit adapter.
 * Official doc: https://docs.anthropic.com/en/docs/agents-and-tools/claude-code/overview
 */
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const ACK_COMMAND = 'total-recall tr-preflight --ack --task "<task>" --action read,edit,test';

export const claudeAdapter = {
  id: 'claude',
  level: 'enforced',
  warnings: {
    delivery: 'documented',
    via: 'hookSpecificOutput.additionalContext',
    source: 'https://code.claude.com/docs/en/hooks.md',
  },
  source: {
    url: 'https://docs.anthropic.com/en/docs/agents-and-tools/claude-code/overview',
    retrieved: '2026-11-04',
    note: 'Claude Code hook configuration in settings.json with PreToolUse and UserPromptSubmit'
  },
  readablePaths: [
    /\/\.claude\/projects\/[^/]+\/[^/]+\/tool-results\/[^/]+$/
  ],
  limits: [
    'UserPromptSubmit hook is advisory-only per ENFORCE-R1 and never blocks turn',
    'PreToolUse blocks tool executions with exit 2 or permissionDecision: "deny"'
  ],

  /**
   * Parse Claude Code native hook JSON from stdin into normalized shape:
   * { event, tool, command, path, cwd }
   */
  parse(input = {}) {
    const event = input.hook_event_name || (input.tool_name ? 'PreToolUse' : 'UserPromptSubmit');
    const toolName = input.tool_name || '';
    const cwd = input.cwd || process.cwd();
    const toolInput = input.tool_input || {};

    let tool = 'other';
    let command;
    let filePath;

    if (toolName === 'Bash') {
      tool = 'shell';
      command = toolInput.command || '';
    } else if (/^(Read|Glob|Grep)$/.test(toolName)) {
      tool = 'read';
      filePath = toolInput.file_path || toolInput.path || toolInput.pattern || '';
    } else if (/^(Edit|Write|MultiEdit|NotebookEdit)$/.test(toolName)) {
      tool = 'write';
      filePath = toolInput.file_path || toolInput.notebook_path || '';
    } else if (/^(WebFetch|WebSearch)$/.test(toolName)) {
      tool = 'web';
    } else if (/^mcp__ccd_turn__/.test(toolName)) {
      tool = 'ui';
    } else if (/^mcp__ccd_(session|session_mgmt)__/.test(toolName)) {
      tool = 'agent';
    } else if (/^mcp__/.test(toolName)) {
      tool = 'mcp';
    } else if (/^(Agent|Task|SendMessage|ListAgents)$/.test(toolName)) {
      tool = 'agent';
    } else if (/^(ToolSearch|Skill|AskUserQuestion|TodoWrite|ExitPlanMode|EnterPlanMode)$/.test(toolName)) {
      tool = 'meta';
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

  /**
   * Emit Claude Code native response: { stdout, exitCode }
   */
  emit(decision, event, cwd = process.cwd()) {
    if (event === 'UserPromptSubmit') {
      // ENFORCE-R1: Prompt hooks never block
      if (decision?.decision === 'deny') {
        const payload = {
          hookSpecificOutput: {
            hookEventName: 'UserPromptSubmit',
            additionalContext: `TR-PREFLIGHT FAILED for ${cwd}: ${decision.reason || 'check failed'}. Run this on its own, with nothing piped, chained or redirected, and read everything it prints: ${decision.fix || ACK_COMMAND}`
          }
        };
        return { stdout: `${JSON.stringify(payload)}\n`, exitCode: 0 };
      }
      return { stdout: '', exitCode: 0 };
    }

    // PreToolUse. permissionDecision stays unset: a warning must not approve the call.
    if (decision?.decision === 'allow') {
      if (decision.warning) {
        const payload = { hookSpecificOutput: { hookEventName: 'PreToolUse', additionalContext: decision.warning } };
        return { stdout: `${JSON.stringify(payload)}\n`, exitCode: 0 };
      }
      return { stdout: '', exitCode: 0 };
    }

    // Denied
    const payload = {
      hookSpecificOutput: {
        hookEventName: 'PreToolUse',
        permissionDecision: 'deny',
        permissionDecisionReason: decision?.reason || `TR-PREFLIGHT gate: action denied. Run: ${decision?.fix || ACK_COMMAND}`
      }
    };
    return { stdout: `${JSON.stringify(payload)}\n`, exitCode: 2 };
  },

  /**
   * Run the gate pipeline for Claude Code
   */
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

  /**
   * Install Claude Code managed hooks in settings.json, removing the stopgap
   */
  install({ home = os.homedir(), dryRun = false, remove = false, off = false } = {}) {
    const isRemove = remove || off;
    const claudeDir = path.join(home, '.claude');
    const settingsPath = path.join(claudeDir, 'settings.json');
    const stopgapPath = path.join(claudeDir, 'hooks', 'total-recall-preflight.mjs');
    const added = [];
    const removed = [];

    let settings = {};
    if (fs.existsSync(settingsPath)) {
      try {
        settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8') || '{}');
      } catch (err) {
        throw new Error(`${settingsPath} is not valid JSON; fix it before installing hooks: ${err.message}`);
      }
    }

    const hooks = settings.hooks || (settings.hooks = {});

    if (isRemove) {
      for (const event of ['PreToolUse', 'UserPromptSubmit', 'SessionStart', 'PostToolUse']) {
        if (Array.isArray(hooks[event])) {
          const beforeLen = hooks[event].length;
          hooks[event] = hooks[event].filter(entry => {
            const subHooks = entry.hooks || [];
            return !subHooks.some(h => String(h.command || '').includes('preflight') || String(h.command || '').includes('total-recall-preflight'));
          });
          if (hooks[event].length < beforeLen) {
            removed.push(`managed ${event} hook entry`);
          }
        }
      }
      if (!dryRun && (removed.length || fs.existsSync(settingsPath))) {
        fs.writeFileSync(settingsPath, `${JSON.stringify(settings, null, 2)}\n`);
      }
      return { settings: settingsPath, added: [], removed };
    }

    // 1. Remove stopgap references if present
    for (const event of ['PreToolUse', 'UserPromptSubmit', 'SessionStart', 'PostToolUse']) {
      if (Array.isArray(hooks[event])) {
        const beforeLen = hooks[event].length;
        hooks[event] = hooks[event].filter(entry => {
          const subHooks = entry.hooks || [];
          return !subHooks.some(h => String(h.command || '').includes('total-recall-preflight.mjs'));
        });
        if (hooks[event].length < beforeLen) {
          removed.push(`stopgap ${event} hook entry`);
        }
      }
    }

    // Remove stopgap file on disk if not dryRun
    if (!dryRun && fs.existsSync(stopgapPath)) {
      try {
        fs.unlinkSync(stopgapPath);
        removed.push('total-recall-preflight.mjs file');
      } catch { /* ignore */ }
    }

    // 2. Add managed preflight gate entries
    const gateCommand = 'total-recall preflight gate --harness claude';
    const remindCommand = 'total-recall preflight remind';

    // PreToolUse: match all tools
    hooks.PreToolUse = hooks.PreToolUse || [];
    const hasPreTool = hooks.PreToolUse.some(e =>
      (e.hooks || []).some(h => String(h.command || '').includes('preflight gate --harness claude'))
    );
    if (!hasPreTool) {
      hooks.PreToolUse.push({
        matcher: '*',
        hooks: [{
          type: 'command',
          command: gateCommand,
          timeout: 5
        }]
      });
      added.push('managed PreToolUse gate');
    }

    // UserPromptSubmit: advisory reminder
    hooks.UserPromptSubmit = hooks.UserPromptSubmit || [];
    const hasPrompt = hooks.UserPromptSubmit.some(e =>
      (e.hooks || []).some(h => String(h.command || '').includes('preflight remind'))
    );
    if (!hasPrompt) {
      hooks.UserPromptSubmit.push({
        hooks: [{
          type: 'command',
          command: remindCommand,
          timeout: 5
        }]
      });
      added.push('managed UserPromptSubmit reminder');
    }

    // SessionStart: a compacted or cleared session no longer has its capsule, so the next ack prints it
    hooks.SessionStart = hooks.SessionStart || [];
    const hasSessionStart = hooks.SessionStart.some(e =>
      (e.hooks || []).some(h => String(h.command || '').includes('preflight session-start'))
    );
    if (!hasSessionStart) {
      hooks.SessionStart.push({
        matcher: 'compact|clear',
        hooks: [{
          type: 'command',
          command: 'total-recall preflight session-start',
          timeout: 5
        }]
      });
      added.push('managed SessionStart capsule reset');
    }

    if (!dryRun && (added.length || removed.length)) {
      fs.mkdirSync(claudeDir, { recursive: true });
      if (fs.existsSync(settingsPath)) {
        fs.copyFileSync(settingsPath, `${settingsPath}.bak-total-recall`);
      }
      fs.writeFileSync(settingsPath, `${JSON.stringify(settings, null, 2)}\n`);
    }

    return { settings: settingsPath, added, removed };
  },

  /**
   * Verify installed hook with a synthetic denied tool call
   */
  verify({ home = os.homedir() } = {}) {
    const settingsPath = path.join(home, '.claude', 'settings.json');
    if (!fs.existsSync(settingsPath)) {
      return { installed: false, exercised: false, reason: 'settings.json not found' };
    }
    let settings;
    try {
      settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8') || '{}');
    } catch {
      return { installed: false, exercised: false, reason: 'settings.json is unparseable' };
    }
    const preHooks = settings.hooks?.PreToolUse || [];
    const installed = preHooks.some(e =>
      (e.hooks || []).some(h => String(h.command || '').includes('preflight gate --harness claude'))
    );

    // Exercise with synthetic denied payload
    const syntheticDeniedCall = {
      hook_event_name: 'PreToolUse',
      tool_name: 'Bash',
      tool_input: { command: 'git status' },
      cwd: '/nonexistent-directory-without-receipt'
    };

    const out = this.emit(
      { decision: 'deny', reason: 'receipt missing', fix: ACK_COMMAND },
      'PreToolUse',
      syntheticDeniedCall.cwd
    );

    const exercised = out.exitCode === 2 && out.stdout.includes('"permissionDecision":"deny"');

    return {
      installed,
      exercised,
      level: 'enforced',
      native: out.stdout.trim()
    };
  }
};

export default claudeAdapter;
