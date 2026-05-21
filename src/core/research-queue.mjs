/**
 * src/core/research-queue.mjs
 *
 * Canonical research queue CRUD. All queue logic lives here.
 * MCP tools and REST endpoints are thin callers.
 *
 * Storage: .agent/research-queue.jsonl (one JSON object per line)
 * Each item: { id, topic, status, priority, notes, node_slug, created_at, updated_at, completed_at }
 * Status values: 'pending' | 'in_progress' | 'done' | 'failed'
 */

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import os from 'node:os';

function getQueueFile() {
  const agentDir = process.env.AGENT_DIR || path.join(os.homedir(), '.agent');
  return path.join(agentDir, 'research-queue.jsonl');
}

const STATUS_RANK = { pending: 0, in_progress: 1, done: 2, failed: 3 };

// ── I/O ───────────────────────────────────────────────────────────────────────

export function loadQueue() {
  const queueFile = getQueueFile();
  if (!fs.existsSync(queueFile)) return [];
  return fs.readFileSync(queueFile, 'utf8')
    .split('\n').filter(Boolean)
    .map(l => { try { return JSON.parse(l); } catch { return null; } })
    .filter(Boolean);
}

export function saveQueue(items) {
  const queueFile = getQueueFile();
  fs.mkdirSync(path.dirname(queueFile), { recursive: true });
  fs.writeFileSync(queueFile, items.map(i => JSON.stringify(i)).join('\n') + '\n', 'utf8');
}

// ── CRUD ──────────────────────────────────────────────────────────────────────

/**
 * List all research projects, optionally filtered by status or search query.
 * Sorted: pending → in_progress → done → failed, then by updated_at desc.
 *
 * @param {{ status?: string, query?: string, limit?: number, offset?: number }} [opts]
 * @returns {{ counts: object, total: number, items: object[] }}
 */
export function listQueue({ status, query, limit = 100, offset = 0 } = {}) {
  const all = loadQueue();
  const counts = { pending: 0, in_progress: 0, done: 0, failed: 0 };
  all.forEach(i => { if (counts[i.status] !== undefined) counts[i.status]++; });

  let items = status && status !== 'all' ? all.filter(i => i.status === status) : [...all];

  if (query) {
    const q = String(query).toLowerCase();
    items = items.filter(i => 
      (i.topic && i.topic.toLowerCase().includes(q)) || 
      (i.notes && i.notes.toLowerCase().includes(q))
    );
  }

  items.sort((a, b) => {
    const ra = STATUS_RANK[a.status] ?? 4, rb = STATUS_RANK[b.status] ?? 4;
    if (ra !== rb) return ra - rb;
    return (b.updated_at || b.created_at).localeCompare(a.updated_at || a.created_at);
  });

  const lim = Math.min(500, Number(limit) || 100);
  const off = Number(offset) || 0;
  return { counts, total: items.length, items: items.slice(off, off + lim) };
}

/**
 * Add a new research topic (status: pending).
 *
 * @param {{ topic: string, priority?: string, notes?: string }} opts
 * @returns {object} The created item
 */
export function addToQueue({ topic, priority = 'medium', notes } = {}) {
  if (!topic) throw new Error('topic is required');
  const item = {
    id:           crypto.randomUUID(),
    topic:        String(topic),
    status:       'pending',
    priority:     priority || 'medium',
    notes:        notes || null,
    node_slug:    null,
    research_phase: 'acquisition',
    created_at:   new Date().toISOString(),
    updated_at:   new Date().toISOString(),
    completed_at: null,
  };
  const items = loadQueue();
  items.unshift(item);
  saveQueue(items);
  return item;
}

/**
 * Update an existing item by id.
 *
 * @param {string} id
 * @param {{ status?: string, notes?: string, node_slug?: string, priority?: string, research_phase?: string }} patch
 * @returns {object} The updated item
 */
export function updateQueueItem(id, patch = {}) {
  const items = loadQueue();
  const idx = items.findIndex(i => i.id === id);
  if (idx === -1) throw Object.assign(new Error(`Research project not found: ${id}`), { status: 404 });

  const item = { ...items[idx] };
  if (patch.status    !== undefined) {
    item.status    = patch.status;
    if (patch.status === 'pending') {
      item.completed_at = null;
    }
  }
  if (patch.notes     !== undefined) item.notes     = patch.notes;
  if (patch.node_slug !== undefined) item.node_slug = patch.node_slug;
  if (patch.priority  !== undefined) item.priority  = patch.priority;
  if (patch.research_phase !== undefined) item.research_phase = patch.research_phase;
  item.updated_at = new Date().toISOString();
  if ((item.status === 'done' || item.status === 'failed') && !item.completed_at) {
    item.completed_at = new Date().toISOString();
  }
  items[idx] = item;
  saveQueue(items);
  return item;
}

/**
 * Remove a research project by id.
 *
 * @param {string} id
 * @returns {{ deleted: boolean, id: string, topic: string }}
 */
export function removeFromQueue(id) {
  const items = loadQueue();
  const idx = items.findIndex(i => i.id === id);
  if (idx === -1) throw Object.assign(new Error(`Research project not found: ${id}`), { status: 404 });
  const [removed] = items.splice(idx, 1);
  saveQueue(items);
  return { deleted: true, id: removed.id, topic: removed.topic };
}
