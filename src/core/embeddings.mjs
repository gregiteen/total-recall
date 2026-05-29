/**
 * src/core/embeddings.mjs
 *
 * Google AI embedding generation + cosine similarity for semantic vault search.
 *
 * Index file: .agent/memory-derived/embeddings.json
 *   { [slug]: { embedding: number[], model: string, generated_at: string } }
 *
 * Embedding model: gemini-embedding-2 (Google, 768 dims, free tier)
 *   Auth: GOOGLE_API_KEY env var
 *
 * Fallback: If GOOGLE_API_KEY is not set, tries OpenAI's text-embedding-3-small
 *   via OPENAI_API_KEY env var.
 */

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

import { googleApiKey, embedModel, brainDir } from './config.mjs';
import { logger } from './logger.mjs';

const DEFAULT_EMBED_MODEL = embedModel;
const GOOGLE_API_KEY = googleApiKey || process.env.GOOGLE_API_KEY;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

const BRAIN_DIR = brainDir;
const DERIVED_DIR = path.join(BRAIN_DIR, 'memory-derived');
const CACHE_DIR = path.join(DERIVED_DIR, 'embeddings-cache');

// ─── Hot process-level in-memory cache Map (max size 500) ────────────────────
const IN_MEMORY_CACHE = new Map();
const MAX_IN_MEMORY_SIZE = 500;

function getInMemory(key) {
  if (!IN_MEMORY_CACHE.has(key)) return null;
  const value = IN_MEMORY_CACHE.get(key);
  // Refresh position for LRU
  IN_MEMORY_CACHE.delete(key);
  IN_MEMORY_CACHE.set(key, value);
  return value;
}

function setInMemory(key, embedding) {
  if (IN_MEMORY_CACHE.has(key)) {
    IN_MEMORY_CACHE.delete(key);
  } else if (IN_MEMORY_CACHE.size >= MAX_IN_MEMORY_SIZE) {
    const oldestKey = IN_MEMORY_CACHE.keys().next().value;
    IN_MEMORY_CACHE.delete(oldestKey);
  }
  IN_MEMORY_CACHE.set(key, embedding);
}

// ─── Query Embedding Cache Helpers (Partitioned 256-Dir Layout) ──────────────

function sha256(text) {
  return crypto.createHash('sha256').update(text).digest('hex');
}

function getCachePartitionPath(key) {
  const hash = sha256(key);
  const prefix = hash.slice(0, 2);
  const suffix = hash.slice(2, 4);
  return {
    dir: path.join(CACHE_DIR, prefix),
    file: path.join(CACHE_DIR, prefix, `${suffix}.json`),
    hash
  };
}

export function getCachedEmbedding(key) {
  if (process.env.NODE_ENV === 'test' && !global.__TEST_CACHE_OVERRIDE__) return null;
  // Tier 1: Hot In-Memory LRU Cache
  const hit = getInMemory(key);
  if (hit) return hit;

  // Tier 2: Partitioned Disk Cache
  try {
    const { file, hash } = getCachePartitionPath(key);
    if (fs.existsSync(file)) {
      const partition = JSON.parse(fs.readFileSync(file, 'utf8') || '{}');
      const entry = partition[hash];
      if (!entry) return null;

      let embedding;
      if (Array.isArray(entry)) {
        embedding = entry;
      } else if (entry && typeof entry === 'object' && Array.isArray(entry.embedding)) {
        embedding = entry.embedding;
        // Non-destructively update lastUsed time
        entry.lastUsed = Date.now();
        fs.writeFileSync(file, JSON.stringify(partition), 'utf8');
      }

      if (embedding) {
        setInMemory(key, embedding);
        return embedding;
      }
    }
  } catch {}
  return null;
}

export function saveCachedEmbedding(key, embedding) {
  if (process.env.NODE_ENV === 'test' && !global.__TEST_CACHE_OVERRIDE__) return;
  // Tier 1 sync
  setInMemory(key, embedding);

  // Tier 2 sync
  try {
    const { dir, file, hash } = getCachePartitionPath(key);
    fs.mkdirSync(dir, { recursive: true });
    const partition = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8') || '{}') : {};
    
    // Save in upgraded object format non-destructively
    partition[hash] = {
      embedding,
      lastUsed: Date.now()
    };

    // Partition Cache Auto-Pruning
    const keys = Object.keys(partition);
    if (keys.length > 500) {
      const entries = keys.map(k => {
        const entry = partition[k];
        let lastUsed = 0;
        if (entry && typeof entry === 'object' && !Array.isArray(entry)) {
          lastUsed = entry.lastUsed || 0;
        }
        return { k, lastUsed };
      });
      // Sort oldest first
      entries.sort((a, b) => a.lastUsed - b.lastUsed);
      // Evict oldest, keeping 400 keys
      const toPrune = entries.slice(0, keys.length - 400);
      for (const p of toPrune) {
        delete partition[p.k];
      }
    }

    fs.writeFileSync(file, JSON.stringify(partition), 'utf8');
  } catch {}
}

// ─── Embedding generation ────────────────────────────────────────────────────

/**
 * Resolve the embedding model dynamically from the active API registry list.
 */
async function resolveEmbeddingModel(selectedModel = embedModel) {
  if (selectedModel !== 'gemini-embedding-2' && selectedModel !== 'default') {
    return selectedModel;
  }

  if (!GOOGLE_API_KEY) {
    return 'gemini-embedding-2';
  }

  try {
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${GOOGLE_API_KEY}`, {
      signal: AbortSignal.timeout(5000)
    });
    if (res.ok) {
      const data = await res.json();
      const models = data.models || [];
      const preferences = [
        'gemini-embedding-2',
        'gemini-embedding-2-preview',
        'gemini-embedding-001',
        'text-embedding-004'
      ];
      for (const p of preferences) {
        if (models.some(m => m.name === `models/${p}`)) {
          return p;
        }
      }
    }
  } catch {
    // Silent failover
  }
  return 'gemini-embedding-2';
}

/**
 * Get an embedding from Google's embedding API.
 */
async function getGoogleEmbedding(text, model) {
  if (!GOOGLE_API_KEY) {
    throw new Error('GOOGLE_API_KEY not set. Cannot generate embeddings.');
  }

  const resolved = await resolveEmbeddingModel(model);
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${resolved}:embedContent?key=${GOOGLE_API_KEY}`;

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: `models/${resolved}`,
      content: { parts: [{ text }] },
    }),
    signal: AbortSignal.timeout(30000),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Google embedding API error ${res.status}: ${body || 'no response body'}`);
  }

  const data = await res.json();
  if (!data.embedding?.values || !Array.isArray(data.embedding.values)) {
    throw new Error('Google returned no embedding vector');
  }

  return data.embedding.values;
}

/**
 * Fallback: Get an embedding from OpenAI's text-embedding-3-small API.
 */
async function getOpenAIEmbedding(text, model = 'text-embedding-3-small') {
  if (!OPENAI_API_KEY) {
    throw new Error('Neither GOOGLE_API_KEY nor OPENAI_API_KEY is set. Cannot generate embeddings.');
  }

  const res = await fetch('https://api.openai.com/v1/embeddings', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${OPENAI_API_KEY}`,
    },
    body: JSON.stringify({ model, input: text }),
    signal: AbortSignal.timeout(30000),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`OpenAI embedding API error ${res.status}: ${body || 'no response body'}`);
  }

  const data = await res.json();
  if (!data.data?.[0]?.embedding) {
    throw new Error('OpenAI returned no embedding vector');
  }

  return data.data[0].embedding;
}

/**
 * Get an embedding vector for the given text.
 * Tries Google first, falls back to OpenAI.
 *
 * @param {string} text
 * @param {string} [_unused]   — kept for backward compatibility (was ollamaUrl)
 * @param {string} [model]
 * @returns {Promise<number[]>}
 */
export async function getEmbedding(text, _unused, model = DEFAULT_EMBED_MODEL) {
  const input = String(text).slice(0, 8000); // cap at 8k chars

  const cacheKey = `${model}:${sha256(input)}`;
  const cached = getCachedEmbedding(cacheKey);
  if (cached) {
    return cached;
  }

  let embedding;

  // Try Google first
  if (GOOGLE_API_KEY) {
    try {
      embedding = await getGoogleEmbedding(input, model);
    } catch (err) {
      logger.debug('embeddings: Google API failed, trying OpenAI fallback', { err: err.message });
    }
  }

  // Fallback to OpenAI
  if (!embedding && OPENAI_API_KEY) {
    try {
      embedding = await getOpenAIEmbedding(input);
    } catch (err) {
      logger.debug('embeddings: OpenAI fallback also failed', { err: err.message });
      throw err;
    }
  }

  if (!embedding) {
    throw new Error('No embedding provider available. Set GOOGLE_API_KEY or OPENAI_API_KEY.');
  }

  // Save to cache
  saveCachedEmbedding(cacheKey, embedding);

  return embedding;
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

let cachedIndex = null;
let cachedIndexPath = null;
let cachedIndexMtime = 0;

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
  try {
    const stat = fs.statSync(p);
    if (cachedIndex && cachedIndexPath === p && cachedIndexMtime === stat.mtimeMs) {
      return cachedIndex;
    }
    const data = JSON.parse(fs.readFileSync(p, 'utf8'));
    cachedIndex = data;
    cachedIndexPath = p;
    cachedIndexMtime = stat.mtimeMs;
    return data;
  }
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
 * @param {{ model?: string, force?: boolean, onProgress?: Function }} [opts]
 * @returns {Promise<{ built: number, skipped: number, failed: number }>}
 */
export async function buildEmbeddingsIndex(nodes, derivedDir, opts = {}) {
  const {
    model = DEFAULT_EMBED_MODEL,
    force = false,
    onProgress,
  } = opts;

  const existing = force ? {} : loadEmbeddingsIndex(derivedDir);
  const index = { ...existing };

  // Remove any stale keys in the index that are not present in nodes (stale clean-up)
  const activeSlugs = new Set(nodes.map(n => n.slug));
  for (const slug of Object.keys(index)) {
    if (!activeSlugs.has(slug)) {
      delete index[slug];
    }
  }

  let built = 0, skipped = 0, failed = 0;

  for (const node of nodes) {
    if (!force && existing[node.slug]) {
      skipped++;
      continue;
    }
    try {
      const text = nodeToEmbedText(node);
      const embedding = await getEmbedding(text, undefined, model);
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

// ─── Session index ───────────────────────────────────────────────────────────

const SESSION_INDEX_FILE = 'session-embeddings.json';

function sessionIndexPath(derivedDir) {
  return path.join(derivedDir, SESSION_INDEX_FILE);
}

let cachedSessionIndex = null;
let cachedSessionIndexPath = null;
let cachedSessionIndexMtime = 0;

export function loadSessionEmbeddingsIndex(derivedDir) {
  const p = sessionIndexPath(derivedDir);
  if (!fs.existsSync(p)) return {};
  try {
    const stat = fs.statSync(p);
    if (cachedSessionIndex && cachedSessionIndexPath === p && cachedSessionIndexMtime === stat.mtimeMs) {
      return cachedSessionIndex;
    }
    const data = JSON.parse(fs.readFileSync(p, 'utf8'));
    cachedSessionIndex = data;
    cachedSessionIndexPath = p;
    cachedSessionIndexMtime = stat.mtimeMs;
    return data;
  }
  catch { return {}; }
}

function saveSessionIndex(derivedDir, index) {
  fs.mkdirSync(derivedDir, { recursive: true });
  fs.writeFileSync(sessionIndexPath(derivedDir), JSON.stringify(index), 'utf8');
}

export function saveSessionEmbeddingToIndex(derivedDir, key, snippet, embedding, model = DEFAULT_EMBED_MODEL) {
  const index = loadSessionEmbeddingsIndex(derivedDir);
  index[key] = { embedding, snippet: snippet.slice(0, 300), model, generated_at: new Date().toISOString() };
  saveSessionIndex(derivedDir, index);
}

export function removeSessionEmbeddingFromIndex(derivedDir, sessionId) {
  const index = loadSessionEmbeddingsIndex(derivedDir);
  for (const key of Object.keys(index)) {
    if (key === sessionId || key.startsWith(`${sessionId}:chunk-`)) {
      delete index[key];
    }
  }
  saveSessionIndex(derivedDir, index);
}

/**
 * Build a readable text representation of a session for embedding.
 * Concatenates role:content pairs. Returns array of chunks (each ≤ 6000 chars).
 */
export function sessionToEmbedChunks(messages) {
  const CHUNK_SIZE = 6000;
  const full = messages
    .filter(m => m && m.content)
    .map(m => `${(m.role || 'unknown').toUpperCase()}: ${String(m.content).slice(0, 2000)}`)
    .join('\n');

  if (full.length === 0) return [];

  const chunks = [];
  for (let i = 0; i < full.length; i += CHUNK_SIZE) {
    chunks.push(full.slice(i, i + CHUNK_SIZE));
  }
  return chunks;
}

/**
 * Parse a session JSONL file into an array of message objects.
 */
export function parseSessionFile(filePath) {
  try {
    const raw = fs.readFileSync(filePath, 'utf8').trim();
    const lines = raw.split('\n').filter(Boolean)
      .map(l => { try { return JSON.parse(l); } catch { return null; } })
      .filter(Boolean);
    if (lines.length === 1 && lines[0] && Array.isArray(lines[0].messages)) {
      return lines[0].messages;
    }
    return lines;
  } catch { return []; }
}

/**
 * Embed all sessions in sessionsDir that are not yet in the index.
 *
 * @param {string} sessionsDir
 * @param {string} derivedDir
 * @param {{ force?: boolean, model?: string, onProgress?: Function }} [opts]
 * @returns {Promise<{ indexed: number, skipped: number, failed: number, chunks: number }>}
 */
export async function buildSessionEmbeddingsIndex(sessionsDir, derivedDir, opts = {}) {
  const {
    force = false,
    model = DEFAULT_EMBED_MODEL,
    onProgress,
  } = opts;

  if (!fs.existsSync(sessionsDir)) return { indexed: 0, skipped: 0, failed: 0, chunks: 0 };

  const files = fs.readdirSync(sessionsDir)
    .filter(f => f.endsWith('.jsonl') || f.endsWith('.json'));

  if (files.length === 0) return { indexed: 0, skipped: 0, failed: 0, chunks: 0 };

  let existing = force ? {} : loadSessionEmbeddingsIndex(derivedDir);

  // Probe resolved model embedding dimension
  let newDim = 0;
  try {
    const probe = await getEmbedding("test probe", undefined, model);
    newDim = probe.length;
  } catch (err) {
    // If the probe fails, we cannot resolve/access the API, so skip gracefully
    return { indexed: 0, skipped: files.length, failed: files.length, chunks: 0 };
  }

  // Check for dimension mismatch against existing cached session embeddings
  if (Object.keys(existing).length > 0) {
    const firstKey = Object.keys(existing)[0];
    const firstVal = existing[firstKey];
    const existingDim = firstVal && Array.isArray(firstVal.embedding) ? firstVal.embedding.length : 0;

    if (existingDim > 0 && existingDim !== newDim) {
      // Dimension mismatch detected! Wipe the old index to re-embed everything
      existing = {};
      try {
        const file = sessionIndexPath(derivedDir);
        if (fs.existsSync(file)) {
          fs.unlinkSync(file);
        }
      } catch {}
    }
  }

  const index = { ...existing };
  let indexed = 0, skipped = 0, failed = 0, totalChunks = 0;

  for (const file of files) {
    const sessionId = file.replace(/\.(jsonl|json)$/, '');
    if (!force && (existing[sessionId] || existing[`${sessionId}:chunk-0`])) {
      skipped++;
      continue;
    }

    try {
      const messages = parseSessionFile(path.join(sessionsDir, file));
      const chunks = sessionToEmbedChunks(messages);
      if (chunks.length === 0) { skipped++; continue; }

      for (let i = 0; i < chunks.length; i++) {
        const key = chunks.length === 1 ? sessionId : `${sessionId}:chunk-${i}`;
        const embedding = await getEmbedding(chunks[i], undefined, model);
        index[key] = {
          embedding,
          snippet: chunks[i].slice(0, 300),
          model,
          session_id: sessionId,
          chunk: i,
          total_chunks: chunks.length,
          generated_at: new Date().toISOString(),
        };
        totalChunks++;
      }

      indexed++;
      onProgress?.({ sessionId, indexed, skipped, failed, chunks: totalChunks });
    } catch (err) {
      failed++;
      onProgress?.({ sessionId, error: err.message, indexed, skipped, failed });
    }
  }

  saveSessionIndex(derivedDir, index);
  return { indexed, skipped, failed, chunks: totalChunks };
}
