import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

vi.mock('./logger.mjs', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));
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
  MAX_RESEARCH_ATTEMPTS,
} from './scheduler.mjs';
import { saveQueue, loadQueue } from './research-queue.mjs';

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
  let queueDir, vaultDir, sessionsDir, tempAgentDir;
  let originalAgentDir;

  beforeEach(() => {
    queueDir = tmpDir();
    vaultDir = tmpDir();
    sessionsDir = tmpDir();
    tempAgentDir = tmpDir();
    originalAgentDir = process.env.AGENT_DIR;
    process.env.AGENT_DIR = tempAgentDir;
    // research-queue.mjs uses _TR_TEST_AGENT_DIR to resolve brainDir in tests
    process.env._TR_TEST_AGENT_DIR = path.join(tempAgentDir, 'skills', 'total-recall');

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
    process.env.AGENT_DIR = originalAgentDir;
    delete process.env._TR_TEST_AGENT_DIR;
    fs.rmSync(queueDir, { recursive: true, force: true });
    fs.rmSync(vaultDir, { recursive: true, force: true });
    fs.rmSync(sessionsDir, { recursive: true, force: true });
    fs.rmSync(tempAgentDir, { recursive: true, force: true });
  });

  it('loads explicit tasks and serves them first', () => {
    writeTask(queueDir, 'urgent', { priority: 90, category: 'conscious-enforcement' });

    const sched = createScheduler({ queueDir, vaultDir, sessionsDir });
    expect(sched.stats.explicitTasks).toBe(1);

    const { task, source } = sched.next();
    expect(source).toBe('explicit');
    expect(task.slug).toBe('urgent');
  });

  it('returns empty when queue is empty (idle fill off by default)', () => {
    const prev = process.env.TR_IDLE_TASKS;
    delete process.env.TR_IDLE_TASKS;
    const sched = createScheduler({ queueDir, vaultDir, sessionsDir });
    expect(sched.stats.explicitTasks).toBe(0);

    const { task, source } = sched.next();
    expect(source).toBe('empty');
    expect(task).toBeNull();
    if (prev !== undefined) process.env.TR_IDLE_TASKS = prev;
  });

  it('falls back to idle tasks when TR_IDLE_TASKS=1', () => {
    const prev = process.env.TR_IDLE_TASKS;
    process.env.TR_IDLE_TASKS = '1';
    const sched = createScheduler({ queueDir, vaultDir, sessionsDir });
    const { task, source } = sched.next();
    expect(source).toBe('idle');
    expect(task.type).toBe('task');
    expect(task.created_by).toContain('scheduler');
    if (prev === undefined) delete process.env.TR_IDLE_TASKS;
    else process.env.TR_IDLE_TASKS = prev;
  });

  it('returns null from next() when empty without idle', () => {
    delete process.env.TR_IDLE_TASKS;
    const sched = createScheduler({ queueDir, vaultDir, sessionsDir });
    for (let i = 0; i < 5; i++) {
      const { task, source } = sched.next();
      expect(task).toBeNull();
      expect(source).toBe('empty');
    }
  });
});

describe('createScheduler - Continuous Research Mode', () => {
  let queueDir, vaultDir, sessionsDir, tempAgentDir;
  let originalAgentDir;

  beforeEach(() => {
    queueDir = tmpDir();
    vaultDir = tmpDir();
    sessionsDir = tmpDir();
    tempAgentDir = tmpDir();
    originalAgentDir = process.env.AGENT_DIR;
    process.env.AGENT_DIR = tempAgentDir;
    process.env._TR_TEST_AGENT_DIR = path.join(tempAgentDir, 'skills', 'total-recall');
  });

  afterEach(() => {
    process.env.AGENT_DIR = originalAgentDir;
    delete process.env._TR_TEST_AGENT_DIR;
    fs.rmSync(queueDir, { recursive: true, force: true });
    fs.rmSync(vaultDir, { recursive: true, force: true });
    fs.rmSync(sessionsDir, { recursive: true, force: true });
    fs.rmSync(tempAgentDir, { recursive: true, force: true });
  });

  it('retries failed research after the cooldown but never re-opens finished research', () => {
    const now = Date.now();
    const oneHour = 60 * 60 * 1000;

    const items = [
      {
        id: '1',
        topic: 'Topic A',
        status: 'done',
        priority: 'medium',
        completed_at: new Date(now - oneHour - 1000).toISOString(),
        updated_at: new Date(now - oneHour - 1000).toISOString()
      },
      {
        id: '2',
        topic: 'Topic B',
        status: 'failed',
        priority: 'high',
        completed_at: new Date(now - oneHour - 5000).toISOString(),
        updated_at: new Date(now - oneHour - 5000).toISOString()
      },
      {
        id: '3',
        topic: 'Topic C',
        status: 'done',
        priority: 'low',
        completed_at: new Date(now - 10000).toISOString(), // recently done
        updated_at: new Date(now - 10000).toISOString()
      }
    ];

    saveQueue(items);

    // Run scheduler
    createScheduler({ queueDir, vaultDir, sessionsDir });
    
    // Check queue
    const updatedItems = loadQueue();
    const topicA = updatedItems.find(i => i.id === '1');
    const topicB = updatedItems.find(i => i.id === '2');
    const topicC = updatedItems.find(i => i.id === '3');

    // Finished research is never re-opened (it used to be reset to a monitoring
    // pass every hour, forever). Only the failed item retries after the cooldown.
    expect(topicA.status).toBe('done');
    expect(topicA.completed_at).toBeTruthy();
    expect(topicB.status).toBe('pending');
    expect(topicB.completed_at).toBeNull();
    expect(topicB.attempts).toBe(1);

    // Topic C should remain done
    expect(topicC.status).toBe('done');
    expect(topicC.completed_at).toBeTruthy();
  });

  it('supports custom cooldown via environment variable', () => {
    process.env.RESEARCH_COOLDOWN_MS = '10000'; // 10 seconds custom cooldown
    const now = Date.now();

    const items = [
      {
        id: '1',
        topic: 'Topic A',
        status: 'failed',
        priority: 'medium',
        completed_at: new Date(now - 15000).toISOString(),
        updated_at: new Date(now - 15000).toISOString()
      },
      {
        id: '2',
        topic: 'Topic B',
        status: 'failed',
        priority: 'medium',
        completed_at: new Date(now - 5000).toISOString(),
        updated_at: new Date(now - 5000).toISOString()
      }
    ];

    saveQueue(items);

    try {
      createScheduler({ queueDir, vaultDir, sessionsDir });
      
      const updatedItems = loadQueue();
      const topicA = updatedItems.find(i => i.id === '1');
      const topicB = updatedItems.find(i => i.id === '2');

      expect(topicA.status).toBe('pending');
      expect(topicB.status).toBe('failed');
    } finally {
      delete process.env.RESEARCH_COOLDOWN_MS;
    }
  });

  it('sorts pending items oldest-first and applies dynamic priority boosts so the oldest runs first', () => {
    const now = Date.now();
    const items = [
      {
        id: 'newest',
        topic: 'Newest Topic',
        status: 'pending',
        priority: 'medium',
        updated_at: new Date(now - 1000).toISOString(),
        created_at: new Date(now - 1000).toISOString()
      },
      {
        id: 'oldest',
        topic: 'Oldest Topic',
        status: 'pending',
        priority: 'medium',
        updated_at: new Date(now - 10000).toISOString(),
        created_at: new Date(now - 10000).toISOString()
      },
      {
        id: 'middle',
        topic: 'Middle Topic',
        status: 'pending',
        priority: 'medium',
        updated_at: new Date(now - 5000).toISOString(),
        created_at: new Date(now - 5000).toISOString()
      }
    ];

    saveQueue(items);

    const sched = createScheduler({ queueDir, vaultDir, sessionsDir });
    
    // The scheduler next task should dequeue the oldest item first
    const firstTask = sched.next().task;
    expect(firstTask.slug).toBe('research-acquisition-oldest');
    expect(firstTask.priority).toBe(88); // 85 + (3 - 0)

    const secondTask = sched.next().task;
    expect(secondTask.slug).toBe('research-acquisition-middle');
    expect(secondTask.priority).toBe(87); // 85 + (3 - 1)

    const thirdTask = sched.next().task;
    expect(thirdTask.slug).toBe('research-acquisition-newest');
    expect(thirdTask.priority).toBe(86); // 85 + (3 - 2)
  });

  it('correctly enqueues tasks based on their research phase', () => {
    const items = [
      {
        id: 'delib',
        topic: 'Topic Delib',
        status: 'pending',
        priority: 'medium',
        research_phase: 'deliberation',
        created_at: new Date().toISOString()
      },
      {
        id: 'improve',
        topic: 'Topic Improve',
        status: 'pending',
        priority: 'medium',
        research_phase: 'improvement',
        created_at: new Date().toISOString()
      },
      {
        id: 'monitor',
        topic: 'Topic Monitor',
        status: 'pending',
        priority: 'medium',
        research_phase: 'monitoring',
        created_at: new Date().toISOString()
      },
      {
        id: 'expand',
        topic: 'Topic Expand',
        status: 'pending',
        priority: 'medium',
        research_phase: 'expansion',
        created_at: new Date().toISOString()
      },
      {
        id: 'finished',
        topic: 'Topic Finished',
        status: 'done',
        node_slug: 'report-x',
        priority: 'medium',
        research_phase: 'improvement',
        created_at: new Date(Date.now() - 86400000).toISOString(),
        updated_at: new Date(Date.now() - 86400000).toISOString(),
        completed_at: new Date(Date.now() - 86400000).toISOString(),
      }
    ];

    saveQueue(items);

    const sched = createScheduler({ queueDir, vaultDir, sessionsDir });
    
    const allTasks = sched.queue.all();
    
    const delibTask = allTasks.find(t => t.slug === 'research-deliberation-delib');
    expect(delibTask).toBeTruthy();
    expect(delibTask.category).toBe('system2-deliberation');

    const improveTask = allTasks.find(t => t.slug === 'research-improvement-improve');
    expect(improveTask).toBeTruthy();
    expect(improveTask.category).toBe('memory-maintenance');

    // The removed monitoring/expansion phases are never scheduled, and finished
    // research is never re-opened (RESEARCH_SYSTEM2).
    expect(allTasks.some(t => /research-(monitoring|expansion)-/.test(t.slug))).toBe(false);
    expect(allTasks.some(t => t._research_id === 'finished')).toBe(false);
    expect(loadQueue().find(i => i.id === 'finished').status).toBe('done');
  });

  it('retries a failed item at most MAX_RESEARCH_ATTEMPTS times', () => {
    const old = new Date(Date.now() - 2 * 3600 * 1000).toISOString();
    saveQueue([
      { id: 'retry', topic: 'Retry me', status: 'failed', attempts: 1, research_phase: 'acquisition', created_at: old, updated_at: old },
      { id: 'spent', topic: 'Spent', status: 'failed', attempts: MAX_RESEARCH_ATTEMPTS, research_phase: 'acquisition', created_at: old, updated_at: old },
    ]);
    createScheduler({ queueDir, vaultDir, sessionsDir });
    const q = loadQueue();
    expect(q.find(i => i.id === 'retry')).toMatchObject({ status: 'pending', attempts: 2 });
    expect(q.find(i => i.id === 'spent').status).toBe('failed');
  });

  it('runs user-requested research before autonomous research', () => {
    const t = (m) => new Date(Date.now() - m * 60000).toISOString();
    saveQueue([
      { id: 'auto-old', topic: 'Auto old', status: 'pending', origin: 'autonomous', research_phase: 'acquisition', created_at: t(60), updated_at: t(60) },
      { id: 'user-new', topic: 'User new', status: 'pending', origin: 'user', research_phase: 'acquisition', created_at: t(1), updated_at: t(1) },
    ]);
    const sched = createScheduler({ queueDir, vaultDir, sessionsDir });
    expect(sched.next().task._research_id).toBe('user-new');
    expect(sched.next().task._research_id).toBe('auto-old');
  });
});

