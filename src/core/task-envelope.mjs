/**
 * Task envelope — durable daemon work items on the scheduler queue.
 *
 * Agents and users enqueue open-ended work; the daemon executes under
 * capability policy via the executor registry (task-executors.mjs).
 */

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { FileSystemVfs, VfsConflictError } from '@ssss/cli/vfs';
import matter from './frontmatter.mjs';
import { atomicWrite, isSafeVaultName, safeStringify } from './vault.mjs';
import { observeDaemon } from './startup-health.mjs';

export const TASK_CANCELLATION_SUPPORTS_EXPECTED_STATUS = true;
const TASK_QUEUE_PROTOCOL = 1;
const schedulerReceipt = queueDir => path.join(path.dirname(queueDir), 'queue-protocol.json');

export function publishTaskSchedulerProtocol(queueDir) {
  const pidFile = path.resolve(queueDir, '../../daemon.pid');
  fs.mkdirSync(path.dirname(queueDir), { recursive: true });
  atomicWrite(schedulerReceipt(queueDir), JSON.stringify({
    protocol: TASK_QUEUE_PROTOCOL,
    pid: process.pid,
    pidFileMtime: fs.statSync(pidFile).mtimeMs,
  }));
}

export function supportsPendingTaskCancellation(queueDir) {
  const brainDir = path.resolve(queueDir, '../..');
  const daemon = observeDaemon(brainDir);
  if (daemon.status === 'not-started' || daemon.status === 'stopped') return true;
  if (daemon.status !== 'running') return false;
  try {
    const report = JSON.parse(fs.readFileSync(schedulerReceipt(queueDir), 'utf8'));
    return report.protocol === TASK_QUEUE_PROTOCOL && report.pid === daemon.pid &&
      report.pidFileMtime === fs.statSync(path.join(brainDir, 'daemon.pid')).mtimeMs;
  } catch { return false; }
}

/** Soft kinds — labels only; executor resolution uses `executor` then `category` then kind. */
export const TASK_KINDS = Object.freeze([
  'memory',
  'research',
  'maintenance',
  'system',
  'custom',
]);

export const TASK_STATUSES = Object.freeze([
  'pending',
  'in-progress',
  'in_progress',
  'completed',
  'failed',
  'cancelled',
]);

/** Default-deny dangerous capabilities. */
export const FORBIDDEN_CAPABILITIES = Object.freeze([
  'shell',
  'shell:all',
  'shell:any',
  'fs:root',
  'net:post',
  'net:all',
]);

export const DEFAULT_CAPABILITIES = Object.freeze(['vault:read']);

/**
 * Normalize priority: numeric 0–100, or named levels.
 */
export function normalizePriority(priority) {
  if (priority == null || priority === '') return 50;
  if (typeof priority === 'number' && Number.isFinite(priority)) {
    return Math.max(0, Math.min(100, priority));
  }
  const map = {
    absolute: 100,
    high: 80,
    normal: 50,
    medium: 50,
    low: 20,
  };
  const key = String(priority).toLowerCase();
  if (map[key] != null) return map[key];
  const n = parseInt(String(priority), 10);
  return Number.isFinite(n) ? Math.max(0, Math.min(100, n)) : 50;
}

/**
 * Build a normalized task envelope object (not yet on disk).
 */
export function buildTaskEnvelope({
  intent,
  slug,
  kind = 'custom',
  executor = null,
  category = null,
  priority = 50,
  capabilities = DEFAULT_CAPABILITIES,
  payload = {},
  budget = {},
  origin = {},
  result = {},
  system = false,
  body = '',
  target = null,
  status = 'pending',
} = {}) {
  if (!intent && !body && !target) {
    throw new Error('Task envelope requires intent, body, or target');
  }

  const caps = Array.isArray(capabilities)
    ? [...capabilities]
    : String(capabilities || '')
        .split(',')
        .map((c) => c.trim())
        .filter(Boolean);

  const forbidden = caps.filter((c) => FORBIDDEN_CAPABILITIES.includes(c));
  if (forbidden.length) {
    throw new Error(
      `Capability not allowed by default policy: ${forbidden.join(', ')}. ` +
        'Shell/net-post require explicit host policy (not yet granted via CLI).',
    );
  }

  const now = new Date().toISOString();
  const baseSlug =
    slug ||
    `task-${kind}-${crypto.createHash('sha256').update(`${intent || body || target}-${now}`).digest('hex').slice(0, 10)}`;

  const resolvedCategory =
    category ||
    (kind === 'research'
      ? 'proactive-research'
      : kind === 'maintenance'
        ? 'memory-maintenance'
        : kind === 'system'
          ? 'memory-maintenance'
          : kind === 'memory'
            ? 'memory-maintenance'
            : 'custom');

  return {
    type: 'task',
    schema_version: 1,
    slug: baseSlug,
    status,
    priority: normalizePriority(priority),
    kind: TASK_KINDS.includes(kind) ? kind : 'custom',
    executor: executor || (kind === 'custom' ? 'custom' : null),
    category: resolvedCategory,
    intent: intent || body || target || '',
    target: target || null,
    capabilities: caps.length ? caps : [...DEFAULT_CAPABILITIES],
    payload: payload && typeof payload === 'object' ? payload : {},
    budget: {
      max_wall_ms: budget.max_wall_ms ?? 120000,
      max_tokens: budget.max_tokens ?? 0,
      max_tool_calls: budget.max_tool_calls ?? 20,
    },
    origin: {
      agent: origin.agent || origin.created_by || 'cli',
      session_id: origin.session_id || null,
      created_at: origin.created_at || now,
      created_by: origin.created_by || origin.agent || 'cli',
    },
    result: {
      land: result.land || 'inbox',
      promote_via: result.promote_via || 'draft',
    },
    system: Boolean(system),
    created_by: origin.created_by || origin.agent || 'cli',
    reason: intent || body || '',
    body: body || intent || '',
    created_at: now,
    updated_at: now,
  };
}

/**
 * Normalize a disk/legacy task into envelope fields (in-place-ish return).
 */
export function normalizeTask(raw) {
  if (!raw || typeof raw !== 'object') return raw;
  const task = { ...raw };
  task.type = task.type || 'task';
  task.status = task.status || 'pending';
  if (task.status === 'in_progress') task.status = 'in-progress';
  task.priority = normalizePriority(task.priority);
  task.kind = task.kind || inferKind(task);
  task.executor = task.executor || null;
  task.capabilities = Array.isArray(task.capabilities)
    ? task.capabilities
    : [...DEFAULT_CAPABILITIES];
  task.payload = task.payload && typeof task.payload === 'object' ? task.payload : {};
  task.intent = task.intent || task.reason || task.body || task.target || task.slug || '';
  task.system = Boolean(task.system);
  return task;
}

function inferKind(task) {
  if (task.system) return 'system';
  if (task._research_id || String(task.category || '').includes('research') || String(task.slug || '').startsWith('research-')) {
    return 'research';
  }
  if (task.category === 'memory-maintenance' || String(task.slug || '').includes('dream')) {
    return 'maintenance';
  }
  if (task.category === 'custom' || task.executor === 'custom') return 'custom';
  return task.kind || 'custom';
}

/**
 * Persist envelope to queueDir as `<slug>.md`.
 */
export function persistEnvelope(envelope, queueDir) {
  if (!fs.existsSync(queueDir)) {
    fs.mkdirSync(queueDir, { recursive: true });
  }
  const task = normalizeTask(envelope);
  const filepath = path.join(queueDir, `${task.slug}.md`);
  const { body, _filepath, ...frontmatter } = task;
  for (const key of Object.keys(frontmatter)) {
    if (frontmatter[key] === undefined) delete frontmatter[key];
  }
  // ssss-raw-write: scheduler/queue task envelope, not a vault node.
  atomicWrite(filepath, safeStringify(body || task.intent || '', frontmatter));
  task._filepath = filepath;
  return task;
}

/**
 * Enqueue a new task (build + persist).
 */
export function addTask(opts, queueDir) {
  const envelope = buildTaskEnvelope(opts);
  return persistEnvelope(envelope, queueDir);
}

/**
 * List tasks from disk. statusFilter: pending|completed|failed|cancelled|all
 */
export function listTasks(queueDir, { status = 'pending' } = {}) {
  if (!fs.existsSync(queueDir)) return [];
  const files = fs.readdirSync(queueDir, { withFileTypes: true })
    .filter(entry => entry.isFile() && entry.name.endsWith('.md')).map(entry => entry.name);
  const tasks = [];
  for (const file of files) {
    try {
      const filepath = path.join(queueDir, file);
      const raw = fs.readFileSync(filepath, 'utf8');
      const { data, content } = matter(raw);
      const task = normalizeTask({
        ...data,
        slug: data.slug || path.basename(file, '.md'),
        body: content,
        _filepath: filepath,
      });
      if (status === 'all') {
        tasks.push(task);
        continue;
      }
      if (status === 'pending') {
        if (task.status === 'pending' || task.status === 'in-progress') tasks.push(task);
        continue;
      }
      if (task.status === status) tasks.push(task);
    } catch {
      // skip malformed
    }
  }
  return tasks.sort((a, b) => (b.priority || 0) - (a.priority || 0));
}

/**
 * Load one task by slug.
 */
export function getTask(queueDir, slug) {
  if (typeof slug !== 'string' || !isSafeVaultName(slug)) return null;
  const filepath = path.join(queueDir, `${slug}.md`);
  if (!fs.existsSync(filepath)) {
    // scan for match
    const all = listTasks(queueDir, { status: 'all' });
    return all.find((t) => t.slug === slug) || null;
  }
  if (!fs.lstatSync(filepath).isFile()) return null;
  const raw = fs.readFileSync(filepath, 'utf8');
  const { data, content } = matter(raw);
  return normalizeTask({
    ...data,
    slug: data.slug || slug,
    body: content,
    _filepath: filepath,
  });
}

/** Compare the observed envelope and commit through the same VFS path for every status change. */
export async function transitionTaskStatus(queueDir, task, status, { expectedStatus, lastError } = {}) {
  if (!fs.existsSync(queueDir)) return { success: false, error: `Task not found: ${task.slug}` };
  const filepath = task._filepath || path.join(queueDir, `${task.slug}.md`);
  const relative = path.relative(path.resolve(queueDir), path.resolve(filepath));
  if (path.basename(relative) !== relative || !relative.endsWith('.md')) {
    return { success: false, error: 'Task path is outside the selected queue' };
  }
  const vfs = new FileSystemVfs(queueDir, { lock: { timeoutMs: 5000, staleMs: Infinity } });
  const current = await vfs.read(relative);
  if (!current) return { success: false, error: `Task not found: ${task.slug}` };
  const { data, content } = matter(current.bytes.toString('utf8'));
  const observed = normalizeTask(data).status;
  if (expectedStatus !== undefined && observed !== expectedStatus) {
    return { success: false, error: `Task is ${observed}, expected ${expectedStatus}: ${task.slug}` };
  }
  if (observed === 'completed' || observed === 'cancelled') {
    return { success: false, error: `Task already ${observed}: ${task.slug}` };
  }
  data.status = status;
  data.updated_at = new Date().toISOString();
  if (status === 'cancelled') data.cancelled_at = data.updated_at;
  if (status === 'completed') data.completed_at = data.updated_at;
  if (lastError) data.last_error = lastError;
  if (task.retry_count !== undefined) data.retry_count = task.retry_count;
  try {
    await vfs.writeAtomic(relative, Buffer.from(safeStringify(content, data)), { version: current.version });
  } catch (error) {
    if (error instanceof VfsConflictError) return { success: false, error: `Task changed concurrently: ${task.slug}` };
    throw error;
  }
  return { success: true, task: normalizeTask({ ...data, slug: data.slug || task.slug, body: content, _filepath: filepath }) };
}

/** Mark cancellation, optionally requiring the pending state at the VFS commit. */
export async function cancelTask(queueDir, slug, { expectedStatus } = {}) {
  const task = getTask(queueDir, slug);
  if (!task) return { success: false, error: `Task not found: ${slug}` };
  if (expectedStatus === 'pending' && !supportsPendingTaskCancellation(queueDir)) {
    return { success: false, error: 'The running daemon does not support pending-only cancellation' };
  }
  return transitionTaskStatus(queueDir, task, 'cancelled', { expectedStatus });
}

/**
 * Resolve queue directory for a brain.
 */
export function resolveQueueDir(brainDir) {
  return path.join(brainDir, 'scheduler', 'queue');
}
