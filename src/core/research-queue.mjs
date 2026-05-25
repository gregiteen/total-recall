/**
 * src/core/research-queue.mjs
 *
 * Canonical research queue CRUD. All queue logic lives here.
 * MCP tools and REST endpoints are thin callers.
 *
 * Storage: .agent/research-queue.jsonl (one JSON object per line)
 * Each item: { id, topic, status, priority, notes, node_slug, research_phase, created_at, updated_at, completed_at, summary }
 * Status values: 'pending' | 'in_progress' | 'done' | 'failed'
 */

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import matter from 'gray-matter';
import { loadNodes, writeNode, deleteNode } from './vault.mjs';
import { brainDir } from './config.mjs';

const getBrainDir = () => process.env._TR_TEST_AGENT_DIR || brainDir;

function getQueueFile(overrideBrainDir) {
  const dir = overrideBrainDir || getBrainDir();
  return path.join(dir, 'research-queue.jsonl');
}

const STATUS_RANK = { pending: 0, in_progress: 1, done: 2, failed: 3 };

// ─── Summary Compiler ─────────────────────────────────────────────────────────

/**
 * Compile a gorgeous, detailed research project summary from the topic state and vault node.
 */
export function compileResearchProjectSummary(item, node) {
  if (!node) {
    return {
      id: item.id,
      topic: item.topic,
      status: item.status,
      phase: item.research_phase || 'acquisition',
      last_updated: item.updated_at,
      conclusions: [],
      ongoing_directions: ['Research project is enqueued / in progress in phase: ' + (item.research_phase || 'acquisition')],
      sources_count: 0
    };
  }

  const body = node.body || '';
  const sections = {};
  let currentHeader = null;
  
  // Split body by lines to group into sections
  const lines = body.split('\n');
  for (const line of lines) {
    const headerMatch = line.match(/^##\s+(.+)$/);
    if (headerMatch) {
      currentHeader = headerMatch[1].trim().toLowerCase();
      sections[currentHeader] = [];
    } else if (currentHeader) {
      sections[currentHeader].push(line);
    }
  }

  // Helper to extract bullet points from a section
  const extractBullets = (sectionNames) => {
    const bullets = [];
    for (const name of sectionNames) {
      const secLines = sections[name];
      if (secLines) {
        for (const line of secLines) {
          const trimmed = line.trim();
          if (trimmed.startsWith('-') || trimmed.startsWith('*')) {
            const cleaned = trimmed.replace(/^[-*]\s+/, '');
            bullets.push(cleaned);
          }
        }
      }
    }
    return bullets;
  };

  // Find conclusions & key facts
  const keyFacts = extractBullets(['key facts', 'verified facts', 'facts']);
  const cognitiveDelib = extractBullets(['cognitive deliberation', 'insights', 'deliberation']);
  const conclusions = [...keyFacts, ...cognitiveDelib];

  // Find ongoing directions, gaps, and monitoring
  const furtherResearch = extractBullets(['further research needed', 'gaps', 'tangents']);
  const monitoring = extractBullets(['ongoing monitoring & sources', 'monitored sources', 'monitoring']);
  const expansion = extractBullets(['spawned research expansion avenues', 'expansion avenues', 'expansion']);
  const ongoingDirections = [...furtherResearch, ...monitoring, ...expansion];

  return {
    id: item.id,
    topic: item.topic,
    status: item.status,
    phase: item.research_phase || 'acquisition',
    node_slug: item.node_slug,
    node_status: node.status,
    last_updated: item.updated_at,
    conclusions: conclusions.length > 0 ? conclusions : ['Initial facts gathered and indexed in the knowledge base.'],
    ongoing_directions: ongoingDirections.length > 0 ? ongoingDirections : ['Next phases: deliberation, layout refinement, ongoing monitoring, and tangential expansion.'],
    sources_count: node.source?.evidence_count || keyFacts.length || 0
  };
}

/**
 * Sync a research project summary node to the SSSS memory vault.
 * Creates/updates a .md node in memory-vault/facts/ named research-project-<id>.md.
 */
export function syncResearchProjectNode(item) {
  if (!item) return;
  const vaultDir = path.join(getBrainDir(), 'memory-vault');

  // Build a beautiful markdown body for the summary node
  const lines = [];
  lines.push(`# Research Project Summary: ${item.topic}`);
  lines.push('');
  lines.push(`> [!NOTE]`);
  lines.push(`> **Project Status**: \`${item.status}\` | **Research Phase**: \`${item.research_phase || 'acquisition'}\``);
  lines.push(`> **Priority**: \`${item.priority || 'medium'}\``);
  lines.push(`> **Created**: \`${item.created_at}\` | **Last Updated**: \`${item.updated_at}\``);
  lines.push('');

  lines.push('## Conclusions');
  if (item.summary?.conclusions && item.summary.conclusions.length > 0) {
    for (const c of item.summary.conclusions) {
      lines.push(`- ${c}`);
    }
  } else {
    lines.push('- No conclusions recorded yet.');
  }
  lines.push('');

  lines.push('## Ongoing Directions');
  if (item.summary?.ongoing_directions && item.summary.ongoing_directions.length > 0) {
    for (const d of item.summary.ongoing_directions) {
      lines.push(`- ${d}`);
    }
  } else {
    lines.push('- No ongoing directions recorded yet.');
  }
  lines.push('');

  if (item.node_slug) {
    lines.push('## Full Report');
    lines.push(`- [[${item.node_slug}]]`);
    lines.push('');
  }

  const body = lines.join('\n');

  const node = {
    type: 'memory',
    slug: `research-project-${item.id}`,
    category: 'facts',
    title: `Research Project Summary: ${item.topic}`,
    body,
    status: 'active',
    confidence: 1.0,
    importance: 3,
    created: item.created_at,
    updated: item.updated_at,
    last_accessed: new Date().toISOString(),
    source: {
      type: 'research-engine',
      session_id: item.id,
      evidence_count: item.summary?.sources_count || 0
    },
    supersedes: [],
    superseded_by: null,
    contradicts: [],
    tags: ['research-project', 'summary', 'status'],
    related: item.node_slug ? [item.node_slug] : [],
    routes_to_skills: [],
    sentiment_polarity: 'descriptive',
    sentiment_target: 'research-project',
    modality: 'should',
    subject: 'agent',
    predicate: 'tracked_research_project',
    object: 'knowledge_vault',
    decay: {
      half_life_days: 90,
      access_count: 1
    },
    schema_version: 2,
    x_temporal_context: item.updated_at,
    x_citations: [{
      source: 'research-engine',
      title: item.topic,
      url: `research://${item.id}`,
      published: item.created_at,
      relevance: 1.0,
      accessed: new Date().toISOString()
    }]
  };

  try {
    writeNode(node, vaultDir);
  } catch (e) {
    // Log or handle error gracefully
  }
}

// ─── I/O ───────────────────────────────────────────────────────────────────────

export function loadQueue(overrideBrainDir) {
  const queueFile = getQueueFile(overrideBrainDir);
  const effectiveBrainDir = overrideBrainDir || getBrainDir();
  if (!fs.existsSync(queueFile)) return [];
  const items = fs.readFileSync(queueFile, 'utf8')
    .split('\n').filter(Boolean)
    .map(l => { try { return JSON.parse(l); } catch { return null; } })
    .filter(Boolean);

  // Dynamic self-healing: ensure every research item has a summary enqueued
  let changed = false;
  const vaultDir = path.join(effectiveBrainDir, 'memory-vault');

  for (const item of items) {
    if (!item.summary) {
      let node = null;
      if (item.node_slug) {
        try {
          const nodes = loadNodes(vaultDir);
          node = nodes.find(n => n.slug === item.node_slug);
          if (!node) {
            const inboxFile = path.join(effectiveBrainDir, 'memory-inbox', 'pending', `${item.node_slug}.md`);
            if (fs.existsSync(inboxFile)) {
              const raw = fs.readFileSync(inboxFile, 'utf8');
              const { data, content } = matter(raw);
              node = { ...data, body: content.trim() };
            }
          }
        } catch {}
      }
      item.summary = compileResearchProjectSummary(item, node);
      changed = true;
    }

    // Dynamic self-healing: ensure a corresponding markdown summary node is in the vault
    const summaryPath = path.join(vaultDir, 'facts', `research-project-${item.id}.md`);
    if (!fs.existsSync(summaryPath)) {
      try {
        syncResearchProjectNode(item);
      } catch {}
    }
  }

  if (changed) {
    try {
      saveQueue(items, overrideBrainDir);
    } catch {}
  }

  return items;
}

export function saveQueue(items, overrideBrainDir) {
  const queueFile = getQueueFile(overrideBrainDir);
  fs.mkdirSync(path.dirname(queueFile), { recursive: true });
  fs.writeFileSync(queueFile, items.map(i => JSON.stringify(i)).join('\n') + '\n', 'utf8');
}

// ─── CRUD ──────────────────────────────────────────────────────────────────────

/**
 * List all research projects, optionally filtered by status or search query.
 * Sorted: pending → in_progress → done → failed, then by updated_at desc.
 *
 * @param {{ status?: string, query?: string, limit?: number, offset?: number }} [opts]
 * @returns {{ counts: object, total: number, items: object[] }}
 */
export function listQueue({ status, query, limit = 100, offset = 0, brainDir: overrideBrainDir } = {}) {
  const all = loadQueue(overrideBrainDir);
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
export function addToQueue({ topic, priority = 'medium', notes, brainDir: overrideBrainDir } = {}) {
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
  item.summary = compileResearchProjectSummary(item, null);
  const items = loadQueue(overrideBrainDir);
  items.unshift(item);
  saveQueue(items, overrideBrainDir);

  // Sync initial pending project summary node to the vault
  try {
    syncResearchProjectNode(item);
  } catch {}

  return item;
}

/**
 * Update an existing item by id.
 *
 * @param {string} id
 * @param {{ status?: string, notes?: string, node_slug?: string, priority?: string, research_phase?: string }} patch
 * @returns {object} The updated item
 */
export function updateQueueItem(id, patch = {}, overrideBrainDir) {
  const items = loadQueue(overrideBrainDir);
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

  // Load the latest node (from vault or inbox pending) to compile summary
  const localBrainDir = overrideBrainDir || getBrainDir();
  const vaultDir = path.join(localBrainDir, 'memory-vault');
  let node = null;
  if (item.node_slug) {
    try {
      const nodes = loadNodes(vaultDir);
      node = nodes.find(n => n.slug === item.node_slug);
      
      if (!node) {
        const inboxFile = path.join(localBrainDir, 'memory-inbox', 'pending', `${item.node_slug}.md`);
        if (fs.existsSync(inboxFile)) {
          const raw = fs.readFileSync(inboxFile, 'utf8');
          const { data, content } = matter(raw);
          node = { ...data, body: content.trim() };
        }
      }
    } catch (e) {
      // Ignore non-fatal vault lookup error
    }
  }
  item.summary = compileResearchProjectSummary(item, node);

  items[idx] = item;
  saveQueue(items, overrideBrainDir);

  // Sync updated research project summary node to the vault
  try {
    syncResearchProjectNode(item);
  } catch {}

  return item;
}

/**
 * Remove a research project by id.
 *
 * @param {string} id
 * @returns {{ deleted: boolean, id: string, topic: string }}
 */
export function removeFromQueue(id, overrideBrainDir) {
  const items = loadQueue(overrideBrainDir);
  const idx = items.findIndex(i => i.id === id);
  if (idx === -1) throw Object.assign(new Error(`Research project not found: ${id}`), { status: 404 });
  const [removed] = items.splice(idx, 1);
  saveQueue(items, overrideBrainDir);

  // Delete the corresponding summary node from the vault
  try {
    const vaultDir = path.join(overrideBrainDir || getBrainDir(), 'memory-vault');
    deleteNode(`research-project-${id}`, vaultDir);
  } catch {}

  return { deleted: true, id: removed.id, topic: removed.topic };
}
