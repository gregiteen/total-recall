import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import {
  buildTaskEnvelope,
  addTask,
  listTasks,
  getTask,
  cancelTask,
  normalizeTask,
  FORBIDDEN_CAPABILITIES,
} from './task-envelope.mjs';
import { resolveExecutor, dispatchTask, listExecutorIds } from './task-executors.mjs';

function tmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'tr-task-'));
}

describe('task envelope', () => {
  let queueDir;
  beforeEach(() => {
    queueDir = tmpDir();
  });
  afterEach(() => {
    fs.rmSync(queueDir, { recursive: true, force: true });
  });

  it('builds envelope with defaults', () => {
    const env = buildTaskEnvelope({ intent: 'Do the thing' });
    expect(env.type).toBe('task');
    expect(env.status).toBe('pending');
    expect(env.kind).toBe('custom');
    expect(env.executor).toBe('custom');
    expect(env.intent).toBe('Do the thing');
    expect(env.capabilities).toContain('vault:read');
    expect(env.priority).toBe(50);
  });

  it('normalizes named priority', () => {
    expect(buildTaskEnvelope({ intent: 'x', priority: 'high' }).priority).toBe(80);
    expect(buildTaskEnvelope({ intent: 'x', priority: 'low' }).priority).toBe(20);
  });

  it('rejects forbidden capabilities', () => {
    expect(() =>
      buildTaskEnvelope({ intent: 'rm -rf', capabilities: ['shell'] }),
    ).toThrow(/not allowed/);
    expect(FORBIDDEN_CAPABILITIES).toContain('shell');
  });

  it('persists and lists pending tasks', () => {
    const task = addTask({ intent: 'Extract decisions', priority: 'high', kind: 'custom' }, queueDir);
    expect(fs.existsSync(path.join(queueDir, `${task.slug}.md`))).toBe(true);
    const listed = listTasks(queueDir, { status: 'pending' });
    expect(listed).toHaveLength(1);
    expect(listed[0].slug).toBe(task.slug);
    expect(getTask(queueDir, task.slug).intent).toContain('Extract');
  });

  it('cancels a pending task', () => {
    const task = addTask({ intent: 'Cancel me' }, queueDir);
    const result = cancelTask(queueDir, task.slug);
    expect(result.success).toBe(true);
    expect(listTasks(queueDir, { status: 'pending' })).toHaveLength(0);
    expect(listTasks(queueDir, { status: 'cancelled' })).toHaveLength(1);
  });
});

describe('executor registry', () => {
  it('lists built-in executors', () => {
    const ids = listExecutorIds();
    expect(ids).toContain('dream');
    expect(ids).toContain('custom');
    expect(ids).toContain('legacy');
  });

  it('resolves custom kind to custom executor', () => {
    const task = normalizeTask({
      slug: 't1',
      kind: 'custom',
      category: 'custom',
      intent: 'hi',
    });
    expect(resolveExecutor(task).id).toBe('custom');
  });

  it('resolves dream slug to dream executor', () => {
    expect(resolveExecutor({ slug: 'dream-system-abc', category: 'memory-maintenance' }).id).toBe(
      'dream',
    );
  });

  it('resolves legacy research category', () => {
    expect(
      resolveExecutor({ slug: 'research-acquisition-1', category: 'proactive-research' }).id,
    ).toBe('legacy');
  });

  it('fails loudly on unknown category/executor', async () => {
    const result = await dispatchTask(
      {
        slug: 'totally-unknown-xyz',
        category: 'not-a-real-category',
        kind: 'nope',
        executor: null,
        intent: 'nothing',
      },
      {
        brainDir: tmpDir(),
        vaultDir: tmpDir(),
        skillsDir: tmpDir(),
        derivedDir: tmpDir(),
        sessionsDir: tmpDir(),
        queueDir: tmpDir(),
        conflictsDir: tmpDir(),
        instructionsFile: path.join(tmpDir(), 'INSTRUCTIONS.md'),
      },
    );
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/Unknown task executor/i);
  });

  it('custom executor with vault:write writes inbox draft', async () => {
    const brain = tmpDir();
    const inbox = path.join(brain, 'memory-inbox', 'pending');
    const result = await dispatchTask(
      {
        slug: 'custom-write-1',
        kind: 'custom',
        executor: 'custom',
        intent: 'Remember that agents can enqueue tasks',
        capabilities: ['vault:write'],
        result: { land: 'inbox' },
        origin: { agent: 'test' },
      },
      {
        brainDir: brain,
        vaultDir: path.join(brain, 'memory-vault'),
        skillsDir: path.join(brain, 'skills'),
        derivedDir: path.join(brain, 'derived'),
        sessionsDir: path.join(brain, 'sessions'),
        queueDir: path.join(brain, 'queue'),
        conflictsDir: path.join(brain, 'conflicts'),
        instructionsFile: path.join(brain, 'INSTRUCTIONS.md'),
      },
    );
    expect(result.success).toBe(true);
    expect(fs.existsSync(inbox)).toBe(true);
    const files = fs.readdirSync(inbox);
    expect(files.length).toBeGreaterThan(0);
    fs.rmSync(brain, { recursive: true, force: true });
  });
});
