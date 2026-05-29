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
import crypto from 'node:crypto';
import { getEmbedding } from './embeddings.mjs';

const EMBEDDINGS_FILE = 'embeddings.jsonl';

// ─── Embedding generation ────────────────────────────────────────────────────────

/**
 * Generate an embedding vector for `text` via Google embeddings (with OpenAI fallback).
 * Returns null if the embeddings API is unreachable or fails.
 *
 * @param {string} text
 * @param {object} [opts]
 * @returns {Promise<number[]|null>}
 */
export async function generateEmbedding(text, opts = {}) {
  try {
    return await getEmbedding(text);
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
 * Returns Map<slug, number[] & { content_sha256: string }>.
 */
export function loadEmbeddingsIndex(derivedDir) {
  const file = path.join(derivedDir, EMBEDDINGS_FILE);
  const index = new Map();
  if (!fs.existsSync(file)) return index;
  for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
    if (!line.trim()) continue;
    try {
      const parsed = JSON.parse(line);
      const { slug, embedding, content_sha256 } = parsed;
      if (slug && Array.isArray(embedding)) {
        const vec = embedding;
        Object.defineProperty(vec, 'embedding', {
          get() { return this; },
          enumerable: false,
          configurable: true
        });
        Object.defineProperty(vec, 'content_sha256', {
          value: content_sha256 || '',
          writable: true,
          enumerable: false,
          configurable: true
        });
        index.set(slug, vec);
      } else if (slug && parsed.embedding === undefined && Array.isArray(parsed)) {
        // Fallback for very old formats if any
        const vec = parsed;
        Object.defineProperty(vec, 'embedding', {
          get() { return this; },
          enumerable: false,
          configurable: true
        });
        Object.defineProperty(vec, 'content_sha256', {
          value: '',
          writable: true,
          enumerable: false,
          configurable: true
        });
        index.set(slug, vec);
      }
    } catch { /* skip corrupt lines */ }
  }
  return index;
}

function writeEmbeddingsIndex(derivedDir, index) {
  if (!fs.existsSync(derivedDir)) fs.mkdirSync(derivedDir, { recursive: true });
  const lines = [];
  for (const [slug, val] of index) {
    if (val && Array.isArray(val.embedding)) {
      lines.push(JSON.stringify({ slug, embedding: val.embedding, content_sha256: val.content_sha256 || '' }));
    } else if (Array.isArray(val)) {
      lines.push(JSON.stringify({ slug, embedding: val, content_sha256: val.content_sha256 || '' }));
    }
  }
  fs.writeFileSync(path.join(derivedDir, EMBEDDINGS_FILE), lines.join('\n') + '\n', 'utf8');
}

async function throttledMap(items, limit, fn) {
  const results = [];
  const executing = new Set();
  for (const item of items) {
    const p = Promise.resolve().then(() => fn(item));
    results.push(p);
    executing.add(p);
    const clean = () => executing.delete(p);
    p.then(clean, clean);
    if (executing.size >= limit) {
      await Promise.race(executing);
    }
  }
  return Promise.all(results);
}

// ─── Index builder ───────────────────────────────────────────────────────────────

/**
 * Build (or incrementally update) the embeddings index from SSSS nodes.
 * Re-embeds nodes if they are missing from the index OR if their content hash has changed.
 * Skips silently if Ollama is unreachable.
 *
 * @param {object[]} nodes        SSSS nodes with slug, title, body/content fields
 * @param {string}   derivedDir
 * @param {object}   [opts]
 * @param {string}   [opts.endpoint]
 * @param {string}   [opts.model]
 * @returns {Promise<{ indexed: number, skipped: number, unavailable: boolean }>}
 */
export async function buildSemanticIndex(nodes, derivedDir, opts = {}) {
  if (nodes.length === 0) {
    return { indexed: 0, skipped: 0, unavailable: false };
  }

  const existing = loadEmbeddingsIndex(derivedDir);
  
  // Probe availability and get current model dimension using the first node
  const firstText = [nodes[0].title, nodes[0].body || nodes[0].content].filter(Boolean).join('\n').slice(0, 4096);
  const probe = await generateEmbedding(firstText, opts);
  if (!probe) {
    return { indexed: 0, skipped: nodes.length, unavailable: true };
  }

  const newDim = probe.length;

  // Check for dimension mismatch against existing cached embeddings
  if (existing.size > 0) {
    const firstVal = existing.values().next().value;
    const existingDim = Array.isArray(firstVal)
      ? firstVal.length
      : (firstVal && Array.isArray(firstVal.embedding) ? firstVal.embedding.length : 0);

    if (existingDim > 0 && existingDim !== newDim) {
      // Dimension mismatch detected! Wipe the old index to re-embed everything
      existing.clear();
      try {
        const file = path.join(derivedDir, EMBEDDINGS_FILE);
        if (fs.existsSync(file)) {
          fs.unlinkSync(file);
        }
      } catch {}
    }
  }

  // Filter nodes that need embedding
  const toEmbed = nodes.filter(n => {
    const cached = existing.get(n.slug);
    if (!cached) return true;
    
    const cachedHash = cached.content_sha256 || '';
    const text = [n.title, n.body || n.content].filter(Boolean).join('\n').slice(0, 4096);
    const hash = crypto.createHash('sha256').update(text).digest('hex');
    return !cachedHash || cachedHash !== hash;
  });

  if (toEmbed.length === 0) {
    return { indexed: 0, skipped: nodes.length, unavailable: false };
  }

  // Save the probe result we already generated for the first node if it is in toEmbed
  const firstNode = toEmbed.find(n => n.slug === nodes[0].slug);
  if (firstNode) {
    const firstHash = crypto.createHash('sha256').update(firstText).digest('hex');
    const firstVec = probe;
    Object.defineProperty(firstVec, 'embedding', {
      get() { return this; },
      enumerable: false,
      configurable: true
    });
    Object.defineProperty(firstVec, 'content_sha256', {
      value: firstHash,
      writable: true,
      enumerable: false,
      configurable: true
    });
    existing.set(firstNode.slug, firstVec);
  }

  // Embed the remaining nodes concurrently
  const remainingToEmbed = toEmbed.filter(n => n.slug !== nodes[0].slug);
  await throttledMap(remainingToEmbed, 6, async (node) => {
    const text = [node.title, node.body || node.content].filter(Boolean).join('\n').slice(0, 4096);
    const vec = await generateEmbedding(text, opts);
    if (vec) {
      const hash = crypto.createHash('sha256').update(text).digest('hex');
      const vecWithHash = vec;
      Object.defineProperty(vecWithHash, 'embedding', {
        get() { return this; },
        enumerable: false,
        configurable: true
      });
      Object.defineProperty(vecWithHash, 'content_sha256', {
        value: hash,
        writable: true,
        enumerable: false,
        configurable: true
      });
      existing.set(node.slug, vecWithHash);
    }
  });

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
  for (const [slug, val] of index) {
    const vec = val && Array.isArray(val.embedding) ? val.embedding : (Array.isArray(val) ? val : null);
    if (!vec) continue;
    const score = cosineSimilarity(queryVec, vec);
    if (score >= threshold) scored.push({ slug, score });
  }

  return scored.sort((a, b) => b.score - a.score).slice(0, topK);
}
