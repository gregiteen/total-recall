/**
 * src/core/embeddings.mjs
 *
 * Ollama-backed embedding generation + cosine similarity for semantic vault search.
 *
 * Index file: .agent/memory-derived/embeddings.json
 *   { [slug]: { embedding: number[], model: string, generated_at: string } }
 *
 * Embedding model: nomic-embed-text (274MB, runs locally on Ollama)
 *   Install: ollama pull nomic-embed-text
 *
 * Supports both Ollama API versions:
 *   New (>= 0.3.6): POST /api/embed   { model, input }  → { embeddings: [[...]] }
 *   Old:            POST /api/embeddings { model, prompt } → { embedding: [...] }
 */

import fs from 'node:fs';
import path from 'node:path';

const DEFAULT_OLLAMA_URL = process.env.OLLAMA_URL || 'http://127.0.0.1:11434';
const DEFAULT_EMBED_MODEL = process.env.TR_EMBED_MODEL || 'nomic-embed-text';

// ─── Embedding generation ────────────────────────────────────────────────────

/**
 * Get an embedding vector for the given text from Ollama.
 * Tries the new /api/embed endpoint first, falls back to /api/embeddings.
 *
 * @param {string} text
 * @param {string} [ollamaUrl]
 * @param {string} [model]
 * @returns {Promise<number[]>}
 */
export async function getEmbedding(text, ollamaUrl = DEFAULT_OLLAMA_URL, model = DEFAULT_EMBED_MODEL) {
  const input = String(text).slice(0, 8000); // cap at 8k chars — safe for all embed models

  // Try new API: POST /api/embed { model, input } → { embeddings: [[...]] }
  try {
    const res = await fetch(`${ollamaUrl}/api/embed`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, input }),
      signal: AbortSignal.timeout(30000),
    });
    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data.embeddings?.[0])) return data.embeddings[0];
    }
  } catch { /* fall through to old API */ }

  // Fall back to old API: POST /api/embeddings { model, prompt } → { embedding: [...] }
  const res = await fetch(`${ollamaUrl}/api/embeddings`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model, prompt: input }),
    signal: AbortSignal.timeout(30000),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Ollama embedding API error ${res.status}: ${body || 'no response body'}`);
  }

  const data = await res.json();
  if (!Array.isArray(data.embedding)) {
    throw new Error(`Ollama returned no embedding. Is '${model}' installed? Run: ollama pull ${model}`);
  }
  return data.embedding;
}

// ─── Cosine similarity ───────────────────────────────────────────────────────

/**
 * Compute cosine similarity between two equal-length vectors.
 * Returns a value in [-1, 1] where 1 = identical direction.
 *
 * @param {number[]} a
 * @param {number[]} b
 * @returns {number}
 */
export function cosineSimilarity(a, b) {
  if (!a || !b || a.length !== b.length) return 0;
  let dot = 0, magA = 0, magB = 0;
  for (let i = 0; i < a.length; i++) {
    dot  += a[i] * b[i];
    magA += a[i] * a[i];
    magB += b[i] * b[i];
  }
  const denom = Math.sqrt(magA) * Math.sqrt(magB);
  return denom === 0 ? 0 : dot / denom;
}

// ─── Index file helpers ──────────────────────────────────────────────────────

function indexPath(derivedDir) {
  return path.join(derivedDir, 'embeddings.json');
}

/**
 * Load the full embeddings index from disk.
 * Returns {} if the file doesn't exist or is corrupt.
 *
 * @param {string} derivedDir
 * @returns {Record<string, { embedding: number[], model: string, generated_at: string }>}
 */
export function loadEmbeddingsIndex(derivedDir) {
  const p = indexPath(derivedDir);
  if (!fs.existsSync(p)) return {};
  try { return JSON.parse(fs.readFileSync(p, 'utf8')); }
  catch { return {}; }
}

/**
 * Write one slug's embedding into the index (merges, does not replace whole file).
 *
 * @param {string} derivedDir
 * @param {string} slug
 * @param {number[]} embedding
 * @param {string} [model]
 */
export function saveEmbeddingToIndex(derivedDir, slug, embedding, model = DEFAULT_EMBED_MODEL) {
  fs.mkdirSync(derivedDir, { recursive: true });
  const index = loadEmbeddingsIndex(derivedDir);
  index[slug] = { embedding, model, generated_at: new Date().toISOString() };
  fs.writeFileSync(indexPath(derivedDir), JSON.stringify(index), 'utf8');
}

/**
 * Remove a slug from the embeddings index (called when a node is deleted).
 *
 * @param {string} derivedDir
 * @param {string} slug
 */
export function removeEmbeddingFromIndex(derivedDir, slug) {
  const p = indexPath(derivedDir);
  if (!fs.existsSync(p)) return;
  const index = loadEmbeddingsIndex(derivedDir);
  delete index[slug];
  fs.writeFileSync(p, JSON.stringify(index), 'utf8');
}

// ─── Text representation ─────────────────────────────────────────────────────

/**
 * Build the rich text string used for embedding a vault node.
 * Combines title, category, tags, and body for best semantic representation.
 *
 * @param {{ slug: string, title?: string, category?: string, tags?: string[], body?: string }} node
 * @returns {string}
 */
export function nodeToEmbedText(node) {
  const parts = [node.title || node.slug];
  if (node.category) parts.push(`Category: ${node.category}`);
  if (node.tags?.length) parts.push(`Tags: ${node.tags.join(', ')}`);
  if (node.body) parts.push(node.body.slice(0, 2000)); // cap body at 2k chars
  return parts.join('\n\n');
}

// ─── Bulk index builder ──────────────────────────────────────────────────────

/**
 * Build or refresh the embeddings index for a set of vault nodes.
 * Skips nodes that already have an entry in the index (incremental by default).
 * Pass force=true to re-embed all nodes.
 *
 * @param {object[]} nodes
 * @param {string} derivedDir
 * @param {{ ollamaUrl?: string, model?: string, force?: boolean, onProgress?: Function }} [opts]
 * @returns {Promise<{ built: number, skipped: number, failed: number }>}
 */
export async function buildEmbeddingsIndex(nodes, derivedDir, opts = {}) {
  const {
    ollamaUrl = DEFAULT_OLLAMA_URL,
    model = DEFAULT_EMBED_MODEL,
    force = false,
    onProgress,
  } = opts;

  const existing = force ? {} : loadEmbeddingsIndex(derivedDir);
  const index = { ...existing };
  let built = 0, skipped = 0, failed = 0;

  for (const node of nodes) {
    if (!force && existing[node.slug]) {
      skipped++;
      continue;
    }
    try {
      const text = nodeToEmbedText(node);
      const embedding = await getEmbedding(text, ollamaUrl, model);
      index[node.slug] = { embedding, model, generated_at: new Date().toISOString() };
      built++;
      onProgress?.({ slug: node.slug, built, skipped, failed });
    } catch (err) {
      failed++;
      onProgress?.({ slug: node.slug, error: err.message, built, skipped, failed });
    }
  }

  fs.mkdirSync(derivedDir, { recursive: true });
  fs.writeFileSync(indexPath(derivedDir), JSON.stringify(index), 'utf8');
  return { built, skipped, failed };
}
