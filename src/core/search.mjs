/**
 * src/core/search.mjs
 *
 * Canonical semantic search logic — searches vault nodes and session history
 * by meaning via Ollama embeddings. Called by both the MCP layer and REST API.
 *
 * MCP and REST are thin wrappers; all logic lives here.
 */

import { loadNodes } from './vault.mjs';
import {
  getEmbedding,
  cosineSimilarity,
  loadEmbeddingsIndex,
  loadSessionEmbeddingsIndex,
} from './embeddings.mjs';

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
  let queryEmbedding = null;
  try {
    queryEmbedding = await getEmbedding(String(query));
  } catch (err) {
    // Gracefully ignore embedding generation errors to allow text search fallback
  }
  const results = [];

  // If metadata filters are active, session log search is automatically bypassed
  const hasMetaFilters = category || (tags && tags.length > 0) || modality || importance !== null || priority;
  const activeIncludeSessions = hasMetaFilters ? false : includeSessions;

  // ── Vault nodes ────────────────────────────────────────────────────────────
  const vaultIndex = loadEmbeddingsIndex(derivedDir);
  const vaultEntries = Object.entries(vaultIndex);

  if (queryEmbedding && vaultEntries.length > 0) {
    let filteredNodes = loadNodes(vaultDir);

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

    const scored = vaultEntries
      .filter(([slug]) => filteredSlugs.has(slug))
      .map(([slug, { embedding }]) => ({ slug, score: cosineSimilarity(queryEmbedding, embedding) }))
      .sort((a, b) => b.score - a.score)
      .slice(0, k);

    for (const { slug, score } of scored) {
      const node = filteredNodes.find(n => n.slug === slug);
      if (node) {
        results.push({ ...node, type: 'vault', score: Math.round(score * 1000) / 1000 });
      }
    }
  } else {
    // ── Text Search Fallback for Vault Nodes ──
    try {
      let filteredNodes = loadNodes(vaultDir);

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

      const qLower = String(query).toLowerCase();
      const scoredText = [];

      for (const node of filteredNodes) {
        let score = 0;
        const slug = String(node.slug || '').toLowerCase();
        const title = String(node.title || '').toLowerCase();
        const body = String(node.body || '').toLowerCase();
        const nTags = Array.isArray(node.tags) ? node.tags.map(t => String(t).toLowerCase()) : [];

        if (slug === qLower || title === qLower) {
          score = 0.9;
        } else if (slug.includes(qLower) || title.includes(qLower)) {
          score = 0.7;
        } else if (nTags.some(t => t.includes(qLower))) {
          score = 0.6;
        } else if (body.includes(qLower)) {
          score = 0.5;
        }

        if (score > 0) {
          scoredText.push({ node, score });
        }
      }

      scoredText.sort((a, b) => b.score - a.score);
      for (const { node, score } of scoredText.slice(0, k)) {
        results.push({ ...node, type: 'vault', score });
      }
    } catch {
      // Gracefully ignore filesystem reading issues
    }
  }

  // ── Sessions ───────────────────────────────────────────────────────────────
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
      // ── Text Search Fallback for Sessions ──
      try {
        const qLower = String(query).toLowerCase();
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
