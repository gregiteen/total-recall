/**
 * Claude Code hooks that make Total Recall part of how the agent works, not a
 * startup suggestion it can skip:
 *  - SessionStart loads the Total Recall skill entrypoint into context.
 *  - PreToolUse/PostToolUse run the Total Recall gate: scheduling, reaching
 *    another machine, managing services or signing in is denied until the
 *    session has run `total-recall recall|context` in the last 30 minutes.
 * Installed into ~/.claude by `total-recall connect claude-code` (which `init`
 * calls for detected IDEs). Idempotent; other hooks in settings.json are kept.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { installLessonHooks } from './lesson-hooks.mjs';

const PACKAGE_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
export const GATE_TEMPLATE = path.join(PACKAGE_ROOT, 'templates', 'claude-hooks', 'total-recall-gate.mjs');
const GATE_FILE = 'total-recall-gate.mjs';
const SKILL_MARK = 'Loading Total Recall skill';
const GATE_MATCHER = 'Bash|RemoteTrigger|CronCreate|mcp__scheduled-tasks__.*|mcp__terminal__run_in_terminal';

const SKILL_COMMAND = 'f="$CLAUDE_PROJECT_DIR/.agent/skills/total-recall/SKILL.md"; [ -f "$f" ] || f="$HOME/.agent/skills/total-recall/SKILL.md"; if [ -f "$f" ]; then echo "MANDATORY CONTEXT: the Total Recall skill ($f), loaded by a SessionStart hook. Follow it; use the total-recall CLI as documented here."; cat "$f"; fi';

export const PREFLIGHT_GATE_COMMAND = 'total-recall preflight gate --harness claude';
export const PREFLIGHT_REMIND_COMMAND = 'total-recall preflight remind';
export const STOPGAP_FILE = 'total-recall-preflight.mjs';

const hasCommand = (entries, needle) => (entries || []).some((e) => (e.hooks || []).some((h) => String(h.command || h.statusMessage || '').includes(needle)));

/**
 * @param {{ home?: string, dryRun?: boolean }} [opts]
 * @returns {{ gate: string, settings: string, added: string[], removed: string[] }}
 */
export function installClaudeCodeHooks(opts = {}) {
  const home = opts.home || os.homedir();
  const claudeDir = path.join(home, '.claude');
  const hookPath = path.join(claudeDir, 'hooks', GATE_FILE);
  const stopgapPath = path.join(claudeDir, 'hooks', STOPGAP_FILE);
  const settingsPath = path.join(claudeDir, 'settings.json');
  const added = [];
  const removed = [];

  const template = fs.readFileSync(GATE_TEMPLATE, 'utf8');
  const current = fs.existsSync(hookPath) ? fs.readFileSync(hookPath, 'utf8') : null;
  if (current !== template) added.push(current === null ? 'gate script' : 'gate script (updated)');

  let settings = {};
  if (fs.existsSync(settingsPath)) {
    const raw = fs.readFileSync(settingsPath, 'utf8');
    try { settings = raw.trim() ? JSON.parse(raw) : {}; } catch (err) {
      throw new Error(`${settingsPath} is not valid JSON; fix it before installing hooks (${err.message})`);
    }
  }
  const hooks = settings.hooks || (settings.hooks = {});

  // Clean up 2026-11-02 stopgap entries from settings and filesystem (ENFORCE-R14)
  for (const event of ['PreToolUse', 'UserPromptSubmit', 'SessionStart', 'PostToolUse']) {
    if (Array.isArray(hooks[event])) {
      const beforeLen = hooks[event].length;
      hooks[event] = hooks[event].filter(entry => {
        const sub = entry.hooks || [];
        return !sub.some(h => String(h.command || '').includes(STOPGAP_FILE));
      });
      if (hooks[event].length < beforeLen) {
        removed.push(`stopgap ${event} hook`);
      }
    }
  }

  if (!opts.dryRun && fs.existsSync(stopgapPath)) {
    try {
      fs.unlinkSync(stopgapPath);
      removed.push('stopgap hook script');
    } catch { /* ignore */ }
  }

  const gateCommand = `node "$HOME/.claude/hooks/${GATE_FILE}"`;
  if (!hasCommand(hooks.SessionStart, SKILL_MARK) && !hasCommand(hooks.SessionStart, 'total-recall/SKILL.md')) {
    (hooks.SessionStart ||= []).push({ hooks: [{ type: 'command', command: SKILL_COMMAND, timeout: 10, statusMessage: SKILL_MARK }] });
    added.push('SessionStart skill loader');
  }
  if (!hasCommand(hooks.PreToolUse, GATE_FILE)) {
    (hooks.PreToolUse ||= []).push({ matcher: GATE_MATCHER, hooks: [{ type: 'command', command: gateCommand, timeout: 5 }] });
    added.push('PreToolUse gate');
  }
  if (!hasCommand(hooks.PostToolUse, GATE_FILE)) {
    (hooks.PostToolUse ||= []).push({ matcher: 'Bash', hooks: [{ type: 'command', command: gateCommand, timeout: 5 }] });
    added.push('PostToolUse recorder');
  }

  // Managed preflight enforcement hooks (ENFORCE-R1, ENFORCE-R2, ENFORCE-R14)
  if (!hasCommand(hooks.PreToolUse, 'preflight gate --harness claude')) {
    (hooks.PreToolUse ||= []).push({ matcher: '*', hooks: [{ type: 'command', command: PREFLIGHT_GATE_COMMAND, timeout: 5 }] });
    added.push('managed PreToolUse preflight gate');
  }
  if (!hasCommand(hooks.UserPromptSubmit, 'preflight remind')) {
    (hooks.UserPromptSubmit ||= []).push({ hooks: [{ type: 'command', command: PREFLIGHT_REMIND_COMMAND, timeout: 5 }] });
    added.push('managed UserPromptSubmit preflight reminder');
  }

  if (!opts.dryRun && (added.length || removed.length)) {
    fs.mkdirSync(path.dirname(hookPath), { recursive: true });
    if (current !== template) fs.writeFileSync(hookPath, template, { mode: 0o755 });
    if (fs.existsSync(settingsPath)) fs.copyFileSync(settingsPath, `${settingsPath}.bak-total-recall`);
    fs.writeFileSync(settingsPath, `${JSON.stringify(settings, null, 2)}\n`);
  }
  const lessons = installLessonHooks({ harness: 'claude', settings: settingsPath, status: 'installed' }, { dryRun: opts.dryRun });
  return { gate: hookPath, settings: settingsPath, added, removed, lessons };
}
