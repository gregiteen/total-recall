/**
 * src/core/vector-field.mjs
 *
 * The Infinite Vector Field
 *
 * Every node is a measurement point in continuous embedding space.
 * Each point carries:
 *   - position:     embedding[768]          — where in concept space
 *   - half_life:    λ (decay constant)      — how fast relevance decays
 *   - trajectory:   d²R/dt²                 — is decay accelerating or decelerating
 *   - velocity:     dR/dt                   — rate of relevance change
 *   - novelty:      information density     — has model seen this before?
 *   - coupling:     covariance[i][j]        — entanglement with every other point
 *   - dependencies: slug[]                  — nodes that must co-occur
 *
 * The field exists everywhere. Nodes are where we've sampled it.
 * Queries sample new points. The field interpolates.
 * The compiled field replaces all LLM calls for known query regions.
 */

import fs from 'node:fs';
import path from 'node:path';
import { loadNodes } from './vault.mjs';
import { getEmbedding, loadEmbeddingsIndex } from './embeddings.mjs';
import { inferMemoryLayer } from './memory-layers.mjs';
import { logger } from './logger.mjs';
import { brainDir } from './config.mjs';
import { readAccess, recordAccess, lastUsedMs, activeDays, activeDaysSince } from './access-ledger.mjs';
import { atomicWrite } from './vault-files.mjs';

const DERIVED_DIR = path.join(brainDir, 'memory-derived');

function fieldPath(derivedDir = DERIVED_DIR) {
  return path.join(derivedDir, 'vector-field.json');
}

const LN2 = Math.log(2);

// ─── Half-Life Constants (milliseconds) ─────────────────────────────────────

const HALF_LIFE_TABLE = {
  // Category-based half-lives
  invariant:    Infinity,                   // never decays
  invariants:   Infinity,                   // never decays
  correction:   60 * 24 * 60 * 60 * 1000,  // 60 days
  corrections:  60 * 24 * 60 * 60 * 1000,  // 60 days
  decision:     90 * 24 * 60 * 60 * 1000,  // 90 days
  decisions:    90 * 24 * 60 * 60 * 1000,  // 90 days
  preference:   180 * 24 * 60 * 60 * 1000, // 180 days
  preferences:  180 * 24 * 60 * 60 * 1000, // 180 days
  fact:         30 * 24 * 60 * 60 * 1000,  // 30 days (post-cutoff facts)
  facts:        30 * 24 * 60 * 60 * 1000,  // 30 days (post-cutoff facts)
  concept:      120 * 24 * 60 * 60 * 1000, // 120 days
  concepts:     120 * 24 * 60 * 60 * 1000, // 120 days
  pattern:      90 * 24 * 60 * 60 * 1000,  // 90 days
  patterns:     90 * 24 * 60 * 60 * 1000,  // 90 days
  'anti-pattern': 60 * 24 * 60 * 60 * 1000, // 60 days
  'anti-patterns': 60 * 24 * 60 * 60 * 1000, // 60 days
  lore:         365 * 24 * 60 * 60 * 1000, // 1 year
  // Priority overrides
  _absolute:    Infinity,                    // absolute priority = infinite half-life
  _high:        180 * 24 * 60 * 60 * 1000,  // 180 days minimum
  // Ephemeral types
  session:      2 * 60 * 60 * 1000,         // 2 hours
  task:         30 * 60 * 1000,              // 30 minutes
  grounding:    30 * 60 * 1000,              // 30 minutes
  research:     14 * 24 * 60 * 60 * 1000,   // 14 days
};

/**
 * Determine the half-life for a node based on its category and priority.
 */
function computeHalfLife(node) {
  // Priority overrides category
  if (node.priority === 'absolute' || HALF_LIFE_TABLE[node.category] === Infinity) return Infinity;
  const configuredDays = Number(node.decay?.half_life_days);
  const categoryHL = configuredDays > 0 ? configuredDays * 86400000 :
    (HALF_LIFE_TABLE[node.category] || HALF_LIFE_TABLE.fact);
  if (node.priority === 'high') {
    return Math.max(categoryHL, HALF_LIFE_TABLE._high);
  }
  return categoryHL;
}

/**
 * Compute decay constant λ = ln(2) / half_life
 */
function decayConstant(halfLife) {
  if (!isFinite(halfLife)) return 0; // no decay
  return LN2 / halfLife;
}

/**
 * Compute current effective relevance given peak relevance and time elapsed.
 * R(t) = R₀ × e^(-λt) × (1 + trajectory × t_normalized)
 */
function effectiveRelevance(peakRelevance, lambda, elapsedMs, trajectory = 0) {
  if (lambda === 0) return peakRelevance; // infinite half-life
  const decayed = peakRelevance * Math.exp(-lambda * elapsedMs);
  // Trajectory modulates: positive trajectory slows decay, negative accelerates
  const tNorm = Math.min(elapsedMs / (7 * 24 * 60 * 60 * 1000), 1); // normalize to 1 week
  const trajectoryMod = 1 + (trajectory * tNorm * 0.3); // ±30% max adjustment
  return Math.max(0, decayed * trajectoryMod);
}

// ─── Novelty Scoring ────────────────────────────────────────────────────────

/**
 * Compute novelty score for a node.
 * Novelty = inverse of how many times this node has been injected into context.
 * First time = 1.0, after 100 times = ~0.1
 */
function computeNovelty(accessCount) {
  if (accessCount <= 0) return 1.0; // never seen = maximum novelty
  return 1 / (1 + Math.log1p(accessCount)); // logarithmic decay of novelty
}

// ─── Compilation ────────────────────────────────────────────────────────────

/**
 * Compile the full vector field from the vault.
 *
 * 1. Read existing active-node embeddings → position vectors
 * 2. Compute half-life, trajectory, novelty per point
 * 3. Compute full pairwise covariance → coupling matrix
 * 4. Extract dependency graph
 * 5. Persist to disk
 */
export async function compileField({ vaultDir, derivedDir = DERIVED_DIR } = {}) {
  const startTime = Date.now();
  const allNodes = loadNodes(vaultDir || path.join(brainDir, 'memory-vault')).filter(n => n.status === 'active');
  const totalNodes = allNodes.length;
  const now = Date.now();

  logger.info('vector-field', `Compiling field from ${totalNodes} nodes...`);

  const ledger = readAccess(derivedDir);

  // ── Phase 1: Read stored vectors and compute physics ──
  const existingIndex = fs.existsSync(path.join(derivedDir, 'embeddings.db')) ? loadEmbeddingsIndex(derivedDir) : {};
  const points = [];
  let cached = 0;
  let missing = 0;
  let dimensions = null;

  for (const node of allNodes) {
    const embedding = existingIndex[node.slug]?.embedding;
    if (!Array.isArray(embedding) || !embedding.length || !embedding.every(Number.isFinite) ||
        !embedding.some(value => value !== 0) || (dimensions !== null && embedding.length !== dimensions)) {
      missing++;
      continue;
    }
    dimensions ??= embedding.length;
    cached++;

    // ── Physics computation ──
    const { accessCount, lastAccessed, elapsedMs, velocity, trajectory } = accessPhysics(node, ledger, now);
    const createdAt = new Date(node.created || now).getTime();
    const halfLife = computeHalfLife(node);
    const lambda = decayConstant(halfLife);

    // Novelty
    const novelty = computeNovelty(accessCount);

    // Peak relevance (baseline from importance + priority)
    const importanceWeight = (node.importance || 3) / 5;
    const priorityWeight = node.priority === 'absolute' ? 1.0 : node.priority === 'high' ? 0.8 : node.priority === 'normal' ? 0.5 : 0.3;
    const peakRelevance = Math.max(importanceWeight, priorityWeight);

    // Time since last access (for decay computation at sample time)
    const timeSinceAccess = elapsedMs;

    // Dependencies: extract from node.related field
    const dependencies = node.related ? (Array.isArray(node.related) ? node.related : String(node.related).split(',').map(s => s.trim())) : [];

    // Precompute L2 norm
    let mag = 0;
    for (let j = 0; j < embedding.length; j++) mag += embedding[j] * embedding[j];
    mag = Math.sqrt(mag);

    points.push({
      slug: node.slug,
      title: node.title || node.slug,
      category: node.category || 'unknown',
      layer: inferMemoryLayer(node),
      embedding,
      magnitude: mag,
      // ── Physics ──
      half_life: isFinite(halfLife) ? halfLife : null,  // null = infinite
      lambda,                                            // decay constant
      peak_relevance: peakRelevance,                     // R₀
      velocity,                                          // dR/dt
      trajectory,                                        // d²R/dt² (acceleration)
      novelty,                                           // information density
      // ── Metadata ──
      access_count: accessCount,
      last_accessed: lastAccessed,
      created_at: createdAt,
      time_since_access: timeSinceAccess,
      importance: node.importance || 3,
      priority: node.priority || 'normal',
      dependencies,
      body_length: (node.body || node.content || '').length,
    });
  }

  const embedMs = Date.now() - startTime;
  logger.info('vector-field', `Loaded ${cached} existing vectors; ${missing} missing or incompatible`);

  // ── Phase 2: Pairwise covariance matrix ──
  const N = points.length;
  const slugIndex = points.map(p => p.slug);
  const covariance = Array.from({ length: N }, () => new Float32Array(N));

  for (let i = 0; i < N; i++) {
    for (let j = i; j < N; j++) {
      if (i === j) {
        covariance[i][j] = 1.0;
      } else {
        const sim = fastCosine(points[i].embedding, points[j].embedding, points[i].magnitude, points[j].magnitude);
        covariance[i][j] = sim;
        covariance[j][i] = sim;
      }
    }
  }

  const covMs = Date.now() - startTime - embedMs;

  // ── Phase 3: Compile and persist ──
  const covarianceSerializable = covariance.map(row => Array.from(row));

  const field = {
    points,
    covariance: covarianceSerializable,
    slugIndex,
    compiled_at: now,
    dimensions: points[0]?.embedding?.length || 768,
    meta: {
      total_nodes: totalNodes,
      points_compiled: N,
      embedded_new: 0,
      missing_embeddings: missing,
      embedded_cached: cached,
      embed_ms: embedMs,
      covariance_ms: covMs,
      compile_ms: Date.now() - startTime,
      matrix_size: `${N}×${N}`,
      matrix_entries: N * N,
      infinite_halflife: points.filter(p => p.lambda === 0).length,
      with_dependencies: points.filter(p => p.dependencies.length > 0).length,
      avg_novelty: points.length > 0 ? Math.round((points.reduce((s, p) => s + p.novelty, 0) / points.length) * 1000) / 1000 : 0,
    },
  };

  const outPath = fieldPath(derivedDir);
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  atomicWrite(outPath, JSON.stringify(field));

  logger.info('vector-field', `Field compiled: ${N} points, ${N * N} couplings, ${field.meta.infinite_halflife} immortal, ${field.meta.with_dependencies} with deps, ${field.meta.compile_ms}ms`);

  return field;
}

/** Read live usage. Old ledgers have no daily counts, so their trend is unknown (zero). */
function accessPhysics(node, ledger, now) {
  const entry = ledger[node.slug];
  const accessCount = Math.max(0, Number(entry?.count ?? node.access_count ?? node.decay?.access_count) || 0);
  const lastAccessed = lastUsedMs(node, ledger);
  const days = activeDays(ledger).filter(day => day <= new Date(now).toISOString().slice(0, 10));
  const counts = [0, 1, 2].map(offset => Number(entry?.daily_counts?.[days.at(-1 - offset)]) || 0);
  const clamp = value => Math.max(-1, Math.min(1, value));
  return { accessCount, lastAccessed,
    elapsedMs: days.length ? activeDaysSince({ _active_days: days }, lastAccessed) * 86400000 : Math.max(0, now - lastAccessed),
    velocity: clamp((counts[0] - counts[1]) * .1),
    trajectory: clamp((counts[0] - 2 * counts[1] + counts[2]) * .1) };
}

/** Re-rank only recall candidates. No provider call or access write. */
export function rankWithField(results, { field, derivedDir = DERIVED_DIR, now = Date.now() } = {}) {
  if (!field) throw new Error('Vector field not compiled. Run total-recall recall --compile-field first.');
  const ledger = readAccess(derivedDir);
  const indexes = new Map(field.points.map((point, index) => [point.slug, index]));
  const ranked = results.map(result => {
    const index = result.type === 'session' ? undefined : indexes.get(result.slug);
    if (index === undefined) return result;
    const point = field.points[index];
    const physics = accessPhysics({ ...point, last_accessed: point.last_accessed, created: point.created_at }, ledger, now);
    const relevance = effectiveRelevance(point.peak_relevance, point.lambda, physics.elapsedMs, physics.trajectory);
    let coupling = 0, peers = 0;
    for (const candidate of results) {
      const other = candidate.type === 'session' ? undefined : indexes.get(candidate.slug);
      if (other === undefined || other === index) continue;
      coupling += Math.max(0, field.covariance[index][other]) * candidate.score;
      peers++;
    }
    // The base score remains the main signal. Missing vectors and sessions retain their score.
    const score = result.score * (.7 + .3 * relevance) + .05 * physics.velocity +
      .05 * computeNovelty(physics.accessCount) + .15 * (peers ? coupling / peers : 0);
    return { ...result, base_score: result.score, score: round4(score), field_score: round4(score) };
  });
  return ranked.sort((a, b) => b.score - a.score);
}

// ─── Fast Cosine ────────────────────────────────────────────────────────────

function fastCosine(a, b, magA, magB) {
  if (!a || !b || a.length !== b.length) return 0;
  const denom = magA * magB;
  if (denom === 0) return 0;
  let dot = 0;
  for (let i = 0; i < a.length; i++) dot += a[i] * b[i];
  return dot / denom;
}

// ─── Field Sampling ─────────────────────────────────────────────────────────

/**
 * Sample the vector field at a query point.
 *
 * Pipeline:
 *   1. Embed query → position in field
 *   2. Direct similarity to all points
 *   3. Apply half-life decay: R(t) = R₀ × e^(-λΔt) × trajectory_mod
 *   4. Entanglement propagation through covariance
 *   5. Novelty weighting (unseen info > repeated info)
 *   6. Dependency resolution (pull in required co-nodes)
 *   7. Interference detection (flag contradictions)
 *   8. Return ranked results
 */
export async function sampleField({
  query,
  field = null,
  topK = 20,
  entanglementBoost = 0.15,
  noveltyWeight = 0.1,
  derivedDir = DERIVED_DIR,
} = {}) {
  const startTime = Date.now();
  const now = Date.now();

  if (!field) {
    field = loadField(derivedDir);
    if (!field) throw new Error('Vector field not compiled. Run compileField() first.');
  }

  const ledger = readAccess(derivedDir);
  const points = field.points.map(point => {
    const usage = accessPhysics({ ...point, created: point.created_at }, ledger, now);
    return { ...point, velocity: usage.velocity, trajectory: usage.trajectory,
      novelty: computeNovelty(usage.accessCount), access_count: usage.accessCount,
      last_accessed: usage.lastAccessed, time_since_access: usage.elapsedMs };
  });
  const { covariance } = field;
  const N = points.length;
  if (N === 0) return { results: [], query_embedding: [], sample_ms: 0, interference: [] };

  // ── 1. Embed query ──
  const queryEmbedding = await getEmbedding(query);
  let queryMag = 0;
  for (let i = 0; i < queryEmbedding.length; i++) queryMag += queryEmbedding[i] * queryEmbedding[i];
  queryMag = Math.sqrt(queryMag);

  // ── 2. Direct similarity ──
  const directScores = new Float64Array(N);
  for (let i = 0; i < N; i++) {
    directScores[i] = fastCosine(queryEmbedding, points[i].embedding, queryMag, points[i].magnitude);
  }

  // ── 3. Half-life decay ──
  const decayedScores = new Float64Array(N);
  for (let i = 0; i < N; i++) {
    const p = points[i];
    const elapsed = p.time_since_access || 0;
    const decayedRelevance = effectiveRelevance(p.peak_relevance, p.lambda, elapsed, p.trajectory);
    // Blend: 70% similarity, 30% decayed relevance
    decayedScores[i] = (directScores[i] * 0.7) + (decayedRelevance * 0.3);
  }

  // ── 4. Entanglement propagation ──
  const propagatedScores = new Float64Array(N);
  for (let i = 0; i < N; i++) {
    let entSum = 0;
    for (let j = 0; j < N; j++) {
      if (i === j) continue;
      entSum += covariance[i][j] * decayedScores[j];
    }
    const avgEnt = N > 1 ? entSum / (N - 1) : 0;
    propagatedScores[i] = decayedScores[i] + (entanglementBoost * avgEnt);
  }

  // ── 5. Novelty weighting ──
  const finalScores = new Float64Array(N);
  for (let i = 0; i < N; i++) {
    finalScores[i] = propagatedScores[i] + (points[i].novelty * noveltyWeight);
    // Absolute priority floor
    if (points[i].priority === 'absolute') {
      finalScores[i] = Math.max(finalScores[i], 0.8);
    }
  }

  // ── 6. Rank ──
  const indexed = Array.from(finalScores).map((score, i) => ({ index: i, score }));
  indexed.sort((a, b) => b.score - a.score);
  let topResults = indexed.slice(0, topK);

  // ── 7. Dependency resolution — pull in required nodes ──
  const includedSlugs = new Set(topResults.map(r => points[r.index].slug));
  const depsPulledIn = [];
  for (const r of [...topResults]) {
    const p = points[r.index];
    for (const dep of p.dependencies) {
      if (!includedSlugs.has(dep)) {
        const depIdx = points.findIndex(pt => pt.slug === dep);
        if (depIdx >= 0) {
          topResults.push({ index: depIdx, score: finalScores[depIdx] });
          includedSlugs.add(dep);
          depsPulledIn.push(dep);
        }
      }
    }
  }
  // Re-sort after dependency injection
  topResults.sort((a, b) => b.score - a.score);
  topResults = topResults.slice(0, topK + depsPulledIn.length); // allow deps to exceed topK

  // ── 8. Interference detection ──
  const interference = detectInterference(topResults, points, covariance);

  // ── Format results ──
  const results = topResults.map(({ index, score }) => {
    const p = points[index];
    const elapsed = p.time_since_access || 0;
    const remainingHL = p.lambda > 0 ? Math.round((LN2 / p.lambda) / (24 * 60 * 60 * 1000)) : null;
    return {
      slug: p.slug,
      title: p.title,
      category: p.category,
      layer: p.layer,
      score: round4(score),
      direct_similarity: round4(directScores[index]),
      decayed_relevance: round4(decayedScores[index]),
      entanglement_boost: round4(propagatedScores[index] - decayedScores[index]),
      novelty: round4(p.novelty),
      velocity: round4(p.velocity),
      trajectory: round4(p.trajectory),
      half_life_days: remainingHL,
      time_since_access_hours: Math.round(elapsed / (60 * 60 * 1000) * 10) / 10,
      importance: p.importance,
      priority: p.priority,
      access_count: p.access_count,
      dependencies: p.dependencies,
      pulled_by_dependency: depsPulledIn.includes(p.slug),
    };
  });

  const sampleMs = Date.now() - startTime;
  recordAccess(derivedDir, results.map(r => r.slug));

  logger.info('vector-field', `Sampled in ${sampleMs}ms: ${results.length} results, ${depsPulledIn.length} deps pulled, ${interference.length} interference pairs`);

  return { results, query_embedding: queryEmbedding, sample_ms: sampleMs, interference, deps_pulled: depsPulledIn };
}

// ─── Interference Detection ─────────────────────────────────────────────────

/**
 * Detect constructive and destructive interference between included nodes.
 * Destructive: nodes with opposing modalities (must vs must_not) or
 *   semantically similar but from conflicting categories (correction vs pattern).
 * Constructive: nodes that reinforce each other (high covariance, same direction).
 */
function detectInterference(topResults, points, covariance) {
  const pairs = [];
  for (let i = 0; i < topResults.length; i++) {
    for (let j = i + 1; j < topResults.length; j++) {
      const pi = points[topResults[i].index];
      const pj = points[topResults[j].index];
      const cov = covariance[topResults[i].index]?.[topResults[j].index] || 0;

      // High similarity + opposing categories = potential destructive interference
      if (cov > 0.8) {
        const opposing =
          (pi.category === 'correction' && pj.category === 'pattern') ||
          (pi.category === 'pattern' && pj.category === 'correction') ||
          (pi.category === 'anti-pattern' && pj.category === 'pattern') ||
          (pi.category === 'pattern' && pj.category === 'anti-pattern');

        if (opposing) {
          pairs.push({
            type: 'destructive',
            a: pi.slug,
            b: pj.slug,
            coupling: round4(cov),
            reason: `${pi.category} ↔ ${pj.category} (opposing categories, high similarity)`,
          });
        } else {
          pairs.push({
            type: 'constructive',
            a: pi.slug,
            b: pj.slug,
            coupling: round4(cov),
            reason: 'reinforcing (high similarity, compatible categories)',
          });
        }
      }

      // Opposing velocities on similar topics = divergence signal
      if (cov > 0.7 && pi.velocity * pj.velocity < 0) {
        pairs.push({
          type: 'divergence',
          a: pi.slug,
          b: pj.slug,
          coupling: round4(cov),
          reason: `velocity divergence: ${pi.slug} ${pi.velocity > 0 ? '↑' : '↓'} vs ${pj.slug} ${pj.velocity > 0 ? '↑' : '↓'}`,
        });
      }
    }
  }
  return pairs;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function round4(n) { return Math.round(n * 10000) / 10000; }

// ─── Field Loading ──────────────────────────────────────────────────────────

let _cachedField = null;
let _cachedFieldStamp = null;

export function loadField(derivedDir = DERIVED_DIR) {
  try {
    const fp = fieldPath(derivedDir);
    if (!fs.existsSync(fp)) return null;
    const stat = fs.statSync(fp);
    const stamp = `${path.resolve(fp)}:${stat.mtimeMs}:${stat.ctimeMs}:${stat.size}`;
    if (_cachedField && stamp === _cachedFieldStamp) return _cachedField;
    const raw = JSON.parse(fs.readFileSync(fp, 'utf8'));
    if (!Array.isArray(raw.points) || !Array.isArray(raw.covariance) ||
        raw.covariance.length !== raw.points.length || raw.covariance.some(row =>
          !Array.isArray(row) || row.length !== raw.points.length || !row.every(Number.isFinite))) return null;
    _cachedField = raw;
    _cachedFieldStamp = stamp;
    return raw;
  } catch { return null; }
}

// ─── Field Statistics ───────────────────────────────────────────────────────

export function fieldStats(derivedDir = DERIVED_DIR) {
  const field = loadField(derivedDir);
  if (!field) return { compiled: false };

  const points = field.points || [];
  const ascending = points.filter(p => p.velocity > 0).length;
  const descending = points.filter(p => p.velocity < 0).length;
  const stable = points.filter(p => p.velocity === 0).length;
  const immortal = points.filter(p => p.lambda === 0).length;
  const accelerating = points.filter(p => p.trajectory > 0).length;
  const decelerating = points.filter(p => p.trajectory < 0).length;

  // Half-life distribution
  const hlBuckets = { immortal: 0, hours: 0, days: 0, weeks: 0, months: 0, years: 0 };
  for (const p of points) {
    if (p.lambda === 0) { hlBuckets.immortal++; continue; }
    const hlDays = p.half_life ? p.half_life / (24 * 60 * 60 * 1000) : 30;
    if (hlDays < 1) hlBuckets.hours++;
    else if (hlDays < 7) hlBuckets.days++;
    else if (hlDays < 30) hlBuckets.weeks++;
    else if (hlDays < 365) hlBuckets.months++;
    else hlBuckets.years++;
  }

  // Strongest couplings
  const couplings = [];
  const N = field.covariance?.length || 0;
  for (let i = 0; i < N; i++) {
    for (let j = i + 1; j < N; j++) {
      const v = field.covariance[i][j];
      if (Math.abs(v) > 0.7) {
        couplings.push({ a: field.slugIndex[i], b: field.slugIndex[j], coupling: round4(v) });
      }
    }
  }
  couplings.sort((a, b) => Math.abs(b.coupling) - Math.abs(a.coupling));

  return {
    compiled: true,
    compiled_at: new Date(field.compiled_at).toISOString(),
    dimensions: field.dimensions,
    points: points.length,
    matrix: `${N}×${N}`,
    velocities: { ascending, descending, stable },
    trajectories: { accelerating, decelerating, coasting: points.length - accelerating - decelerating },
    half_life_distribution: hlBuckets,
    immortal_nodes: immortal,
    avg_novelty: points.length > 0 ? round4(points.reduce((s, p) => s + p.novelty, 0) / points.length) : 0,
    strong_couplings: couplings.slice(0, 10),
    meta: field.meta,
  };
}
