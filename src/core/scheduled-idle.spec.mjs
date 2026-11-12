import { it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
vi.mock('./vault-cache.mjs', () => ({ getNodes: vi.fn(() => [1, 2, 3].map(n => ({ slug: `node-${n}`, title: `Node ${n}`, status: 'active', tags: ['shared'] }))) }));
vi.mock('./inference-engine.mjs', () => ({ runInferenceTask: vi.fn(async () => ({ conclusions: ['fixture conclusion'] })) }));
import { enqueueScheduledIdleTasks, createScheduler } from './scheduler.mjs';
import { listTasks, addTask } from './task-envelope.mjs';
import { dispatchTask } from './task-executors.mjs';
import { runDuePluginTasks } from '../../scaffold/.agent/skills/total-recall/plugins/automations/scheduler.mjs';
let brain, queueDir, vaultDir;
beforeEach(() => { brain = fs.mkdtempSync(path.join(os.tmpdir(), 'scheduled-idle-')); queueDir = path.join(brain, 'scheduler/queue'); vaultDir = path.join(brain, 'memory-vault'); });
afterEach(() => { vi.restoreAllMocks(); fs.rmSync(brain, { recursive: true, force: true }); });
it('enqueues inference, clarity and compaction only for the scheduled leader operation and dedupes the slot', async () => {
  const opts = { queueDir, vaultDir, leader: async () => false, now: new Date('2026-01-01T10:00Z') };
  expect(await enqueueScheduledIdleTasks(opts)).toEqual({ enqueued: [], skipped: 'not-leader' });
  expect(fs.existsSync(queueDir)).toBe(false);
  vi.spyOn(Math, 'random').mockReturnValue(0);
  opts.leader = async () => true;
  expect((await enqueueScheduledIdleTasks(opts)).enqueued).toHaveLength(3);
  expect((await enqueueScheduledIdleTasks(opts)).enqueued).toHaveLength(0);
  const tasks = listTasks(queueDir);
  expect(tasks.every(task => task.created_by === 'automations')).toBe(true);
  expect(tasks.some(task => task.slug.startsWith('post-mortem'))).toBe(false);
  const inference = tasks.find(task => task.slug.startsWith('inference'));
  expect((await dispatchTask(inference, { brainDir: brain, vaultDir, runtimeConfig: {} })).success).toBe(true);
});
it('followers select local lesson reviews and leave unrelated leader tasks pending', () => {
  addTask({ slug: 'leader-work', intent: 'leader', kind: 'maintenance', priority: 99 }, queueDir);
  addTask({ slug: 'lesson-work', intent: 'review', executor: 'lesson-review', kind: 'memory', priority: 10 }, queueDir);
  const scheduler = createScheduler({ queueDir, vaultDir, sessionsDir: path.join(brain, 'sessions') });
  expect(scheduler.next({ localOnly: true }).task.slug).toBe('lesson-work');
  expect(scheduler.next({ localOnly: true }).task).toBeNull();
  expect(scheduler.next().task.slug).toBe('leader-work');
});
it('accepts enqueue through the automations existing manifest-task runner without waiting for an empty queue', async () => {
  addTask({ slug: 'explicit-work', intent: 'existing work' }, queueDir);
  const plugin = { id: 'automations', valid: true, pluginsDir: '/fixture/plugins', manifest: {
    tasks: [{ command: 'idle', schedule: '* * * * *', intent: 'Scheduled maintenance' }],
  } };
  const core = {
    discoverPlugins: () => [plugin], readPluginRecord: () => ({ task_runs: { idle: '2026-01-01T10:00' } }),
    pluginExecutionEnabled: () => true, patchPluginRecord: vi.fn(async () => {}),
    vaultForPluginsDir: () => '/fixture/vault', appendVfsEvent: vi.fn(async () => {}), logger: { warn: vi.fn() },
    runPluginCommand: vi.fn(async (_plugin, { subcommand }) => {
      expect(subcommand).toBe('idle');
      const result = await enqueueScheduledIdleTasks({ queueDir, vaultDir, leader: async () => true });
      return { ok: true, exitCode: 0, output: JSON.stringify(result), durationMs: 1 };
    }),
  };
  const result = await runDuePluginTasks({ core, projectRoot: '/fixture', selfNode: {}, now: new Date(2026, 0, 1, 10, 1) });
  expect(result[0].ok).toBe(true); expect(listTasks(queueDir)).toHaveLength(4);
  expect(core.appendVfsEvent).toHaveBeenCalled();
});
