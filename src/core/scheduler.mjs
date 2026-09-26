import fs from 'fs';
import path from 'path';
import matter from 'gray-matter';
import crypto from 'crypto';
import { atomicWrite, safeStringify } from './vault.mjs';
import config from './config.mjs';
import { getNodes } from './vault-cache.mjs';
import { logger } from './logger.mjs';
import { loadQueue, updateQueueItem } from './research-queue.mjs';

/**
 * Total Recall Task Scheduler
 *
 * A priority queue that dispatches tasks to cognitive layer engines.
 * The queue is NEVER empty — when explicit tasks run out, the scheduler
 * auto-generates idle improvement tasks from vault analysis.
 *
 * Task categories map to cognitive layers:
 *   conscious-enforcement  → Conscious Layer  (weight 1.0)
 *   system2-deliberation   → System 2 Layer   (weight 0.8)
 *   memory-maintenance     → Maintenance       (weight 0.6)
 *   research-acquisition   → Research Layer    (weight 0.4)
 */

// ─── Category Weights ───────────────────────────────────────────────────────────

export const LAYER_WEIGHTS = Object.freeze({
  'conscious-enforcement': 1.0,
  'system2-deliberation': 0.8,
  'cutoff-audit': 0.9,           // High weight — correctness beats most maintenance
  'memory-maintenance': 0.6,
  'research-acquisition': 0.4,
  'skill-engineering': 0.5,
  'proactive-research': 0.4,
  'self-evaluation': 0.3,
  'exploration': 0.2,
});

// ─── Priority Queue ─────────────────────────────────────────────────────────────

export class TaskQueue {
  constructor() {
    this._items = [];
  }

  get length() {
    return this._items.length;
  }

  /**
   * Enqueue a task. Effective priority = task.priority * layer weight.
   */
  enqueue(task) {
    const layerWeight = LAYER_WEIGHTS[task.category] || 0.5;
    const effectivePriority = (task.priority || 50) * layerWeight;
    this._items.push({ task, effectivePriority });
    this._items.sort((a, b) => b.effectivePriority - a.effectivePriority);
  }

  /**
   * Dequeue the highest-priority task.
   * Returns null if the queue is empty.
   */
  dequeue() {
    const item = this._items.shift();
    return item ? item.task : null;
  }

  /**
   * Peek at the top task without removing it.
   */
  peek() {
    return this._items.length > 0 ? this._items[0].task : null;
  }

  /**
   * Get all tasks (for inspection / status).
   */
  all() {
    return this._items.map((i) => i.task);
  }

  /**
   * Check if the queue has any tasks of a specific category.
   */
  hasCategory(category) {
    return this._items.some((i) => i.task.category === category);
  }
}

// ─── Task Loading from Disk ─────────────────────────────────────────────────────

/**
 * Load pending tasks from the scheduler queue directory.
 *
 * @param {string} queueDir  Path to .agent/skills/total-recall/scheduler/queue/
 * @returns {object[]} Array of task objects
 */
export function loadPendingTasks(queueDir) {
  if (!fs.existsSync(queueDir)) return [];

  const files = fs.readdirSync(queueDir).filter((f) => f.endsWith('.md'));
  const tasks = [];

  for (const file of files) {
    try {
      const raw = fs.readFileSync(path.join(queueDir, file), 'utf8');
      const { data, content } = matter(raw);
      if (data.status === 'pending' || data.status === 'in-progress') {
        tasks.push({
          ...data,
          slug: data.slug || path.basename(file, '.md'),
          body: content,
          _filepath: path.join(queueDir, file),
        });
      }
    } catch {
      // skip malformed
    }
  }

  return tasks;
}

/**
 * Update a task's status on disk.
 */
export function updateTaskStatus(task, newStatus, queueDir, lastError = null) {
  const filepath = task._filepath || path.join(queueDir, `${task.slug}.md`);
  if (!fs.existsSync(filepath)) return;

  const raw = fs.readFileSync(filepath, 'utf8');
  const { data, content } = matter(raw);
  data.status = newStatus;
  if (newStatus === 'completed') {
    data.completed_at = new Date().toISOString();
  }
  if (lastError) {
    data.last_error = lastError;
  }

  // Also update in-memory object properties so they stay in sync
  task.status = newStatus;
  if (newStatus === 'completed') {
    task.completed_at = data.completed_at;
  }

  // Strip undefined values — js-yaml (used by gray-matter) crashes on explicit undefined
  for (const key of Object.keys(data)) {
    if (data[key] === undefined) delete data[key];
  }

  atomicWrite(filepath, safeStringify(content, data));
}

/**
 * Persist a task (especially generated idle tasks) to disk as a pending markdown file.
 *
 * @param {object} task Task object
 * @param {string} queueDir Path to queue directory
 */
export function persistTaskToDisk(task, queueDir) {
  if (!fs.existsSync(queueDir)) {
    fs.mkdirSync(queueDir, { recursive: true });
  }
  const filepath = path.join(queueDir, `${task.slug}.md`);
  const { body, ...frontmatter } = task;

  // Ensure default fields
  if (frontmatter.progress === undefined) {
    frontmatter.progress = 0;
  }
  if (frontmatter.estimated_calls === undefined) {
    frontmatter.estimated_calls = 5;
  }
  if (frontmatter.deadline === undefined) {
    frontmatter.deadline = new Date(Date.now() + 86400000).toISOString().split('T')[0];
  }

  // Strip undefined values — js-yaml (used by gray-matter) crashes on explicit undefined
  for (const key of Object.keys(frontmatter)) {
    if (frontmatter[key] === undefined) delete frontmatter[key];
  }

  const raw = safeStringify(body || '', frontmatter);
  // ssss-raw-write: scheduler/queue task envelope, not a vault node.
  atomicWrite(filepath, raw);
  task._filepath = filepath;
  return filepath;
}

// ─── Research Pipeline ──────────────────────────────────────────────────────────

/** A failed research item is retried at most this many times, then stays failed. */
export const MAX_RESEARCH_ATTEMPTS = 3;

/**
 * The research pipeline. It ends at improvement: there is deliberately no
 * monitoring or expansion phase, because research must never spawn research.
 */
export const RESEARCH_PHASES = Object.freeze({
  acquisition: {
    step: 1, label: 'Acquisition', category: 'proactive-research',
    body: (i) => `Run knowledge acquisition cycle for queued topic: ${i.topic}.\nNotes: ${i.notes || 'None'}`,
  },
  deliberation: {
    step: 2, label: 'Deliberation', category: 'system2-deliberation',
    body: (i) => `Run deep System 2 cognitive deliberation for topic: ${i.topic}.\nTarget node: ${i.node_slug || 'pending'}`,
  },
  improvement: {
    step: 3, label: 'Improvement', category: 'memory-maintenance',
    body: (i) => `Run document improvement and formatting refinement for topic: ${i.topic}.\nTarget node: ${i.node_slug || 'pending'}`,
  },
});
const RESEARCH_PHASE_COUNT = Object.keys(RESEARCH_PHASES).length;

// ─── Idle Task Generation ───────────────────────────────────────────────────────

let _idleCycleCounter = 0;

/**
 * Generate an idle improvement task when the explicit queue is empty.
 * Purely local maintenance, round-robin: inference, post-mortem, clarity
 * review, memory compaction. Idle ticks never research on their own; research
 * only runs for topics a human asked for or the project gate approved.
 */
export function generateIdleTask({ vaultDir, sessionsDir }) {
  // Only allow purely local task generation strategies.
  // Absolutely no automated/proactive web searches or staleness checks that make internet queries.
  const cleanStrategies = [
    () => generateInferenceTask(vaultDir),
    () => generatePostMortemTask(sessionsDir),
    () => generateClarityReviewTask(vaultDir),
    () => generateMemoryCompactionTask(vaultDir),
  ];

  const strategy = cleanStrategies[_idleCycleCounter % cleanStrategies.length];
  _idleCycleCounter++;

  try {
    return strategy();
  } catch {
    // Local fallback only — never query the internet or make automated web searches
    return makeFallbackTask('memory-maintenance', 'Wait for active conversation task');
  }
}

/**
 * Pick a random active memory node and create a clarity review task.
 */
function generateClarityReviewTask(vaultDir) {
  const nodes = getNodes(vaultDir).filter((n) => n.status === 'active');
  if (nodes.length === 0) {
    return makeFallbackTask('memory-maintenance', 'No active nodes to review');
  }
  const target = nodes[Math.floor(Math.random() * nodes.length)];
  return {
    type: 'task',
    slug: `clarity-review-${crypto.createHash('md5').update(target.slug).digest('hex').slice(0, 8)}`,
    priority: 30,
    category: 'memory-maintenance',
    target: target.slug,
    status: 'pending',
    created_by: 'scheduler-idle',
    reason: `Idle task: selected active node ${target.slug} for clarity review.`,
    body: `Analyze node ${target.slug} for clarity, deduplication, formatting, and structural integrity. Rewrite via SSSS strict compliance if needed.`,
  };
}

/**
 * Generate a memory compaction task to fuse highly overlapping fragmented nodes.
 */
function generateMemoryCompactionTask(vaultDir) {
  return {
    type: 'task',
    slug: `memory-compaction-${new Date().toISOString().slice(0, 10)}`,
    priority: 35,
    category: 'memory-maintenance',
    target: 'global',
    status: 'pending',
    created_by: 'scheduler-idle',
    reason: `Idle task: scan vault for fragmented nodes to merge into comprehensive master documents.`,
    body: `Scan for highly overlapping or fragmented memory nodes and fuse them into comprehensive master nodes, archiving the fragments.`,
  };
}

/**
 * Pick a cluster of related nodes and create an inference task.
 */
function generateInferenceTask(vaultDir) {
  const nodes = getNodes(vaultDir).filter((n) => n.status === 'active');
  if (nodes.length < 3) {
    return makeFallbackTask('system2-deliberation', 'Not enough nodes for inference');
  }

  // Find nodes that share tags
  const tagMap = new Map();
  for (const node of nodes) {
    for (const tag of (node.tags || [])) {
      if (!tagMap.has(tag)) tagMap.set(tag, []);
      tagMap.get(tag).push(node);
    }
  }

  // Find the largest cluster
  let bestTag = null;
  let bestCluster = [];
  for (const [tag, cluster] of tagMap.entries()) {
    if (cluster.length > bestCluster.length && cluster.length >= 2) {
      bestTag = tag;
      bestCluster = cluster;
    }
  }

  if (bestCluster.length < 2) {
    return makeFallbackTask('system2-deliberation', 'No tag clusters found for inference');
  }

  const selected = bestCluster.slice(0, 5); // max 5 nodes per inference task
  return {
    type: 'task',
    slug: `inference-${bestTag}-${Date.now().toString(36)}`,
    priority: 35,
    category: 'system2-deliberation',
    target: selected.map((n) => n.slug).join(','),
    status: 'pending',
    created_by: 'scheduler-idle',
    reason: `Idle task: draw conclusions from ${selected.length} nodes tagged "${bestTag}".`,
    body: `## Objective\nAnalyze these related memory nodes and determine:\n1. What higher-level conclusions can be drawn?\n2. Are there implicit patterns that should be explicit rules?\n3. Do any subtly contradict each other?\n\n## Nodes\n${selected.map((n) => `- ${n.slug}: "${n.title}"`).join('\n')}`,
  };
}

/**
 * Pick the most recent unprocessed session for post-mortem analysis.
 */
function generatePostMortemTask(sessionsDir) {
  if (!fs.existsSync(sessionsDir)) {
    return makeFallbackTask('conscious-enforcement', 'No sessions directory');
  }

  const files = fs.readdirSync(sessionsDir)
    .filter((f) => f.endsWith('.jsonl'))
    .map((f) => ({
      name: f,
      mtime: fs.statSync(path.join(sessionsDir, f)).mtimeMs,
    }))
    .sort((a, b) => b.mtime - a.mtime); // newest first

  if (files.length === 0) {
    return makeFallbackTask('conscious-enforcement', 'No sessions to analyze');
  }

  // Pick the newest session
  const target = files[0];
  return {
    type: 'task',
    slug: `post-mortem-${path.basename(target.name, '.jsonl')}-${Date.now().toString(36)}`,
    priority: 40,
    category: 'conscious-enforcement',
    target: target.name,
    status: 'pending',
    created_by: 'scheduler-idle',
    reason: `Idle task: post-mortem analysis of session ${target.name}.`,
    body: `## Objective\nRead the session transcript and extract:\n1. New patterns observed (user preferences, coding style)\n2. New facts mentioned (APIs, tools, versions)\n3. Skill gaps (agent struggled with topic X)\n4. Rule violations (did the agent follow all invariants?)\n\nFor each extraction, produce a draft memory node with appropriate x_memory_layer.`,
  };
}

/**
 * Generate a cutoff audit task — scans vault for nodes with intrinsic LLM
 * knowledge that may have drifted since the model's training cutoff.
 */
function generateCutoffAuditTask() {
  return {
    type: 'task',
    slug: `cutoff-audit-${Date.now().toString(36)}`,
    priority: 60,
    category: 'cutoff-audit',
    status: 'pending',
    created_by: 'scheduler-idle',
    reason: 'Idle task: scan vault for training-cutoff assumption drift',
    body: 'Identify memory nodes containing time-sensitive claims based on intrinsic LLM knowledge. Flag high-drift items (API versions, pricing, model specs, framework changes) for verification against current real-world sources.',
  };
}

function makeFallbackTask(category, reason) {
  return {
    type: 'task',
    slug: `idle-${category}-${Date.now().toString(36)}`,
    priority: 10,
    category,
    status: 'pending',
    created_by: 'scheduler-idle',
    reason: `Fallback idle task: ${reason}`,
    body: 'No actionable work found. Waiting for new tasks.',
  };
}

// ─── Scheduler State ────────────────────────────────────────────────────────────

/**
 * Create a populated scheduler from disk.
 *
 * @param {object} opts
 * @param {string} opts.queueDir     Path to .agent/skills/total-recall/scheduler/queue/
 * @param {string} opts.vaultDir     Path to .agent/skills/total-recall/memory-vault/
 * @param {string} opts.sessionsDir  Path to .agent/skills/total-recall/sessions/
 * @returns {{ queue: TaskQueue, stats: object }}
 */
export function createScheduler({ queueDir, vaultDir, sessionsDir }) {
  const queue = new TaskQueue();

  // Load explicit tasks from disk
  const diskTasks = loadPendingTasks(queueDir);
  for (const task of diskTasks) {
    queue.enqueue(task);
  }

  // Optional remote vault sync job (env-configured only)
  try {
    const { remoteVaultSync } = config;
    if (remoteVaultSync.enabled) {
      const statusFile = path.join(path.dirname(remoteVaultSync.vaultDir), 'sync-status.json');
      let lastRunMs = 0;
      if (fs.existsSync(statusFile)) {
        try {
          const status = JSON.parse(fs.readFileSync(statusFile, 'utf8'));
          lastRunMs = new Date(status.lastRunAt || 0).getTime();
        } catch {}
      }

      const SYNC_COOLDOWN_MS = remoteVaultSync.intervalMinutes * 60000;
      if (Date.now() - lastRunMs >= SYNC_COOLDOWN_MS) {
        queue.enqueue({
          type: 'task',
          slug: `remote-vault-sync-${Date.now().toString(36)}`,
          priority: 90,
          category: 'memory-maintenance',
          status: 'pending',
          created_by: 'scheduler',
          reason: 'Scheduled remote vault sync.',
          body: 'Run remote vault content synchronization.',
          _is_remote_vault_sync: true,
        });
      }
    }
  } catch (err) {
    logger.error({
      subsystem: 'scheduler',
      message: `Failed to load remote vault sync: ${err.message}`,
    });
  }

  // Load pending research queue tasks.
  //
  // Research ends when it is answered: acquisition → deliberation → improvement →
  // done. Nothing here re-opens finished work. (A `done` item used to be reset to
  // a monitoring pass every hour, forever, and the expansion phase spawned three
  // new topics per finished one — see docs/projects/.../RESEARCH_SYSTEM2_AUDIT.md.)
  // Failed items retry after a cooldown, at most MAX_RESEARCH_ATTEMPTS times.
  try {
    const COOLDOWN_MS = process.env.RESEARCH_COOLDOWN_MS
      ? parseInt(process.env.RESEARCH_COOLDOWN_MS, 10)
      : 60 * 60 * 1000; // 1 hour default

    let resetCount = 0;
    for (const item of loadQueue()) {
      if (item.status !== 'failed') continue;
      if ((item.attempts || 0) >= MAX_RESEARCH_ATTEMPTS) continue;
      const failedAt = new Date(item.updated_at || item.created_at || 0).getTime();
      if (Date.now() - failedAt < COOLDOWN_MS) continue;
      try {
        updateQueueItem(item.id, {
          status: 'pending',
          research_phase: item.node_slug ? (item.research_phase || 'acquisition') : 'acquisition',
          attempts: (item.attempts || 0) + 1,
        });
        resetCount++;
      } catch (updateErr) {
        logger.error({
          subsystem: 'scheduler',
          message: `Failed to retry research queue item ${item.id}: ${updateErr.message}`,
        });
      }
    }
    if (resetCount > 0) {
      logger.info({
        subsystem: 'scheduler',
        message: `Retrying ${resetCount} failed research items (max ${MAX_RESEARCH_ATTEMPTS} attempts each).`,
      });
    }

    // User requests run before autonomous background research; oldest first within each.
    const researchItems = loadQueue()
      .filter((i) => i.status === 'pending' && RESEARCH_PHASES[i.research_phase || 'acquisition'])
      .sort((a, b) => {
        const ua = a.origin === 'autonomous' ? 1 : 0;
        const ub = b.origin === 'autonomous' ? 1 : 0;
        if (ua !== ub) return ua - ub;
        return new Date(a.updated_at || a.created_at || 0).getTime() - new Date(b.updated_at || b.created_at || 0).getTime();
      });

    for (let idx = 0; idx < researchItems.length; idx++) {
      const item = researchItems[idx];
      const phase = item.research_phase || 'acquisition';
      const spec = RESEARCH_PHASES[phase];

      queue.enqueue({
        type: 'task',
        slug: `research-${phase}-${item.id}`,
        priority: 85 + (researchItems.length - idx),
        category: spec.category,
        target: item.topic,
        status: 'pending',
        created_by: 'research-queue',
        reason: `Queued research project (Phase ${spec.step}/${RESEARCH_PHASE_COUNT}: ${spec.label}): ${item.topic}`,
        body: spec.body(item),
        _research_id: item.id,
        _research_phase: phase,
        _node_slug: item.node_slug,
      });
    }
    if (researchItems.length > 0) {
      logger.info({
        subsystem: 'scheduler',
        message: `Enqueued ${researchItems.length} pending research tasks from the dynamic queue.`,
      });
    }
  } catch (err) {
    logger.error({
      subsystem: 'scheduler',
      message: `Failed to load research queue items into scheduler: ${err.message}`,
    });
  }

  logger.info({
    subsystem: 'scheduler',
    message: `Initialized with ${diskTasks.length} explicit tasks from queue.`,
  });

  return {
    queue,
    stats: {
      explicitTasks: diskTasks.length,
      categories: Object.fromEntries(
        [...new Set(diskTasks.map((t) => t.category))].map((cat) => [
          cat,
          diskTasks.filter((t) => t.category === cat).length,
        ]),
      ),
    },

    /**
     * Get the next task.
     *
     * Default: only explicit (and research-queue) tasks — never invent work.
     * Idle generation requires TR_IDLE_TASKS=1 or opts.allowIdle === true.
     *
     * @param {{ allowIdle?: boolean }} [opts]
     * @returns {{ task: object|null, source: 'explicit'|'idle'|'empty' }}
     */
    next(opts = {}) {
      const explicit = queue.dequeue();
      if (explicit) return { task: explicit, source: 'explicit' };

      const allowIdle =
        opts.allowIdle === true ||
        process.env.TR_IDLE_TASKS === '1' ||
        process.env.TR_IDLE_TASKS === 'true';

      if (!allowIdle) {
        return { task: null, source: 'empty' };
      }

      const idle = generateIdleTask({ vaultDir, sessionsDir });
      persistTaskToDisk(idle, queueDir);
      return { task: idle, source: 'idle' };
    },
  };
}
