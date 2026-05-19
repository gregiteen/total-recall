import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import matter from 'gray-matter';
import {
  TaskQueue,
  LAYER_WEIGHTS,
  loadPendingTasks,
  updateTaskStatus,
  generateIdleTask,
  createScheduler,
} from './scheduler.mjs';

function tmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'tr-sched-'));
}

function writeTask(dir, slug, overrides = {}) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const data = {
    type: 'task',
    slug,
    priority: 50,
    category: 'memory-maintenance',
    status: 'pending',
    created_by: 'test',
    ...overrides,
  };
  const raw = matter.stringify('Test task body', data);
  fs.writeFileSync(path.join(dir, `${slug}.md`), raw);
}

// ─── TaskQueue ──────────────────────────────────────────────────────────────────

describe('TaskQueue', () => {
  it('enqueues and dequeues by effective priority', () => {
    const q = new TaskQueue();
    q.enqueue({ slug: 'low', priority: 10, category: 'exploration' });
    q.enqueue({ slug: 'high', priority: 90, category: 'conscious-enforcement' });
    q.enqueue({ slug: 'mid', priority: 50, category: 'memory-maintenance' });

    const first = q.dequeue();
    expect(first.slug).toBe('high'); // 90 * 1.0 = 90
    const second = q.dequeue();
    expect(second.slug).toBe('mid'); // 50 * 0.6 = 30
    const third = q.dequeue();
    expect(third.slug).toBe('low'); // 10 * 0.2 = 2
  });

  it('returns null when empty', () => {
    const q = new TaskQueue();
    expect(q.dequeue()).toBeNull();
  });

  it('reports length correctly', () => {
    const q = new TaskQueue();
    expect(q.length).toBe(0);
    q.enqueue({ slug: 'a', priority: 50, category: 'memory-maintenance' });
    expect(q.length).toBe(1);
    q.dequeue();
    expect(q.length).toBe(0);
  });

  it('peek returns top item without removing', () => {
    const q = new TaskQueue();
    q.enqueue({ slug: 'a', priority: 50, category: 'memory-maintenance' });
    expect(q.peek().slug).toBe('a');
    expect(q.length).toBe(1); // not removed
  });

  it('hasCategory checks for presence', () => {
    const q = new TaskQueue();
    q.enqueue({ slug: 'a', priority: 50, category: 'conscious-enforcement' });
    expect(q.hasCategory('conscious-enforcement')).toBe(true);
    expect(q.hasCategory('research-acquisition')).toBe(false);
  });

  it('layer weights affect ordering', () => {
    const q = new TaskQueue();
    // Same raw priority but different categories
    q.enqueue({ slug: 'research', priority: 50, category: 'research-acquisition' });
    q.enqueue({ slug: 'enforce', priority: 50, category: 'conscious-enforcement' });

    const first = q.dequeue();
    expect(first.slug).toBe('enforce'); // 50 * 1.0 = 50 > 50 * 0.4 = 20
  });
});

// ─── Disk Loading ───────────────────────────────────────────────────────────────

describe('loadPendingTasks', () => {
  let dir;
  beforeEach(() => { dir = tmpDir(); });
  afterEach(() => { fs.rmSync(dir, { recursive: true, force: true }); });

  it('loads pending tasks from .md files', () => {
    writeTask(dir, 'task-a', { priority: 80, category: 'conscious-enforcement' });
    writeTask(dir, 'task-b', { priority: 30, category: 'research-acquisition' });

    const tasks = loadPendingTasks(dir);
    expect(tasks).toHaveLength(2);
    expect(tasks.find((t) => t.slug === 'task-a').priority).toBe(80);
  });

  it('skips completed tasks', () => {
    writeTask(dir, 'done', { status: 'completed' });
    writeTask(dir, 'open', { status: 'pending' });

    const tasks = loadPendingTasks(dir);
    expect(tasks).toHaveLength(1);
    expect(tasks[0].slug).toBe('open');
  });

  it('returns empty array for nonexistent directory', () => {
    expect(loadPendingTasks('/nonexistent/path')).toEqual([]);
  });
});

describe('updateTaskStatus', () => {
  let dir;
  beforeEach(() => { dir = tmpDir(); });
  afterEach(() => { fs.rmSync(dir, { recursive: true, force: true }); });

  it('updates status on disk', () => {
    writeTask(dir, 'my-task');
    const tasks = loadPendingTasks(dir);
    updateTaskStatus(tasks[0], 'completed', dir);

    const raw = fs.readFileSync(path.join(dir, 'my-task.md'), 'utf8');
    const { data } = matter(raw);
    expect(data.status).toBe('completed');
    expect(data.completed_at).toBeTruthy();
  });
});

// ─── Idle Task Generation ───────────────────────────────────────────────────────

describe('generateIdleTask', () => {
  let vaultDir, sessionsDir;

  beforeEach(() => {
    vaultDir = tmpDir();
    sessionsDir = tmpDir();

    // Create a minimal vault with a few nodes
    const patternsDir = path.join(vaultDir, 'patterns');
    fs.mkdirSync(patternsDir, { recursive: true });

    const node = {
      type: 'memory',
      slug: 'test-node',
      category: 'patterns',
      title: 'Test Node',
      status: 'active',
      confidence: 0.9,
      importance: 4,
      tags: ['test', 'example'],
      modality: 'must',
      subject: 'agent',
      predicate: 'test',
      object: 'code',
      schema_version: 2,
      decay: { half_life_days: 180, access_count: 1 },
      source: { type: 'test', session_id: 's1', evidence_count: 1 },
      sentiment_polarity: 'directive_must',
    };
    fs.writeFileSync(
      path.join(patternsDir, 'test-node.md'),
      matter.stringify('Test body.', node),
    );
  });

  afterEach(() => {
    fs.rmSync(vaultDir, { recursive: true, force: true });
    fs.rmSync(sessionsDir, { recursive: true, force: true });
  });

  it('always generates a task (never null)', () => {
    for (let i = 0; i < 8; i++) {
      const task = generateIdleTask({ vaultDir, sessionsDir });
      expect(task).toBeTruthy();
      expect(task.type).toBe('task');
      expect(task.status).toBe('pending');
      expect(task.category).toBeTruthy();
      expect(task.slug).toBeTruthy();
    }
  });

  it('round-robins through different categories', () => {
    const categories = new Set();
    for (let i = 0; i < 4; i++) {
      const task = generateIdleTask({ vaultDir, sessionsDir });
      categories.add(task.category);
    }
    // Should have hit at least 2 different categories
    expect(categories.size).toBeGreaterThanOrEqual(2);
  });

  it('generates post-mortem tasks when sessions exist', () => {
    // Write a fake session
    fs.writeFileSync(
      path.join(sessionsDir, 'test-session.jsonl'),
      '{"id":"1","type":"task","content":"test"}\n',
    );

    // Run until we hit a post-mortem task
    let found = false;
    for (let i = 0; i < 8; i++) {
      const task = generateIdleTask({ vaultDir, sessionsDir });
      if (task.category === 'conscious-enforcement' && task.slug.includes('post-mortem')) {
        found = true;
        expect(task.target).toBe('test-session.jsonl');
        break;
      }
    }
    expect(found).toBe(true);
  });
});

// ─── createScheduler ────────────────────────────────────────────────────────────

describe('createScheduler', () => {
  let queueDir, vaultDir, sessionsDir;

  beforeEach(() => {
    queueDir = tmpDir();
    vaultDir = tmpDir();
    sessionsDir = tmpDir();

    // Create vault with nodes
    const dir = path.join(vaultDir, 'patterns');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(
      path.join(dir, 'example.md'),
      matter.stringify('Body.', {
        type: 'memory', slug: 'example', category: 'patterns',
        title: 'Example', status: 'active', confidence: 0.9,
        importance: 4, tags: ['test'], modality: 'must',
        subject: 'agent', predicate: 'test', object: 'code',
        schema_version: 2, decay: { half_life_days: 180, access_count: 1 },
        source: { type: 'test', session_id: 's', evidence_count: 1 },
        sentiment_polarity: 'directive_must',
      }),
    );
  });

  afterEach(() => {
    fs.rmSync(queueDir, { recursive: true, force: true });
    fs.rmSync(vaultDir, { recursive: true, force: true });
    fs.rmSync(sessionsDir, { recursive: true, force: true });
  });

  it('loads explicit tasks and serves them first', () => {
    writeTask(queueDir, 'urgent', { priority: 90, category: 'conscious-enforcement' });

    const sched = createScheduler({ queueDir, vaultDir, sessionsDir });
    expect(sched.stats.explicitTasks).toBe(1);

    const { task, source } = sched.next();
    expect(source).toBe('explicit');
    expect(task.slug).toBe('urgent');
  });

  it('falls back to idle tasks when queue is empty', () => {
    const sched = createScheduler({ queueDir, vaultDir, sessionsDir });
    expect(sched.stats.explicitTasks).toBe(0);

    const { task, source } = sched.next();
    expect(source).toBe('idle');
    expect(task.type).toBe('task');
    expect(task.created_by).toContain('scheduler');
  });

  it('never returns null from next()', () => {
    const sched = createScheduler({ queueDir, vaultDir, sessionsDir });
    for (let i = 0; i < 10; i++) {
      const { task } = sched.next();
      expect(task).toBeTruthy();
    }
  });
});
