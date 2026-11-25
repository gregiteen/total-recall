import { it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawnSync } from 'node:child_process';
import { addTask, listTasks, transitionTaskStatus } from '../core/task-envelope.mjs';
let agent;
beforeEach(() => { agent = fs.mkdtempSync(path.join(os.tmpdir(), 'lesson-cli-')); });
afterEach(() => fs.rmSync(agent, { recursive: true, force: true }));
const run = (args, input = '') => spawnSync(process.execPath, ['bin/total-recall.mjs', 'lessons', ...args], {
  // Pin both agent overrides: without _TR_TEST_AGENT_DIR the CLI resolves the real global brain.
  cwd: process.cwd(), encoding: 'utf8', input, env: { ...process.env, AGENT_DIR: agent, _TR_TEST_AGENT_DIR: agent, TR_META_HARNESS_RUN: '' }, timeout: 15000,
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
it('a Metaharness child hook copies and queues nothing', () => {
  const input = JSON.stringify({ session_id: 's', entries: [{ role: 'user', content: 'Use tabs.' }, { role: 'assistant', content: 'Done.' }] });
  const child = spawnSync(process.execPath, ['bin/total-recall.mjs', 'lessons', 'session-end', '--harness', 'claude'], {
    cwd: process.cwd(), encoding: 'utf8', input, env: { ...process.env, AGENT_DIR: agent, TR_META_HARNESS_RUN: '1' }, timeout: 15000 });
  expect(child.status, child.stderr).toBe(0); expect(child.stdout.trim()).toBe('{}');
  expect(fs.existsSync(path.join(agent, 'skills/total-recall/sessions'))).toBe(false);
  expect(listTasks(path.join(agent, 'skills/total-recall/scheduler/queue'))).toHaveLength(0);
});
it('status counts failed lesson reviews in the queue as well as pending and in-progress ones', async () => {
  const queue = path.join(agent, 'skills/total-recall/scheduler/queue');
  const lesson = (slug, status, extra = {}) => addTask({ slug, intent: `Review ${slug}`, kind: 'memory', executor: 'lesson-review',
    category: 'lesson-review', priority: 40, payload: { sessionPath: 's.jsonl', fromTurn: 1, toTurn: 10 }, status, ...extra }, queue);
  lesson('lesson-review-a', 'failed');
  lesson('lesson-review-b', 'pending');
  lesson('lesson-review-c', 'in-progress');
  lesson('lesson-review-d', 'completed');
  // A failed task records its error and retry count through the real status transition.
  const failing = lesson('lesson-review-e', 'pending');
  failing.retry_count = 3;
  failing.last_error = 'Lesson remember failed: exited 1';
  await transitionTaskStatus(queue, failing, 'failed', { expectedStatus: 'pending' });
  addTask({ slug: 'skill-gap-f', intent: 'Close a gap', kind: 'maintenance', executor: 'skill-manager',
    category: 'skill-engineering', status: 'failed', payload: { topic: 'tabs' },
    created_by: 'post-mortem-engine', origin: { agent: 'post-mortem-engine' } }, queue);
  const status = run(['status']);
  expect(status.status, status.stderr).toBe(0);
  const report = JSON.parse(status.stdout);
  expect(report.queue.pending).toBe(1);
  expect(report.queue.inProgress).toBe(1);
  expect(report.queue.failedCount).toBe(3);
  expect(report.queue.failedTasks.map(task => task.slug).sort()).toEqual(['lesson-review-a', 'lesson-review-e', 'skill-gap-f']);
  expect(report.queue.failedTasks.find(task => task.slug === 'lesson-review-e')).toMatchObject({ last_error: 'Lesson remember failed: exited 1', retry_count: 3 });
});
it('prints help offline and fails invalid commands and intervals', () => {
  expect(run(['--help']).status).toBe(0);
  expect(run(['unknown']).status).toBe(1);
  expect(run(['tick', '--session', 's', '--interval', '0']).status).toBe(1);
});
