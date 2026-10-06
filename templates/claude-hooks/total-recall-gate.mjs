#!/usr/bin/env node
// Total Recall gate (installed by `total-recall connect claude-code`). PostToolUse: records when this session last ran `total-recall recall|context`.
// PreToolUse: blocks decision-making actions (scheduling, reaching other machines, service
// managers, Claude sign-in) unless Total Recall was consulted in this session in the last 30 min.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const WINDOW_MS = 30 * 60 * 1000;
const dir = path.join(os.homedir(), '.claude', 'hooks', 'total-recall-gate-state');
const input = JSON.parse(fs.readFileSync(0, 'utf8') || '{}');
const event = input.hook_event_name;
const tool = input.tool_name || '';
const cmd = String(input.tool_input?.command || '');
const stamp = path.join(dir, `${String(input.session_id || 'none').replace(/[^\w-]/g, '')}.ts`);

const consults = /\btotal-recall\s+(recall|context)\b|bin\/total-recall\.mjs\s+(recall|context)\b/;
if (event === 'PostToolUse') {
  if (tool === 'Bash' && consults.test(cmd)) {
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(stamp, String(Date.now()));
  }
  process.exit(0);
}

const gatedTools = /^(mcp__scheduled-tasks__(create|update)_scheduled_task|RemoteTrigger|CronCreate|mcp__terminal__run_in_terminal)$/;
const gatedBash = /(^|[\s;&|(])(ssh|scp|rsync|launchctl|crontab|systemctl)\s|\bclaude\s+(setup-token|auth\s+login)\b/;
const isGated = gatedTools.test(tool) && !(tool === 'RemoteTrigger' && !/^(create|update|run)$/.test(input.tool_input?.action || ''))
  || (tool === 'Bash' && gatedBash.test(cmd) && !consults.test(cmd));
if (!isGated) process.exit(0);

let last = 0;
try { last = Number(fs.readFileSync(stamp, 'utf8')) || 0; } catch {}
if (Date.now() - last < WINDOW_MS) process.exit(0);

process.stdout.write(JSON.stringify({ hookSpecificOutput: {
  hookEventName: 'PreToolUse',
  permissionDecision: 'deny',
  permissionDecisionReason: 'Total Recall gate: before scheduling, reaching another machine, managing services or signing in, run `total-recall recall "<topic>" --local` (and `total-recall context` if the task changed) in this session, read the result, then retry.',
} }));
