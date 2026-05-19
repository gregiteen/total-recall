/**
 * Semantic Index — file-native vector search alongside tf-idf
 *
 * Generates embeddings via a local Ollama embedding model and persists them
 * in memory-derived/embeddings.jsonl — a plain JSONL file, no database.
 *
 * Embedding model: nomic-embed-text (default) or any Ollama embedding model.
 *
 * Usage:
 *   - `buildSemanticIndex(nodes, derivedDir, opts)` — called by compileSurface
 *   - `semanticSearch(query, derivedDir, opts)` — called alongside tf-idf recall
 */

import fs from 'node:fs';
import path from 'node:path';

const EMBEDDINGS_FILE = 'embeddings.jsonl';
const DEFAULT_MODEL = 'nomic-embed-text';
const DEFAULT_ENDPOINT = 'http://127.0.0.1:11434';

// ─── Embedding generation ────────────────────────────────────────────────────────

/**
 * Generate an embedding vector for `text` via Ollama.
 * Returns null if Ollama is unreachable or the model is not available.
 *
 * @param {string} text
 * @param {object} [opts]
 * @param {string} [opts.endpoint]
 * @param {string} [opts.model]
 * @returns {Promise<number[]|null>}
 */
export async function generateEmbedding(text, opts = {}) {
  const endpoint = (opts.endpoint || DEFAULT_ENDPOINT).replace(/\/$/, '');
  const model = opts.model || DEFAULT_MODEL;
  try {
    const res = await fetch(`${endpoint}/api/embeddings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, prompt: text }),
      signal: AbortSignal.timeout(30_000)
    });
    if (!res.ok) return null;
    const body = await res.json();
    return Array.isArray(body.embedding) ? body.embedding : null;
  } catch {
    return null;
  }
}

// ─── Cosine similarity ───────────────────────────────────────────────────────────

export function cosineSimilarity(a, b) {
  if (!a || !b || a.length !== b.length) return 0;
  let dot = 0, magA = 0, magB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    magA += a[i] * a[i];
    magB += b[i] * b[i];
  }
  const denom = Math.sqrt(magA) * Math.sqrt(magB);
  return denom === 0 ? 0 : dot / denom;
}

// ─── Index I/O ───────────────────────────────────────────────────────────────────

/**
 * Load the embeddings index from disk.
 * Returns Map<slug, number[]>.
 */
export function loadEmbeddingsIndex(derivedDir) {
  const file = path.join(derivedDir, EMBEDDINGS_FILE);
  const index = new Map();
  if (!fs.existsSync(file)) return index;
  for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
    if (!line.trim()) continue;
    try {
      const { slug, embedding } = JSON.parse(line);
      if (slug && Array.isArray(embedding)) index.set(slug, embedding);
    } catch { /* skip corrupt lines */ }
  }
  return index;
}

function writeEmbeddingsIndex(derivedDir, index) {
  if (!fs.existsSync(derivedDir)) fs.mkdirSync(derivedDir, { recursive: true });
  const lines = [];
  for (const [slug, embedding] of index) {
    lines.push(JSON.stringify({ slug, embedding }));
  }
  fs.writeFileSync(path.join(derivedDir, EMBEDDINGS_FILE), lines.join('\n') + '\n', 'utf8');
}

// ─── Index builder ───────────────────────────────────────────────────────────────

/**
 * Build (or incrementally update) the embeddings index from SSSS nodes.
 * Only re-embeds nodes whose slug is not already in the index.
 * Skips silently if Ollama is unreachable.
 *
 * @param {object[]} nodes        SSSS nodes with slug, title, content fields
 * @param {string}   derivedDir
 * @param {object}   [opts]
 * @param {string}   [opts.endpoint]
 * @param {string}   [opts.model]
 * @returns {Promise<{ indexed: number, skipped: number, unavailable: boolean }>}
 */
export async function buildSemanticIndex(nodes, derivedDir, opts = {}) {
  const existing = loadEmbeddingsIndex(derivedDir);
  const toEmbed = nodes.filter(n => !existing.has(n.slug));

  if (toEmbed.length === 0) {
    return { indexed: 0, skipped: nodes.length, unavailable: false };
  }

  // Probe Ollama availability with the first node
  const probe = await generateEmbedding(toEmbed[0].title || toEmbed[0].slug, opts);
  if (!probe) {
    return { indexed: 0, skipped: nodes.length, unavailable: true };
  }
  existing.set(toEmbed[0].slug, probe);

  // Embed the remaining nodes
  for (const node of toEmbed.slice(1)) {
    const text = [node.title, node.content].filter(Boolean).join('\n').slice(0, 4096);
    const vec = await generateEmbedding(text, opts);
    if (vec) existing.set(node.slug, vec);
  }

  writeEmbeddingsIndex(derivedDir, existing);
  const indexed = toEmbed.filter(n => existing.has(n.slug)).length;
  return { indexed, skipped: nodes.length - toEmbed.length, unavailable: false };
}

// ─── Semantic search ─────────────────────────────────────────────────────────────

/**
 * Search the embeddings index for nodes similar to `query`.
 * Returns an array of { slug, score } sorted by descending cosine similarity.
 *
 * @param {string} query
 * @param {string} derivedDir
 * @param {object} [opts]
 * @param {string} [opts.endpoint]
 * @param {string} [opts.model]
 * @param {number} [opts.topK]          Max results (default: 10)
 * @param {number} [opts.threshold]     Min cosine similarity (default: 0.5)
 * @returns {Promise<Array<{ slug: string, score: number }>>}
 */
export async function semanticSearch(query, derivedDir, opts = {}) {
  const topK = opts.topK ?? 10;
  const threshold = opts.threshold ?? 0.5;
  const index = loadEmbeddingsIndex(derivedDir);
  if (index.size === 0) return [];

  const queryVec = await generateEmbedding(query, opts);
  if (!queryVec) return [];

  const scored = [];
  for (const [slug, embedding] of index) {
    const score = cosineSimilarity(queryVec, embedding);
    if (score >= threshold) scored.push({ slug, score });
  }

  return scored.sort((a, b) => b.score - a.score).slice(0, topK);
}
