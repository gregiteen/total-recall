/**
 * src/core/research-gate.mjs
 *
 * The only doors into the research queue.
 *
 * Research has exactly two reasons to run (RESEARCH_SYSTEM2):
 *   1. A human asked — in chat, from the browser extension, the dashboard, the
 *      CLI or any API client. `requestResearch` records that and skips budgets.
 *   2. While working on a project, the AI found a knowledge gap that would make
 *      it better at that project. `proposeAutonomousResearch` admits such gaps
 *      only within budget and only when existing research doesn't cover them.
 *
 * Nothing inside the research pipeline calls either: research never spawns
 * research. That rule is what stops the fan-out that filled the queue with 89
 * self-generated tangents in two days.
 */

import fs from 'node:fs';
import path from 'node:path';
import yaml from 'yaml';
import { addToQueue, loadQueue, normalizeTopic, RESEARCH_VIAS } from './research-queue.mjs';
import { brainDir as defaultBrainDir } from './config.mjs';
import { logger } from './logger.mjs';

export const AUTONOMOUS_DEFAULTS = Object.freeze({
  enabled: true,
  maxPendingPerProject: 3,
  maxPerDay: 6,
  maxPerSession: 2,
  // Existing research at or above this cosine similarity already answers the gap.
  coverageSimilarity: 0.72,
});

const DAY_MS = 24 * 60 * 60 * 1000;
const OPEN_STATUSES = new Set(['pending', 'in_progress']);

/**
 * Merge `autonomous:` from config/research.yml over the defaults.
 * @param {object} [fileConfig] parsed research.yml
 */
export function resolveAutonomousConfig(fileConfig = {}) {
  const raw = (fileConfig && fileConfig.autonomous) || {};
  const num = (v, d) => (Number.isFinite(Number(v)) && Number(v) >= 0 ? Number(v) : d);
  return {
    enabled: raw.enabled === undefined ? AUTONOMOUS_DEFAULTS.enabled : raw.enabled !== false,
    maxPendingPerProject: num(raw.max_pending_per_project, AUTONOMOUS_DEFAULTS.maxPendingPerProject),
    maxPerDay: num(raw.max_per_day, AUTONOMOUS_DEFAULTS.maxPerDay),
    maxPerSession: num(raw.max_per_session, AUTONOMOUS_DEFAULTS.maxPerSession),
    coverageSimilarity: num(raw.coverage_similarity, AUTONOMOUS_DEFAULTS.coverageSimilarity),
  };
}

export function loadAutonomousConfig(brainDir = defaultBrainDir) {
  const file = path.join(brainDir, 'config', 'research.yml');
  try {
    return resolveAutonomousConfig(fs.existsSync(file) ? yaml.parse(fs.readFileSync(file, 'utf8')) || {} : {});
  } catch {
    return resolveAutonomousConfig({});
  }
}

function assertVia(via) {
  if (!RESEARCH_VIAS.includes(via)) throw new Error(`invalid research via: ${via}`);
}

/**
 * A human asked for research. No budgets, no coverage check: they asked.
 *
 * @param {{ topic: string, notes?: string, via: string, priority?: string, project?: string|null, brainDir?: string }} req
 */
export function requestResearch({ topic, notes, via, priority = 'high', project = null, brainDir } = {}) {
  const clean = String(topic || '').trim();
  if (!clean) throw new Error('topic is required');
  assertVia(via);
  return addToQueue({ topic: clean, notes, priority, origin: 'user', requested_via: via, project, brainDir });
}

/**
 * Default coverage check: the best cosine similarity between the gap and any
 * research-layer node in the vault. Returns 0 when search is unavailable, so a
 * broken embedding provider can only make the gate *more* permissive by the
 * budget, never unbounded.
 */
export async function defaultCoverageCheck(topic, { vaultDir, derivedDir } = {}) {
  try {
    const { semanticSearch } = await import('./search.mjs');
    const { inferMemoryLayer } = await import('./memory-layers.mjs');
    const results = await semanticSearch(topic, { vaultDir, derivedDir, top_k: 5, includeSessions: false });
    let best = 0;
    for (const r of results) {
      const isResearch = inferMemoryLayer(r) === 'research' || (Array.isArray(r.tags) && r.tags.includes('research'));
      if (isResearch && typeof r.similarity === 'number' && r.similarity > best) best = r.similarity;
    }
    return best;
  } catch {
    return 0;
  }
}

/**
 * The AI, while working on `project`, thinks these gaps are worth researching.
 * Admit at most what the budgets allow, skipping anything already covered.
 *
 * @param {Array<{topic: string, rationale?: string, priority?: number|string}>} candidates
 * @param {{ project: string|null, sessionId?: string|null, via?: 'session'|'secret',
 *           config?: object, now?: number, brainDir?: string,
 *           coverageCheck?: (topic: string) => Promise<number> }} ctx
 * @returns {Promise<{ queued: object[], skipped: Array<{topic: string, reason: string}> }>}
 */
export async function proposeAutonomousResearch(candidates, {
  project = null,
  sessionId = null,
  via = 'session',
  config,
  now = Date.now(),
  brainDir,
  coverageCheck,
} = {}) {
  assertVia(via);
  const cfg = config || loadAutonomousConfig(brainDir);
  const queued = [];
  const skipped = [];
  const list = (Array.isArray(candidates) ? candidates : [])
    .map((c) => ({ ...c, topic: String((c && c.topic) || '').trim() }))
    .filter((c) => c.topic);

  if (!cfg.enabled) {
    return { queued, skipped: list.map((c) => ({ topic: c.topic, reason: 'disabled' })) };
  }

  const check = coverageCheck || ((topic) => defaultCoverageCheck(topic, {
    vaultDir: path.join(brainDir || defaultBrainDir, 'memory-vault'),
    derivedDir: path.join(brainDir || defaultBrainDir, 'memory-derived'),
  }));

  const items = loadQueue(brainDir);
  const autonomous = items.filter((i) => i.origin === 'autonomous');
  let pendingForProject = autonomous.filter((i) => OPEN_STATUSES.has(i.status) && (i.project || null) === project).length;
  let today = autonomous.filter((i) => now - Date.parse(i.created_at || 0) < DAY_MS).length;
  let thisSession = sessionId ? autonomous.filter((i) => i.session_id === sessionId).length : 0;
  const known = new Set(items.map((i) => normalizeTopic(i.topic)));

  for (const c of list) {
    const key = normalizeTopic(c.topic);
    if (known.has(key)) { skipped.push({ topic: c.topic, reason: 'duplicate' }); continue; }
    if (today >= cfg.maxPerDay) { skipped.push({ topic: c.topic, reason: 'budget-day' }); continue; }
    if (pendingForProject >= cfg.maxPendingPerProject) { skipped.push({ topic: c.topic, reason: 'budget-project' }); continue; }
    if (sessionId && thisSession >= cfg.maxPerSession) { skipped.push({ topic: c.topic, reason: 'budget-session' }); continue; }

    const covered = await check(c.topic);
    if (covered >= cfg.coverageSimilarity) {
      skipped.push({ topic: c.topic, reason: 'covered' });
      continue;
    }

    const item = addToQueue({
      topic: c.topic,
      priority: typeof c.priority === 'string' ? c.priority : (Number(c.priority) >= 70 ? 'high' : 'medium'),
      notes: c.rationale || null,
      origin: 'autonomous',
      requested_via: via,
      project,
      rationale: c.rationale || null,
      session_id: sessionId,
      brainDir,
    });
    queued.push(item);
    known.add(key);
    today++;
    pendingForProject++;
    thisSession++;
  }

  if (queued.length || skipped.length) {
    logger.info({
      subsystem: 'research-gate',
      message: `Autonomous research for ${project || 'no project'}: queued ${queued.length}, skipped ${skipped.length}`
        + (skipped.length ? ` (${skipped.map((s) => s.reason).join(', ')})` : ''),
    });
  }
  return { queued, skipped };
}
