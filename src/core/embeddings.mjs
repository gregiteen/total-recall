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
import os from 'node:os';
import crypto from 'node:crypto';

import { ollamaUrl, embedModel, agentDir } from './config.mjs';
import { logger } from './logger.mjs';

const DEFAULT_OLLAMA_URL = ollamaUrl;
const DEFAULT_EMBED_MODEL = embedModel;

const AGENT_DIR = agentDir;
const DERIVED_DIR = path.join(AGENT_DIR, 'memory-derived');
const CACHE_PATH = path.join(DERIVED_DIR, 'embeddings-cache.json');

// ─── Query Embedding Cache Helpers ──────────────────────────────────────────

let embeddingCache = null;

function sha256(text) {
  return crypto.createHash('sha256').update(text).digest('hex');
}

function loadCache() {
  if (embeddingCache) return embeddingCache;
  try {
    if (fs.existsSync(CACHE_PATH)) {
      embeddingCache = JSON.parse(fs.readFileSync(CACHE_PATH, 'utf8'));
    } else {
      embeddingCache = {};
    }
  } catch (err) {
    embeddingCache = {};
  }
  return embeddingCache;
}

function saveCache() {
  if (!embeddingCache) return;
  try {
    fs.mkdirSync(DERIVED_DIR, { recursive: true });
    fs.writeFileSync(CACHE_PATH, JSON.stringify(embeddingCache), 'utf8');
  } catch (err) {
    // Ignore cache persistence errors gracefully
  }
}

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

  const cache = loadCache();
  const cacheKey = `${model}:${sha256(input)}`;
  if (cache[cacheKey]) {
    return cache[cacheKey];
  }

  let embedding;

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
      if (Array.isArray(data.embeddings?.[0])) {
        embedding = data.embeddings[0];
      }
    }
  } catch (err) {
    logger.debug('embeddings: new embed API failed, falling back to legacy API', { err: err.message });
  }

  if (!embedding) {
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
    embedding = data.embedding;
  }

  // Save to cache
  cache[cacheKey] = embedding;
  saveCache();

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
// ─── Session index ───────────────────────────────────────────────────────────
// Separate index file for raw session content.
// Keyed as "<sessionId>" or "<sessionId>:chunk-N" for long sessions.
// File: .agent/memory-derived/session-embeddings.json

const SESSION_INDEX_FILE = 'session-embeddings.json';

function sessionIndexPath(derivedDir) {
  return path.join(derivedDir, SESSION_INDEX_FILE);
}

export function loadSessionEmbeddingsIndex(derivedDir) {
  const p = sessionIndexPath(derivedDir);
  if (!fs.existsSync(p)) return {};
  try { return JSON.parse(fs.readFileSync(p, 'utf8')); }
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
  // Remove all chunks for this session
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
 *
 * @param {object[]} messages  — array of { role, content } objects
 * @returns {string[]}         — array of chunk strings
 */
export function sessionToEmbedChunks(messages) {
  const CHUNK_SIZE = 6000;
  const full = messages
    .filter(m => m && m.content)
    .map(m => `${(m.role || 'unknown').toUpperCase()}: ${String(m.content).slice(0, 2000)}`)
    .join('\n');

  if (full.length === 0) return [];

  // Split into chunks of CHUNK_SIZE characters
  const chunks = [];
  for (let i = 0; i < full.length; i += CHUNK_SIZE) {
    chunks.push(full.slice(i, i + CHUNK_SIZE));
  }
  return chunks;
}

/**
 * Parse a session JSONL file into an array of message objects.
 *
 * @param {string} filePath
 * @returns {object[]}
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
 * Each session gets one vector per chunk (long sessions get multiple vectors).
 * Skips already-indexed sessions unless force=true.
 *
 * @param {string} sessionsDir
 * @param {string} derivedDir
 * @param {{ force?: boolean, ollamaUrl?: string, model?: string, onProgress?: Function }} [opts]
 * @returns {Promise<{ indexed: number, skipped: number, failed: number, chunks: number }>}
 */
export async function buildSessionEmbeddingsIndex(sessionsDir, derivedDir, opts = {}) {
  const {
    force = false,
    ollamaUrl = DEFAULT_OLLAMA_URL,
    model = DEFAULT_EMBED_MODEL,
    onProgress,
  } = opts;

  if (!fs.existsSync(sessionsDir)) return { indexed: 0, skipped: 0, failed: 0, chunks: 0 };

  const files = fs.readdirSync(sessionsDir)
    .filter(f => f.endsWith('.jsonl') || f.endsWith('.json'));

  const existing = force ? {} : loadSessionEmbeddingsIndex(derivedDir);
  const index = { ...existing };
  let indexed = 0, skipped = 0, failed = 0, totalChunks = 0;

  for (const file of files) {
    const sessionId = file.replace(/\.(jsonl|json)$/, '');
    // Skip if already indexed (check for the base key or chunk-0)
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
        const embedding = await getEmbedding(chunks[i], ollamaUrl, model);
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
