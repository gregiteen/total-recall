import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { installClaudeCodeHooks } from './claude-hooks.mjs';

let home;
beforeEach(() => { home = fs.mkdtempSync(path.join(os.tmpdir(), 'tr-claude-hooks-')); });
afterEach(() => { fs.rmSync(home, { recursive: true, force: true }); });

const settingsOf = () => JSON.parse(fs.readFileSync(path.join(home, '.claude', 'settings.json'), 'utf8'));
const gate = (input, h = home) => execFileSync('node', [path.join(h, '.claude', 'hooks', 'total-recall-gate.mjs')], {
  input: JSON.stringify(input), env: { ...process.env, HOME: h }, encoding: 'utf8',
});

describe('installClaudeCodeHooks', () => {
  it('installs the skill loader and the gate into a fresh home', () => {
    const r = installClaudeCodeHooks({ home });
    expect(r.added).toEqual(['gate script', 'SessionStart skill loader', 'PreToolUse gate', 'PostToolUse recorder']);
    const s = settingsOf();
    expect(s.hooks.SessionStart).toHaveLength(1);
    expect(s.hooks.PreToolUse[0].hooks[0].command).toContain('total-recall-gate.mjs');
    expect(fs.statSync(path.join(home, '.claude', 'hooks', 'total-recall-gate.mjs')).mode & 0o100).toBeTruthy();
  });

  it('is idempotent and keeps hooks it does not own', () => {
    fs.mkdirSync(path.join(home, '.claude'), { recursive: true });
    fs.writeFileSync(path.join(home, '.claude', 'settings.json'), JSON.stringify({ model: 'x', hooks: { PreToolUse: [{ matcher: 'Edit', hooks: [{ type: 'command', command: 'mine' }] }] } }));
    installClaudeCodeHooks({ home });
    const again = installClaudeCodeHooks({ home });
    expect(again.added).toEqual([]);
    const s = settingsOf();
    expect(s.model).toBe('x');
    expect(s.hooks.PreToolUse.map((e) => e.hooks[0].command)).toEqual(['mine', 'node "$HOME/.claude/hooks/total-recall-gate.mjs"']);
  });

  it('refuses to overwrite a settings file that is not JSON', () => {
    fs.mkdirSync(path.join(home, '.claude'), { recursive: true });
    fs.writeFileSync(path.join(home, '.claude', 'settings.json'), '{ broken');
    expect(() => installClaudeCodeHooks({ home })).toThrow(/not valid JSON/);
    expect(fs.readFileSync(path.join(home, '.claude', 'settings.json'), 'utf8')).toBe('{ broken');
  });
});

describe('total-recall gate', () => {
  beforeEach(() => installClaudeCodeHooks({ home }));
  const pre = (session, command) => gate({ hook_event_name: 'PreToolUse', session_id: session, tool_name: 'Bash', tool_input: { command } });

  it('denies reaching another machine before a recall, allows it after', () => {
    expect(pre('s1', 'ssh host uptime')).toContain('"permissionDecision":"deny"');
    gate({ hook_event_name: 'PostToolUse', session_id: 's1', tool_name: 'Bash', tool_input: { command: 'total-recall recall "mesh" --local' } });
    expect(pre('s1', 'ssh host uptime')).toBe('');
    expect(pre('s2', 'ssh host uptime')).toContain('deny');
  });

  it('ignores ordinary commands and gates scheduling tools', () => {
    expect(pre('s3', 'ls -la')).toBe('');
    expect(gate({ hook_event_name: 'PreToolUse', session_id: 's3', tool_name: 'CronCreate', tool_input: {} })).toContain('deny');
    expect(gate({ hook_event_name: 'PreToolUse', session_id: 's3', tool_name: 'RemoteTrigger', tool_input: { action: 'list' } })).toBe('');
  });
});
