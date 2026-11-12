import { it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawnSync } from 'node:child_process';
import { listTasks } from '../core/task-envelope.mjs';
let agent;
beforeEach(() => { agent = fs.mkdtempSync(path.join(os.tmpdir(), 'lesson-cli-')); });
afterEach(() => fs.rmSync(agent, { recursive: true, force: true }));
const run = (args, input = '') => spawnSync(process.execPath, ['bin/total-recall.mjs', 'lessons', ...args], {
  cwd: process.cwd(), encoding: 'utf8', input, env: { ...process.env, AGENT_DIR: agent }, timeout: 15000,
});
it('runs actual hook ticks and session-end history through the CLI in a fixture brain', () => {
  const input = JSON.stringify({ session_id: 's', entries: [{ role: 'user', content: 'Use tabs.' }, { role: 'assistant', content: 'Done.' }] });
  const tick = run(['tick', '--harness', 'hermes', '--interval', '10'], input);
  expect(tick.status, tick.stderr).toBe(0); expect(tick.stdout.trim()).toBe('{}');
  const end = run(['session-end', '--harness', 'hermes'], JSON.stringify({ session_id: 's' }));
  expect(end.status, end.stderr).toBe(0);
  const queue = path.join(agent, 'skills/total-recall/scheduler/queue');
  expect(listTasks(queue)).toHaveLength(1);
  expect(listTasks(queue)[0].payload).toMatchObject({ fromTurn: 1, toTurn: 1 });
});
it('prints help offline and fails invalid commands and intervals', () => {
  expect(run(['--help']).status).toBe(0);
  expect(run(['unknown']).status).toBe(1);
  expect(run(['tick', '--session', 's', '--interval', '0']).status).toBe(1);
});
