/**
 * src/core/search.mjs
 *
 * Canonical semantic search logic — searches vault nodes and session history
 * by meaning via embedding vector similarity. Called by both the MCP layer and REST API.
 *
 * MCP and REST are thin wrappers; all logic lives here.
 */

import { getNodes } from './vault-cache.mjs';
import {
  getEmbedding,
  cosineSimilarity,
  loadEmbeddingsIndex,
  loadSessionEmbeddingsIndex,
} from './embeddings.mjs';
import { inferMemoryLayer, memoryLayerRoutingWeight } from './memory-layers.mjs';
import { VectorStore } from './vector-store.mjs';

/**
 * Compute a temporal relevance boost for a vault node.
 * Blends recency, confidence, access frequency, importance,
 * memory layer, and priority into a multiplier applied to
 * cosine similarity scores.
 *
 * Range: ~0.2 (cold/stale/research-tier) to ~2.0 (hot/absolute/conscious)
 * Neutral (no temporal data): 1.0 (pure cosine similarity)
 *
 * @param {object|null} node - The vault node with frontmatter fields
 * @returns {number} Temporal boost multiplier
 */
function computeTemporalBoost(node) {
  if (!node) return 1.0;
  const now = Date.now();

  // ── Recency: exponential decay from last_accessed ──
  // Uses the node's own half_life_days if set, otherwise 7 days default
  let recency = 1.0;
  const lastAccessed = node.last_accessed || node.updated || node.created;
  if (lastAccessed) {
    const ageMs = now - new Date(lastAccessed).getTime();
    const halfLifeDays = node.decay?.half_life_days || 7;
    const halfLifeMs = halfLifeDays * 24 * 60 * 60 * 1000;
    recency = Math.pow(0.5, ageMs / halfLifeMs);
    recency = Math.max(recency, 0.05); // floor: never fully invisible
  }

  // ── Confidence: linear weight ──
  // confidence 1.0 → 1.0, confidence 0.5 → 0.75, confidence 0 → 0.5
  const confidence = typeof node.confidence === 'number' ? node.confidence : 1.0;
  const confidenceWeight = 0.5 + (confidence * 0.5);

  // ── Access frequency: log scale (from decay.access_count) ──
  // 0 accesses → 1.0, 10 accesses → 1.23, 100 accesses → 1.46
  const accessCount = node.decay?.access_count ?? 0;
  const frequencySignal = 1.0 + (Math.log10(accessCount + 1) * 0.2);

  // ── Importance tier: linear boost ──
  // importance 1 → 0.8, 3 → 1.0, 5 → 1.2
  const importance = typeof node.importance === 'number' ? node.importance : 3;
  const importanceBoost = 0.8 + ((importance - 1) * 0.1);

  // ── Priority override ──
  // absolute priority nodes get a fixed boost to ensure they rank highly
  const priorityBoost = node.priority === 'absolute' ? 1.3 : 1.0;

  // ── Memory layer routing weight ──
  // conscious=1.25, system2=1.0, research=0.75
  const layer = inferMemoryLayer(node);
  const layerWeight = memoryLayerRoutingWeight(layer);

  return recency * confidenceWeight * frequencySignal * importanceBoost * priorityBoost * layerWeight;
}

/**
 * Run a semantic search across vault nodes and/or session history.
 *
 * @param {string} query                   Natural language query
 * @param {object} opts
 * @param {string} opts.vaultDir
 * @param {string} opts.derivedDir
 * @param {number} [opts.top_k=5]          Max results to return (capped at 20)
 * @param {boolean} [opts.includeSessions=true]  Include session chunk results
 *
 * @returns {Promise<Array<{
 *   type: 'vault' | 'session',
 *   score: number,
 *   // vault fields: slug, title, category, tags, ...
 *   // session fields: key, session_id, snippet, chunk, total_chunks
 * }>>}
 */
export async function semanticSearch(query, { 
  vaultDir, 
  derivedDir, 
  top_k = 5, 
  includeSessions = true,
  category = null,
  tags = null,
  modality = null,
  importance = null,
  priority = null
} = {}) {
  const k = Math.min(Number(top_k) || 5, 20);

  // 1. Load nodes and apply filters
  const allNodes = getNodes(vaultDir);
  let filteredNodes = allNodes;

  if (category) {
    const catLower = category.toLowerCase();
    filteredNodes = filteredNodes.filter(n => n.category && n.category.toLowerCase() === catLower);
  }
  if (tags && tags.length > 0) {
    filteredNodes = filteredNodes.filter(n => n.tags && tags.some(t => n.tags.includes(t)));
  }
  if (modality) {
    const modLower = modality.toLowerCase();
    filteredNodes = filteredNodes.filter(n => n.modality && n.modality.toLowerCase() === modLower);
  }
  if (importance !== null && importance !== undefined) {
    const minImp = parseInt(importance, 10);
    filteredNodes = filteredNodes.filter(n => {
      const val = parseInt(n.importance, 10);
      return !isNaN(val) && val >= minImp;
    });
  }
  if (priority) {
    const prioLower = priority.toLowerCase();
    filteredNodes = filteredNodes.filter(n => n.priority && n.priority.toLowerCase() === prioLower);
  }

  const filteredSlugs = new Set(filteredNodes.map(n => n.slug));
  const results = [];

  // Get query embedding
  let queryEmbedding = null;
  try {
    queryEmbedding = await getEmbedding(String(query));
  } catch (err) {
    // Gracefully ignore embedding generation errors
  }

  const vaultIndex = loadEmbeddingsIndex(derivedDir);
  const vaultEntries = Object.entries(vaultIndex);

  // 2. Perform Semantic Search Channel (if embedding & index available)
  let semanticRanked = [];
  if (queryEmbedding && vaultEntries.length > 0) {
    const store = new VectorStore();
    store.load(vaultIndex);
    const matches = store.search(queryEmbedding, filteredNodes.length, filteredSlugs, cosineSimilarity);
    
    semanticRanked = matches.map(({ slug, similarity }) => {
      const node = filteredNodes.find(n => n.slug === slug);
      const temporal = computeTemporalBoost(node);
      return { slug, score: similarity * temporal };
    });
  }

  // 3. Perform Lexical Search Channel (Keyword matcher)
  const qLower = String(query).toLowerCase();
  let lexicalRanked = [];
  for (const node of filteredNodes) {
    let rawLexicalScore = 0;
    const slug = String(node.slug || '').toLowerCase();
    const title = String(node.title || '').toLowerCase();
    const body = String(node.body || '').toLowerCase();
    const nTags = Array.isArray(node.tags) ? node.tags.map(t => String(t).toLowerCase()) : [];

    if (slug === qLower || title === qLower) {
      rawLexicalScore = 1.0;
    } else if (slug.includes(qLower) || title.includes(qLower)) {
      rawLexicalScore = 0.8;
    } else if (nTags.some(t => t.includes(qLower))) {
      rawLexicalScore = 0.7;
    } else if (body.includes(qLower)) {
      rawLexicalScore = 0.5;
    }

    if (rawLexicalScore > 0) {
      const temporal = computeTemporalBoost(node);
      lexicalRanked.push({ slug: node.slug, score: rawLexicalScore * temporal });
    }
  }
  lexicalRanked.sort((a, b) => b.score - a.score);

  // 4. Blend Rankings via Reciprocal Rank Fusion (RRF)
  let blendedRanked = [];
  if (semanticRanked.length > 0) {
    const rrfMap = new Map();
    const RRF_K = 60; // Standard RRF parameter constant

    // Index rank positions (1-indexed)
    semanticRanked.forEach((item, index) => {
      rrfMap.set(item.slug, 1 / (RRF_K + (index + 1)));
    });

    lexicalRanked.forEach((item, index) => {
      const semScore = rrfMap.get(item.slug) || 0;
      rrfMap.set(item.slug, semScore + (1 / (RRF_K + (index + 1))));
    });

    // Convert back, score, and sort
    blendedRanked = Array.from(rrfMap.entries())
      .map(([slug, rrfScore]) => {
        const node = filteredNodes.find(n => n.slug === slug);
        // Normalize RRF score to [0, 1] relative to theoretical max of 2/60 (rank 1 in both)
        const maxPossibleRrf = 2 / RRF_K;
        const normalizedScore = rrfScore / maxPossibleRrf;
        return { node, score: Math.round(normalizedScore * 1000) / 1000 };
      })
      .sort((a, b) => b.score - a.score);
  } else {
    // If semantic search is unavailable, fallback entirely to lexical ranking
    blendedRanked = lexicalRanked.map(item => {
      const node = filteredNodes.find(n => n.slug === item.slug);
      return { node, score: Math.round(item.score * 1000) / 1000 };
    });
  }

  // Slice top results
  for (const { node, score } of blendedRanked.slice(0, k)) {
    if (node) {
      results.push({ ...node, type: 'vault', score });
    }
  }

  // 5. Sessions Search Channel
  const hasMetaFilters = category || (tags && tags.length > 0) || modality || importance !== null || priority;
  const activeIncludeSessions = hasMetaFilters ? false : includeSessions;

  if (activeIncludeSessions) {
    const sessionIndex = loadSessionEmbeddingsIndex(derivedDir);
    const sessionEntries = Object.entries(sessionIndex);

    if (queryEmbedding && sessionEntries.length > 0) {
      const scored = sessionEntries
        .map(([key, entry]) => ({
          key,
          session_id:   entry.session_id || key,
          score:        cosineSimilarity(queryEmbedding, entry.embedding),
          snippet:      entry.snippet,
          chunk:        entry.chunk,
          total_chunks: entry.total_chunks,
        }))
        .sort((a, b) => b.score - a.score)
        .slice(0, k);

      for (const { key, session_id, score, snippet, chunk, total_chunks } of scored) {
        results.push({ type: 'session', key, session_id, snippet, chunk, total_chunks, score: Math.round(score * 1000) / 1000 });
      }
    } else {
      // Lexical Fallback for Sessions
      try {
        const scoredText = [];
        for (const [key, entry] of sessionEntries) {
          const snippet = String(entry.snippet || '').toLowerCase();
          if (snippet.includes(qLower)) {
            scoredText.push({
              type: 'session',
              key,
              session_id: entry.session_id || key,
              score: 0.5,
              snippet: entry.snippet,
              chunk: entry.chunk,
              total_chunks: entry.total_chunks
            });
          }
        }
        scoredText.sort((a, b) => b.score - a.score);
        for (const r of scoredText.slice(0, k)) {
          results.push(r);
        }
      } catch {}
    }
  }

  results.sort((a, b) => b.score - a.score);
  const finalResults = results.slice(0, k);
  if (!queryEmbedding || vaultEntries.length === 0) {
    finalResults.degradedTextSearch = true;
  }

  return finalResults;
}
