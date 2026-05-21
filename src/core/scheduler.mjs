import fs from 'fs';
import path from 'path';
import matter from 'gray-matter';
import crypto from 'crypto';
import { loadNodes, atomicWrite, safeStringify } from './vault.mjs';
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
 * @param {string} queueDir  Path to .agent/scheduler/queue/
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
export function updateTaskStatus(task, newStatus, queueDir) {
  const filepath = task._filepath || path.join(queueDir, `${task.slug}.md`);
  if (!fs.existsSync(filepath)) return;

  const raw = fs.readFileSync(filepath, 'utf8');
  const { data, content } = matter(raw);
  data.status = newStatus;
  if (newStatus === 'completed') {
    data.completed_at = new Date().toISOString();
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
  atomicWrite(filepath, raw);
  task._filepath = filepath;
  return filepath;
}

// ─── Idle Task Generation ───────────────────────────────────────────────────────

let _idleCycleCounter = 0;

/**
 * Generate an idle improvement task when the explicit queue is empty.
 * Weighted toward proactive research — 3 of every 9 ticks do real web search.
 *
 * Cycle (9 ticks):
 *   0: proactive-research   — web search + synthesize from agenda
 *   1: inference            — draw System 2 conclusions from vault clusters
 *   2: proactive-research   — web search (second topic)
 *   3: staleness-check      — flag outdated facts
 *   4: proactive-research   — web search (third topic)
 *   5: inference            — draw more conclusions
 *   6: post-mortem          — re-analyze most recent session
 *   7: clarity-review       — improve a vault node
 *   8: cutoff-audit         — check for training-drift
 */
export function generateIdleTask({ vaultDir, sessionsDir }) {
  const strategies = [
    () => generateProactiveResearchTask(),      // 0
    () => generateInferenceTask(vaultDir),      // 1
    () => generateProactiveResearchTask(),      // 2
    () => generateStalenessCheckTask(vaultDir), // 3
    () => generateProactiveResearchTask(),      // 4
    () => generateInferenceTask(vaultDir),      // 5
    () => generatePostMortemTask(sessionsDir),  // 6
    () => generateClarityReviewTask(vaultDir),  // 7
    () => generateCutoffAuditTask(),            // 8
  ];

  const strategy = strategies[_idleCycleCounter % strategies.length];
  _idleCycleCounter++;

  try {
    return strategy();
  } catch {
    // Fallback: always return a research task — never go idle doing nothing
    return generateProactiveResearchTask();
  }
}

/**
 * Generate a proactive research task — pulls the next topic from the agenda
 * and queues a full web search + synthesis cycle.
 */
function generateProactiveResearchTask() {
  return {
    type: 'task',
    slug: `proactive-research-${Date.now().toString(36)}`,
    priority: 55,
    category: 'proactive-research',
    status: 'pending',
    created_by: 'scheduler-idle',
    reason: 'Idle task: pull next topic from research agenda and execute web search + synthesis.',
    body: 'Run one knowledge acquisition cycle: pull highest-priority pending topic from agenda, gather from web/wikipedia/arXiv/npm/github, synthesize with LLM, write cited fact node to vault.',
  };
}

/**
 * Pick a random active memory node and create a clarity review task.
 */
function generateClarityReviewTask(vaultDir) {
  const nodes = loadNodes(vaultDir).filter((n) => n.status === 'active');
  if (nodes.length === 0) {
    return makeFallbackTask('memory-maintenance', 'No active nodes to review');
  }

  const target = nodes[crypto.randomInt(0, nodes.length)];
  return {
    type: 'task',
    slug: `clarity-review-${target.slug}-${Date.now().toString(36)}`,
    priority: 30,
    category: 'memory-maintenance',
    target: target.slug,
    status: 'pending',
    created_by: 'scheduler-idle',
    reason: `Idle task: review "${target.title}" for clarity and actionability.`,
    body: `## Objective\nReview memory node "${target.slug}" and evaluate:\n1. Is the title descriptive enough for a 7-item skill injection?\n2. Is the body actionable by an AI agent?\n3. Does the frontmatter accurately reflect the content?\n\nIf improvements are needed, generate a rewrite proposal.`,
  };
}

/**
 * Pick the oldest fact node and create a staleness check task.
 */
function generateStalenessCheckTask(vaultDir) {
  const nodes = loadNodes(vaultDir)
    .filter((n) => n.status === 'active' && n.category === 'facts')
    .sort((a, b) => {
      const aDate = new Date(a.last_accessed || a.updated || 0).getTime();
      const bDate = new Date(b.last_accessed || b.updated || 0).getTime();
      return aDate - bDate; // oldest first
    });

  if (nodes.length === 0) {
    // No facts? Pick any old node
    const allNodes = loadNodes(vaultDir).filter((n) => n.status === 'active');
    if (allNodes.length === 0) {
      return makeFallbackTask('research-acquisition', 'No facts to verify');
    }
    const oldest = allNodes.sort((a, b) => {
      return new Date(a.updated || 0).getTime() - new Date(b.updated || 0).getTime();
    })[0];
    return {
      type: 'task',
      slug: `staleness-check-${oldest.slug}-${Date.now().toString(36)}`,
      priority: 25,
      category: 'research-acquisition',
      target: oldest.slug,
      status: 'pending',
      created_by: 'scheduler-idle',
      reason: `Idle task: verify if "${oldest.title}" is still current.`,
      body: `## Objective\nEvaluate whether memory node "${oldest.slug}" is still accurate given its age and domain.`,
    };
  }

  const target = nodes[0];
  return {
    type: 'task',
    slug: `staleness-check-${target.slug}-${Date.now().toString(36)}`,
    priority: 25,
    category: 'research-acquisition',
    target: target.slug,
    status: 'pending',
    created_by: 'scheduler-idle',
    reason: `Idle task: verify if fact "${target.title}" is still current.`,
    body: `## Objective\nThis fact was last accessed on ${target.last_accessed || 'unknown'}.\nDetermine if it is: STILL_VALID, POSSIBLY_STALE, or LIKELY_OUTDATED.\nIf stale, suggest a verification search query.`,
  };
}

/**
 * Pick a cluster of related nodes and create an inference task.
 */
function generateInferenceTask(vaultDir) {
  const nodes = loadNodes(vaultDir).filter((n) => n.status === 'active');
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
 * @param {string} opts.queueDir     Path to .agent/scheduler/queue/
 * @param {string} opts.vaultDir     Path to .agent/memory-vault/
 * @param {string} opts.sessionsDir  Path to .agent/sessions/
 * @returns {{ queue: TaskQueue, stats: object }}
 */
export function createScheduler({ queueDir, vaultDir, sessionsDir }) {
  const queue = new TaskQueue();

  // Load explicit tasks from disk
  const diskTasks = loadPendingTasks(queueDir);
  for (const task of diskTasks) {
    queue.enqueue(task);
  }

  // Load pending research queue tasks
  try {
    const COOLDOWN_MS = process.env.RESEARCH_COOLDOWN_MS
      ? parseInt(process.env.RESEARCH_COOLDOWN_MS, 10)
      : 60 * 60 * 1000; // 1 hour default

    const allItems = loadQueue();
    let resetCount = 0;

    for (const item of allItems) {
      if (item.status === 'done' || item.status === 'failed') {
        const completedTime = new Date(item.completed_at || item.updated_at || 0).getTime();
        if (Date.now() - completedTime >= COOLDOWN_MS) {
          try {
            updateQueueItem(item.id, { status: 'pending' });
            resetCount++;
          } catch (updateErr) {
            logger.error({
              subsystem: 'scheduler',
              message: `Failed to reset research queue item ${item.id} to pending: ${updateErr.message}`,
            });
          }
        }
      }
    }

    if (resetCount > 0) {
      logger.info({
        subsystem: 'scheduler',
        message: `Auto-reset ${resetCount} completed/failed research items back to pending after cooldown.`,
      });
    }

    const researchItems = loadQueue().filter((i) => i.status === 'pending');
    for (const item of researchItems) {
      queue.enqueue({
        type: 'task',
        slug: `research-queue-${item.id}`,
        priority: 85, // Enforced high priority
        category: 'proactive-research',
        target: item.topic,
        status: 'pending',
        created_by: 'research-queue',
        reason: `Queued research project: ${item.topic}`,
        body: `Run knowledge acquisition cycle for queued topic: ${item.topic}.\nNotes: ${item.notes || 'None'}`,
        _research_id: item.id,
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
     * Get the next task. If the queue is empty, generate an idle task.
     */
    next() {
      const explicit = queue.dequeue();
      if (explicit) return { task: explicit, source: 'explicit' };

      const idle = generateIdleTask({ vaultDir, sessionsDir });
      persistTaskToDisk(idle, queueDir);
      return { task: idle, source: 'idle' };
    },
  };
}
