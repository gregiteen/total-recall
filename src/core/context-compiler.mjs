/**
 * src/core/context-compiler.mjs
 *
 * Streaming Context Compiler — Dynamic per-request context assembly.
 *
 * The traditional surface compiler produces a STATIC INSTRUCTIONS.md
 * that is injected wholesale into every agent turn. This module replaces
 * that with a DYNAMIC context document assembled per-request from the
 * vault, scored by temporal relevance, and packed within a token budget.
 *
 * Architecture:
 *   1. CLASSIFY — route query to relevant domains
 *   2. RETRIEVE — pull candidate nodes from vault
 *   3. SCORE — rank by temporal_boost × semantic_similarity
 *   4. BUDGET — pack into token budget via greedy knapsack
 *   5. ASSEMBLE — build final context string from variable slots
 *
 * Variable Slots:
 *   ${identity}      — agent identity (lore nodes, minimal)
 *   ${invariants}    — absolute rules (always present, priority: absolute)
 *   ${corrections}   — active corrections relevant to query domain
 *   ${preferences}   — user preferences relevant to query domain
 *   ${facts}         — domain facts retrieved by similarity
 *   ${decisions}     — relevant design decisions
 *   ${patterns}      — applicable patterns/anti-patterns
 *   ${skills}        — routed SKILL.md content
 *   ${sessions}      — relevant prior session context
 *
 * Every token earns its place through relevance. Nothing is injected by default.
 */

import { getNodes } from './vault-cache.mjs';
import {
  getEmbedding,
  cosineSimilarity,
  loadEmbeddingsIndex,
  loadSessionEmbeddingsIndex,
} from './embeddings.mjs';
import { inferMemoryLayer, memoryLayerRoutingWeight } from './memory-layers.mjs';
import { logger } from './logger.mjs';

// ─── Token Budget Defaults ──────────────────────────────────────────────────

const DEFAULT_BUDGET = {
  total: 12000,          // max tokens for compiled context
  identity: 200,         // lore/identity ceiling
  invariants: 2000,      // absolute rules ceiling
  corrections: 1000,     // corrections ceiling
  preferences: 500,      // preferences ceiling
  facts: 3000,           // domain facts ceiling
  decisions: 1500,       // design decisions ceiling
  patterns: 1500,        // patterns + anti-patterns ceiling
  skills: 3000,          // skill instructions ceiling
  sessions: 1500,        // session continuity ceiling
};

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

// ─── Node Formatting ────────────────────────────────────────────────────────

function formatNode(node) {
  const body = (node.body || node.content || '').trim();
  if (!body) return '';
  return body.startsWith('-') ? body : `- ${body}`;
}

function formatNodeWithMeta(node) {
  const body = (node.body || node.content || '').trim();
  if (!body) return '';
  const meta = [];
  if (node.title) meta.push(node.title);
  if (node.slug) meta.push(`[${node.slug}]`);
  const prefix = meta.length > 0 ? `**${meta.join(' ')}**: ` : '';
  return `${prefix}${body}`;
}

// ─── Context Slot Resolvers ─────────────────────────────────────────────────

/**
 * Resolve the invariants slot. These are ALWAYS included (guaranteed budget).
 * Only absolute-priority and active invariants.
 */
function resolveInvariants(nodes, budget) {
  const invariants = nodes
    .filter(n => n.category === 'invariants' && n.status === 'active')
    .sort((a, b) => {
      // absolute priority first, then by importance desc
      if (a.priority === 'absolute' && b.priority !== 'absolute') return -1;
      if (b.priority === 'absolute' && a.priority !== 'absolute') return 1;
      return (b.importance || 3) - (a.importance || 3);
    });

  let result = '';
  let tokens = 0;
  for (const node of invariants) {
    const text = formatNode(node);
    const t = estimateTokens(text);
    if (tokens + t > budget) break;
    result += text + '\n';
    tokens += t;
  }
  return { text: result.trim(), tokens };
}

/**
 * Resolve a category slot with temporal scoring.
 * Returns top nodes by temporal score within budget.
 */
function resolveCategory(nodes, category, budget, queryEmbedding, embeddingsIndex) {
  const candidates = nodes.filter(n => n.category === category && n.status === 'active');
  if (candidates.length === 0) return { text: '', tokens: 0 };

  // Score each candidate
  const scored = candidates.map(node => {
    let score = temporalScore(node);

    // Blend with semantic similarity if embedding available
    if (queryEmbedding && embeddingsIndex[node.slug]) {
      const sim = cosineSimilarity(queryEmbedding, embeddingsIndex[node.slug].embedding);
      // Semantic similarity has strong weight for non-invariant categories
      score *= (0.3 + sim * 0.7);
    }

    return { node, score };
  });

  // Sort by score descending
  scored.sort((a, b) => b.score - a.score);

  // Pack into budget
  let result = '';
  let tokens = 0;
  for (const { node } of scored) {
    const text = formatNode(node);
    const t = estimateTokens(text);
    if (tokens + t > budget) break;
    result += text + '\n';
    tokens += t;
  }
  return { text: result.trim(), tokens };
}

/**
 * Resolve session context with temporal and semantic scoring.
 */
function resolveSessions(derivedDir, budget, queryEmbedding) {
  if (!queryEmbedding || !derivedDir) return { text: '', tokens: 0 };

  const sessionIndex = loadSessionEmbeddingsIndex(derivedDir);
  const entries = Object.entries(sessionIndex);
  if (entries.length === 0) return { text: '', tokens: 0 };

  const now = Date.now();
  const scored = entries.map(([key, entry]) => {
    const sim = cosineSimilarity(queryEmbedding, entry.embedding);
    // Temporal boost for sessions: recent sessions score higher
    const generatedAt = entry.generated_at ? new Date(entry.generated_at).getTime() : now;
    const ageMs = now - generatedAt;
    const halfLifeMs = 3 * 24 * 60 * 60 * 1000; // 3 day half-life for sessions
    const recency = Math.max(Math.pow(0.5, ageMs / halfLifeMs), 0.05);
    return { key, entry, score: sim * recency };
  });

  scored.sort((a, b) => b.score - a.score);

  let result = '';
  let tokens = 0;
  for (const { entry } of scored) {
    const snippet = entry.snippet || '';
    if (!snippet) continue;
    const text = `> ${snippet}`;
    const t = estimateTokens(text);
    if (tokens + t > budget) break;
    result += text + '\n';
    tokens += t;
  }
  return { text: result.trim(), tokens };
}

// ─── Main Compiler ──────────────────────────────────────────────────────────

/**
 * Compile a dynamic context document for a specific query.
 *
 * @param {object} opts
 * @param {string} opts.query - The user query/task description
 * @param {string} opts.vaultDir - Path to the vault
 * @param {string} opts.derivedDir - Path to derived indexes
 * @param {object} [opts.budget] - Token budget overrides per slot
 * @param {string} [opts.consumer='api'] - 'api' or 'ide'
 * @param {string[]} [opts.momentumSlugs] - Recent node slugs for momentum boost
 * @returns {Promise<{ context: string, stats: object }>}
 */
export async function compileContext({
  query,
  vaultDir,
  derivedDir,
  budget = {},
  consumer = 'api',
  momentumSlugs = [],
} = {}) {
  const startTime = Date.now();
  const b = { ...DEFAULT_BUDGET, ...budget };
  const allNodes = getNodes(vaultDir).map(n => ({ ...n }));
  const stats = { total_nodes: allNodes.length, slots: {} };

  // ── Generate query embedding for semantic scoring ──
  let queryEmbedding = null;
  try {
    if (query) {
      queryEmbedding = await getEmbedding(String(query));
    }
  } catch { /* graceful degradation */ }

  // ── Load embeddings index for similarity scoring ──
  let embeddingsIndex = {};
  try {
    embeddingsIndex = loadEmbeddingsIndex(derivedDir);
  } catch { /* graceful degradation */ }

  // ── Apply momentum boost to recently-touched nodes ──
  if (momentumSlugs.length > 0) {
    const momentumSet = new Set(momentumSlugs);
    for (const node of allNodes) {
      if (momentumSet.has(node.slug)) {
        // Temporarily boost last_accessed to now for momentum nodes
        node._momentum = true;
      }
    }
  }

  // ── Resolve each variable slot ──
  const sections = [];
  let totalTokens = 0;

  // SLOT 1: Invariants (guaranteed — always present)
  const invariants = resolveInvariants(allNodes, b.invariants);
  if (invariants.text) {
    sections.push({ label: 'Rules', content: invariants.text });
    totalTokens += invariants.tokens;
    stats.slots.invariants = { nodes: invariants.text.split('\n').length, tokens: invariants.tokens };
  }

  // SLOT 2: Corrections (query-relevant anti-patterns)
  const remaining = b.total - totalTokens;
  const corrections = resolveCategory(allNodes, 'anti-patterns', Math.min(b.corrections, remaining), queryEmbedding, embeddingsIndex);
  if (corrections.text) {
    sections.push({ label: 'Corrections', content: corrections.text });
    totalTokens += corrections.tokens;
    stats.slots.corrections = { tokens: corrections.tokens };
  }

  // SLOT 3: Preferences (query-relevant)
  const prefBudget = Math.min(b.preferences, b.total - totalTokens);
  const preferences = resolveCategory(allNodes, 'preferences', prefBudget, queryEmbedding, embeddingsIndex);
  if (preferences.text) {
    sections.push({ label: 'Preferences', content: preferences.text });
    totalTokens += preferences.tokens;
    stats.slots.preferences = { tokens: preferences.tokens };
  }

  // SLOT 4: Facts (semantically retrieved domain knowledge)
  const factBudget = Math.min(b.facts, b.total - totalTokens);
  const facts = resolveCategory(allNodes, 'facts', factBudget, queryEmbedding, embeddingsIndex);
  if (facts.text) {
    sections.push({ label: 'Context', content: facts.text });
    totalTokens += facts.tokens;
    stats.slots.facts = { tokens: facts.tokens };
  }

  // SLOT 5: Decisions (relevant design decisions)
  const decBudget = Math.min(b.decisions, b.total - totalTokens);
  const decisions = resolveCategory(allNodes, 'decisions', decBudget, queryEmbedding, embeddingsIndex);
  if (decisions.text) {
    sections.push({ label: 'Decisions', content: decisions.text });
    totalTokens += decisions.tokens;
    stats.slots.decisions = { tokens: decisions.tokens };
  }

  // SLOT 6: Patterns + Anti-patterns
  const patBudget = Math.min(b.patterns, b.total - totalTokens);
  const patterns = resolveCategory(allNodes, 'patterns', patBudget, queryEmbedding, embeddingsIndex);
  if (patterns.text) {
    sections.push({ label: 'Patterns', content: patterns.text });
    totalTokens += patterns.tokens;
    stats.slots.patterns = { tokens: patterns.tokens };
  }

  // SLOT 7: Concepts (deep understanding nodes)
  const conBudget = Math.min(b.facts, b.total - totalTokens); // shares budget class with facts
  const concepts = resolveCategory(allNodes, 'concepts', conBudget, queryEmbedding, embeddingsIndex);
  if (concepts.text) {
    sections.push({ label: 'Concepts', content: concepts.text });
    totalTokens += concepts.tokens;
    stats.slots.concepts = { tokens: concepts.tokens };
  }

  // SLOT 8: Lore (identity, only if relevant)
  const loreBudget = Math.min(b.identity, b.total - totalTokens);
  const lore = resolveCategory(allNodes, 'lore', loreBudget, queryEmbedding, embeddingsIndex);
  if (lore.text) {
    sections.push({ label: 'Identity', content: lore.text });
    totalTokens += lore.tokens;
    stats.slots.lore = { tokens: lore.tokens };
  }

  // SLOT 9: Sessions (prior conversation context)
  const sessBudget = Math.min(b.sessions, b.total - totalTokens);
  const sessions = resolveSessions(derivedDir, sessBudget, queryEmbedding);
  if (sessions.text) {
    sections.push({ label: 'Prior Context', content: sessions.text });
    totalTokens += sessions.tokens;
    stats.slots.sessions = { tokens: sessions.tokens };
  }

  // ── Assemble final context ──
  const context = sections
    .map(s => `## ${s.label}\n\n${s.content}`)
    .join('\n\n---\n\n');

  stats.total_tokens = totalTokens;
  stats.budget_used = totalTokens;
  stats.budget_remaining = b.total - totalTokens;
  stats.compile_ms = Date.now() - startTime;
  stats.slots_filled = sections.length;

  logger.info('context-compiler', `Compiled ${sections.length} slots, ${totalTokens} tokens in ${stats.compile_ms}ms`);

  return { context, stats };
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
