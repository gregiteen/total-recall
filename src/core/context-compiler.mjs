/** Local task capsules: explicit required rules, ranked supporting knowledge, complete-render accounting. */

import { getNodes } from './vault-cache.mjs';
import crypto from 'node:crypto';
import { selectRules, assembleContext } from './context-policy.mjs';
import {
  getEmbedding,
  cosineSimilarity,
  loadEmbeddingsIndex,
} from './embeddings.mjs';
import { inferMemoryLayer, memoryLayerRoutingWeight } from './memory-layers.mjs';

// ─── Token Budget Defaults ──────────────────────────────────────────────────

const DEFAULT_BUDGET = { total: 4000 };

// Rough token estimation: ~4 chars per token (conservative)
const CHARS_PER_TOKEN = 4;

function estimateTokens(text) {
  if (!text) return 0;
  return Math.ceil(text.length / CHARS_PER_TOKEN);
}

// ─── Temporal Scoring ───────────────────────────────────────────────────────

/**
 * Compute temporal relevance boost for a vault node.
 * Same formula as search.mjs but extracted for reuse.
 */
function temporalScore(node) {
  if (!node) return 1.0;
  const now = Date.now();

  // Recency: exponential decay
  let recency = 1.0;
  const lastAccessed = node.last_accessed || node.updated || node.created;
  if (lastAccessed) {
    const ageMs = now - new Date(lastAccessed).getTime();
    const halfLifeDays = node.decay?.half_life_days || 7;
    const halfLifeMs = halfLifeDays * 24 * 60 * 60 * 1000;
    recency = Math.pow(0.5, ageMs / halfLifeMs);
    recency = Math.max(recency, 0.05);
  }

  // Confidence
  const confidence = typeof node.confidence === 'number' ? node.confidence : 1.0;
  const confidenceWeight = 0.5 + (confidence * 0.5);

  // Frequency
  const accessCount = node.decay?.access_count ?? 0;
  const frequencySignal = 1.0 + (Math.log10(accessCount + 1) * 0.2);

  // Importance
  const importance = typeof node.importance === 'number' ? node.importance : 3;
  const importanceBoost = 0.8 + ((importance - 1) * 0.1);

  // Priority
  const priorityBoost = node.priority === 'absolute' ? 1.3 : 1.0;

  // Layer
  const layer = inferMemoryLayer(node);
  const layerWeight = memoryLayerRoutingWeight(layer);

  const momentumBoost = node._momentum ? 1.25 : 1.0;
  return recency * confidenceWeight * frequencySignal * importanceBoost * priorityBoost * layerWeight * momentumBoost;
}

export async function compileContext({
  query = '', vaultDir, derivedDir, budget = {}, consumer = 'api',
  momentumSlugs = [], actions = [], projectRoot = process.cwd(), semantic = false,
  nodes, contributions = [], versionInputs = '',
} = {}) {
  const startTime = Date.now();
  const b = { ...DEFAULT_BUDGET, total: 4000, ...budget };
  const allNodes = (nodes || getNodes(vaultDir)).map(n => ({ ...n }));
  const rules = selectRules(allNodes, { actions, projectRoot });
  const required = rules.map(n => ({ id: `${n._layer || 'project'}:${n.slug}`, required: true,
    text: `## ${n.title || n.slug} [${n.slug}]\n\n${(n.body || n.content || '').trim()}` }));
  let queryEmbedding = null, embeddingsIndex = {};
  if (semantic && query) {
    try { queryEmbedding = await getEmbedding(String(query)); embeddingsIndex = loadEmbeddingsIndex(derivedDir); } catch { /* local ranking remains usable */ }
  }
  const terms = String(query).toLowerCase().match(/[\p{L}\p{N}_-]+/gu) || [];
  const selectedIds = new Set(rules.map(n => n.slug));
  const candidates = allNodes.filter(n => n.status === 'active' && !selectedIds.has(n.slug) &&
    !['invariants', 'preferences', 'anti-patterns'].includes(n.category)).map(n => {
    const text = `${n.title || ''} ${n.body || n.content || ''}`.toLowerCase();
    const overlap = terms.filter(term => text.includes(term)).length;
    const sim = queryEmbedding && embeddingsIndex[n.slug] ? cosineSimilarity(queryEmbedding, embeddingsIndex[n.slug].embedding) : 0;
    return { node: n, relevant: overlap > 0 || sim > .2 || momentumSlugs.includes(n.slug),
      score: overlap + sim + temporalScore(n) * .01 + (momentumSlugs.includes(n.slug) ? .1 : 0) };
  }).filter(candidate => candidate.relevant).sort((a, b) => b.score - a.score);
  const optional = candidates.map(({ node: n }) => ({ id: `${n._layer || 'project'}:${n.slug}`,
    text: `## ${n.title || n.slug} [${n.slug}]\n\n${(n.body || n.content || '').trim()}` }));
  const result = assembleContext([...required, ...optional, ...contributions], { total: b.total });
  result.stats.total_nodes = allNodes.length;
  result.stats.compile_ms = Date.now() - startTime;
  result.stats.consumer = consumer;
  result.stats.actions = actions;
  result.stats.unresolved_contradictions = rules.flatMap(node => (node.contradicts || [])
    .filter(slug => rules.some(other => other.slug === slug)).map(slug => [node.slug, slug]));
  result.stats.version = crypto.createHash('sha256').update(JSON.stringify({
    policy: 1, projectRoot, actions, versionInputs, nodes: allNodes, capsule: result.stats.version,
  })).digest('hex');
  result.stats.mode = queryEmbedding ? 'semantic' : 'local';
  result.stats.slots = { invariants: { nodes: rules.filter(n => n.category === 'invariants').length,
    tokens: result.stats.required_tokens } };
  result.stats.slots_filled = result.stats.contributions.length;
  return result;
}

/**
 * Lightweight variant that returns pre-scored candidates without embedding lookup.
 * Used for fast context previews and budget estimation.
 */
export function previewContext({ vaultDir, budget = {} } = {}) {
  const b = { ...DEFAULT_BUDGET, ...budget };
  const allNodes = getNodes(vaultDir).map(n => ({ ...n }));
  const active = allNodes.filter(n => n.status === 'active');

  const candidates = active.map(node => ({
    slug: node.slug,
    category: node.category,
    title: node.title,
    temporal_score: temporalScore(node),
    tokens: estimateTokens(node.body || node.content || ''),
    layer: inferMemoryLayer(node),
    priority: node.priority || 'normal',
    importance: node.importance || 3,
    confidence: node.confidence ?? 1.0,
    last_accessed: node.last_accessed || null,
  }));

  candidates.sort((a, b) => b.temporal_score - a.temporal_score);

  return {
    candidates,
    budget: b,
    total_candidates: candidates.length,
    total_tokens: candidates.reduce((sum, c) => sum + c.tokens, 0),
  };
}
