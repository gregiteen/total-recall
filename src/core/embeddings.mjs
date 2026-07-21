/**
 * src/core/embeddings.mjs
 *
 * Google AI embedding generation + cosine similarity for semantic vault search.
 * Migrated to better-sqlite3 + sqlite-vss to prevent OOM on large vaults.
 *
 * Index file: .agent/memory-derived/embeddings.db
 *
 * Embedding model: gemini-embedding-2 (Google, 768 dims, free tier)
 *   Auth: GOOGLE_API_KEY env var
 */

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { throttledFetch } from './throttled-fetch.mjs';
import Database from 'better-sqlite3';
import {
  getVectorLoadablePath,
  getVssLoadablePath,
} from 'sqlite-vss';

import { googleApiKey, openRouterApiKey, embedModel, brainDir as defaultBrainDir } from './config.mjs';
import { logger } from './logger.mjs';

const DEFAULT_EMBED_MODEL = embedModel;

/** Resolve API keys at call time so tests can set env after import. */
function resolveGoogleApiKey() {
  return googleApiKey || process.env.GOOGLE_API_KEY || process.env.GEMINI_API_KEY || null;
}

function resolveOpenAiApiKey() {
  return process.env.OPENAI_API_KEY || null;
}

function resolveOpenRouterApiKey() {
  return openRouterApiKey || process.env.OPENROUTER_API_KEY || null;
}

let dbInstance = null;
let currentDbPath = null;
/** @type {WeakMap<object, boolean>} */
const dbVssEnabled = new WeakMap();

/**
 * better-sqlite3 on Linux appends ".so" when the path already ends in ".so",
 * producing "vss0.so.so". Strip known extensions before loadExtension.
 */
function loadExtensionBare(db, absolutePath) {
  const bare = String(absolutePath).replace(/\.(so|dylib|dll)$/i, '');
  try {
    db.loadExtension(bare);
  } catch {
    db.loadExtension(absolutePath);
  }
}

function tryLoadSqliteVss(db) {
  try {
    loadExtensionBare(db, getVectorLoadablePath());
    loadExtensionBare(db, getVssLoadablePath());
    return true;
  } catch (err) {
    logger.warn('embeddings', `sqlite-vss unavailable; using JSON-only store: ${err.message}`);
    return false;
  }
}

/**
 * Get or initialize the SQLite database connection with sqlite-vss loaded when available.
 */
function getDb(derivedDir) {
  const dbPath = path.join(derivedDir, 'embeddings.db');
  if (dbInstance && currentDbPath === dbPath) {
    return dbInstance;
  }
  
  if (dbInstance) {
    dbInstance.close();
  }

  fs.mkdirSync(derivedDir, { recursive: true });
  
  const db = new Database(dbPath);
  const vssOk = tryLoadSqliteVss(db);
  dbVssEnabled.set(db, vssOk);

  // Initialize schema
  db.exec(`
    CREATE TABLE IF NOT EXISTS vault_embeddings (
      slug TEXT PRIMARY KEY,
      model TEXT,
      generated_at TEXT,
      content_sha256 TEXT,
      embedding_json TEXT
    );
    
    CREATE TABLE IF NOT EXISTS session_embeddings (
      key TEXT PRIMARY KEY,
      session_id TEXT,
      chunk INTEGER,
      total_chunks INTEGER,
      snippet TEXT,
      model TEXT,
      generated_at TEXT,
      embedding_json TEXT
    );
  `);

  if (vssOk) {
    db.exec(`
      CREATE VIRTUAL TABLE IF NOT EXISTS vss_vault_embeddings USING vss0(
        embedding(768)
      );
      CREATE VIRTUAL TABLE IF NOT EXISTS vss_session_embeddings USING vss0(
        embedding(768)
      );
    `);
  }

  dbInstance = db;
  currentDbPath = dbPath;
  return db;
}

function hasVss(db) {
  return dbVssEnabled.get(db) === true;
}

function vssReplaceVault(db, rowId, embeddingJson) {
  if (!hasVss(db)) return;
  db.prepare('DELETE FROM vss_vault_embeddings WHERE rowid = ?').run(rowId);
  db.prepare('INSERT INTO vss_vault_embeddings(rowid, embedding) VALUES (?, ?)').run(rowId, embeddingJson);
}

function vssDeleteVault(db, rowId) {
  if (!hasVss(db)) return;
  db.prepare('DELETE FROM vss_vault_embeddings WHERE rowid = ?').run(rowId);
}

function vssReplaceSession(db, rowId, embeddingJson) {
  if (!hasVss(db)) return;
  db.prepare('DELETE FROM vss_session_embeddings WHERE rowid = ?').run(rowId);
  db.prepare('INSERT INTO vss_session_embeddings(rowid, embedding) VALUES (?, ?)').run(rowId, embeddingJson);
}

function vssDeleteSession(db, rowId) {
  if (!hasVss(db)) return;
  db.prepare('DELETE FROM vss_session_embeddings WHERE rowid = ?').run(rowId);
}

function vssClearAll(db) {
  if (!hasVss(db)) {
    db.exec('DELETE FROM vault_embeddings; DELETE FROM session_embeddings;');
    return;
  }
  db.exec('DELETE FROM vss_vault_embeddings; DELETE FROM vault_embeddings; DELETE FROM vss_session_embeddings; DELETE FROM session_embeddings;');
}

function sha256(text) {
  return crypto.createHash('sha256').update(text).digest('hex');
}

// ─── Embedding generation ────────────────────────────────────────────────────

async function resolveEmbeddingModel(selectedModel = embedModel) {
  if (selectedModel !== 'gemini-embedding-2' && selectedModel !== 'default') {
    return selectedModel;
  }

  const googleKey = resolveGoogleApiKey();
  if (!googleKey) {
    return 'gemini-embedding-2';
  }

  try {
    const res = await throttledFetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${googleKey}`, {
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

async function getGoogleEmbedding(text, model) {
  const googleKey = resolveGoogleApiKey();
  if (!googleKey) {
    throw new Error('GOOGLE_API_KEY not set. Cannot generate embeddings.');
  }

  const resolved = await resolveEmbeddingModel(model);
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${resolved}:embedContent?key=${googleKey}`;

  const res = await throttledFetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: `models/${resolved}`,
      content: { parts: [{ text }] },
    }),
  }, 30000);

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

async function getOpenRouterEmbedding(text, model = 'openai/text-embedding-3-small') {
  const openRouterKey = resolveOpenRouterApiKey();
  if (!openRouterKey) {
    throw new Error('OPENROUTER_API_KEY not set. Cannot generate embeddings.');
  }

  const res = await throttledFetch('https://openrouter.ai/api/v1/embeddings', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${openRouterKey}`,
    },
    // Request 768 dims to match the existing vault vss0(embedding(768)) schema
    // and stay comparable against previously-stored Google embeddings.
    body: JSON.stringify({ model, input: text, dimensions: 768 }),
  }, 20000);

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`OpenRouter embedding API error ${res.status}: ${body || 'no response body'}`);
  }

  const data = await res.json();
  if (!data.data?.[0]?.embedding) {
    throw new Error('OpenRouter returned no embedding vector');
  }

  return data.data[0].embedding;
}

async function getOpenAIEmbedding(text, model = 'text-embedding-3-small') {
  const openaiKey = resolveOpenAiApiKey();
  if (!openaiKey) {
    throw new Error('Neither GOOGLE_API_KEY nor OPENAI_API_KEY is set. Cannot generate embeddings.');
  }

  const res = await throttledFetch('https://api.openai.com/v1/embeddings', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${openaiKey}`,
    },
    body: JSON.stringify({ model, input: text }),
  }, 30000);

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

export async function getEmbedding(text, _unused, model = DEFAULT_EMBED_MODEL) {
  const input = String(text).slice(0, 8000);
  const openRouterKey = resolveOpenRouterApiKey();
  const googleKey = resolveGoogleApiKey();
  const openaiKey = resolveOpenAiApiKey();

  let embedding;

  // OpenRouter first: standing preference (Gemini's budget is exhausted, so
  // Google is a near-guaranteed slow failure right now — trying it first just
  // taxes every call with a ~15-20s timeout before falling through).
  if (openRouterKey) {
    try {
      embedding = await getOpenRouterEmbedding(input);
    } catch (err) {
      logger.debug('embeddings: OpenRouter failed, trying Google fallback', { err: err.message });
    }
  }

  if (!embedding && googleKey) {
    try {
      embedding = await getGoogleEmbedding(input, model);
    } catch (err) {
      logger.debug('embeddings: Google API failed, trying OpenAI fallback', { err: err.message });
    }
  }

  if (!embedding && openaiKey) {
    try {
      embedding = await getOpenAIEmbedding(input);
    } catch (err) {
      logger.debug('embeddings: OpenAI fallback also failed', { err: err.message });
      throw err;
    }
  }

  if (!embedding) {
    throw new Error('No embedding provider available. Set OPENROUTER_API_KEY, GOOGLE_API_KEY, or OPENAI_API_KEY.');
  }

  return embedding;
}

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

export function loadEmbeddingsIndex(derivedDir) {
  const db = getDb(derivedDir);
  const rows = db.prepare('SELECT slug, embedding_json, model, generated_at, content_sha256 FROM vault_embeddings').all();
  const index = {};
  for (const row of rows) {
    index[row.slug] = {
      embedding: JSON.parse(row.embedding_json),
      model: row.model,
      generated_at: row.generated_at,
      content_sha256: row.content_sha256
    };
  }
  return index;
}

export function saveEmbeddingToIndex(derivedDir, slug, embedding, model = DEFAULT_EMBED_MODEL) {
  const db = getDb(derivedDir);
  const now = new Date().toISOString();
  const embeddingJson = JSON.stringify(embedding);
  
  db.transaction(() => {
    db.prepare(`
      INSERT INTO vault_embeddings (slug, model, generated_at, embedding_json)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(slug) DO UPDATE SET
        model=excluded.model,
        generated_at=excluded.generated_at,
        embedding_json=excluded.embedding_json
    `).run(slug, model, now, embeddingJson);
    
    const rowId = db.prepare('SELECT rowid FROM vault_embeddings WHERE slug = ?').get(slug).rowid;
    vssReplaceVault(db, rowId, embeddingJson);
  })();
}

export function removeEmbeddingFromIndex(derivedDir, slug) {
  const db = getDb(derivedDir);
  db.transaction(() => {
    const row = db.prepare('SELECT rowid FROM vault_embeddings WHERE slug = ?').get(slug);
    if (row) {
      vssDeleteVault(db, row.rowid);
      db.prepare('DELETE FROM vault_embeddings WHERE slug = ?').run(slug);
    }
  })();
}

export function nodeToEmbedText(node) {
  const parts = [];
  const title = node.title || node.slug;
  parts.push(`Title: ${title}`);
  if (node.category) parts.push(`Category: ${node.category}`);
  if (node.tags?.length) parts.push(`Tags: ${node.tags.join(', ')}`);
  if (node.body) parts.push(`Body: ${node.body.slice(0, 2000)}`);
  return parts.join('\n\n');
}

export function chunkNodeBody(body) {
  if (!body) return [];
  return body
    .split(/\n\n+/)
    .map(p => p.trim())
    .filter(p => p.length > 50);
}

export async function buildEmbeddingsIndex(nodes, derivedDir, opts = {}) {
  const { model = DEFAULT_EMBED_MODEL, force = false, onProgress } = opts;
  const db = getDb(derivedDir);

  if (force) {
    if (hasVss(db)) db.exec('DELETE FROM vss_vault_embeddings;');
    db.exec('DELETE FROM vault_embeddings;');
  }

  const existing = force ? {} : loadEmbeddingsIndex(derivedDir);
  
  // Clean up stale
  const activeSlugs = new Set(nodes.map(n => n.slug));
  const toDelete = [];
  for (const slug of Object.keys(existing)) {
    if (!activeSlugs.has(slug)) toDelete.push(slug);
  }
  
  if (toDelete.length > 0) {
    db.transaction(() => {
      for (const slug of toDelete) {
        const row = db.prepare('SELECT rowid FROM vault_embeddings WHERE slug = ?').get(slug);
        if (row) {
          vssDeleteVault(db, row.rowid);
          db.prepare('DELETE FROM vault_embeddings WHERE slug = ?').run(slug);
        }
      }
    })();
  }

  let built = 0, skipped = 0, failed = 0;

  for (const node of nodes) {
    const text = nodeToEmbedText(node);
    const contentHash = crypto.createHash('sha256').update(text).digest('hex');

    if (!force && existing[node.slug]) {
      const cachedHash = existing[node.slug].content_sha256;
      if (cachedHash && cachedHash === contentHash) {
        skipped++;
        continue;
      }
    }

    try {
      const parentEmbedding = await getEmbedding(text, undefined, model);
      const now = new Date().toISOString();
      const embeddingJson = JSON.stringify(parentEmbedding);

      db.transaction(() => {
        db.prepare(`
          INSERT INTO vault_embeddings (slug, model, generated_at, content_sha256, embedding_json)
          VALUES (?, ?, ?, ?, ?)
          ON CONFLICT(slug) DO UPDATE SET
            model=excluded.model,
            generated_at=excluded.generated_at,
            content_sha256=excluded.content_sha256,
            embedding_json=excluded.embedding_json
        `).run(node.slug, model, now, contentHash, embeddingJson);
        
        const rowId = db.prepare('SELECT rowid FROM vault_embeddings WHERE slug = ?').get(node.slug).rowid;
        vssReplaceVault(db, rowId, embeddingJson);
      })();

      built++;
      onProgress?.({ slug: node.slug, built, skipped, failed });
    } catch (err) {
      failed++;
      onProgress?.({ slug: node.slug, error: err.message, built, skipped, failed });
    }
  }

  return { built, skipped, failed };
}

// ─── Session index ───────────────────────────────────────────────────────────

export function loadSessionEmbeddingsIndex(derivedDir) {
  const db = getDb(derivedDir);
  const rows = db.prepare('SELECT key, embedding_json, model, generated_at, session_id, chunk, total_chunks, snippet FROM session_embeddings').all();
  const index = {};
  for (const row of rows) {
    index[row.key] = {
      embedding: JSON.parse(row.embedding_json),
      model: row.model,
      generated_at: row.generated_at,
      session_id: row.session_id,
      chunk: row.chunk,
      total_chunks: row.total_chunks,
      snippet: row.snippet
    };
  }
  return index;
}

export function saveSessionEmbeddingToIndex(derivedDir, key, snippet, embedding, model = DEFAULT_EMBED_MODEL) {
  const db = getDb(derivedDir);
  const now = new Date().toISOString();
  const embeddingJson = JSON.stringify(embedding);
  const session_id = key.split(':')[0];
  const chunkMatch = key.match(/chunk-(\d+)/);
  const chunk = chunkMatch ? parseInt(chunkMatch[1], 10) : 0;

  db.transaction(() => {
    db.prepare(`
      INSERT INTO session_embeddings (key, session_id, chunk, total_chunks, snippet, model, generated_at, embedding_json)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(key) DO UPDATE SET
        snippet=excluded.snippet,
        model=excluded.model,
        generated_at=excluded.generated_at,
        embedding_json=excluded.embedding_json
    `).run(key, session_id, chunk, 1, snippet.slice(0, 300), model, now, embeddingJson);
    
    const rowId = db.prepare('SELECT rowid FROM session_embeddings WHERE key = ?').get(key).rowid;
    vssReplaceSession(db, rowId, embeddingJson);
  })();
}

export function removeSessionEmbeddingFromIndex(derivedDir, sessionId) {
  const db = getDb(derivedDir);
  db.transaction(() => {
    const rows = db.prepare('SELECT rowid, key FROM session_embeddings WHERE session_id = ?').all(sessionId);
    for (const row of rows) {
      vssDeleteSession(db, row.rowid);
      db.prepare('DELETE FROM session_embeddings WHERE key = ?').run(row.key);
    }
  })();
}

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

export async function buildSessionEmbeddingsIndex(sessionsDir, derivedDir, opts = {}) {
  const { force = false, model = DEFAULT_EMBED_MODEL, onProgress } = opts;
  const db = getDb(derivedDir);

  if (!fs.existsSync(sessionsDir)) return { indexed: 0, skipped: 0, failed: 0, chunks: 0 };

  const files = fs.readdirSync(sessionsDir)
    .filter(f => f.endsWith('.jsonl') || f.endsWith('.json'));

  if (files.length === 0) return { indexed: 0, skipped: 0, failed: 0, chunks: 0 };

  if (force) {
    if (hasVss(db)) db.exec('DELETE FROM vss_session_embeddings;');
    db.exec('DELETE FROM session_embeddings;');
  }

  const existing = force ? {} : loadSessionEmbeddingsIndex(derivedDir);
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
        const snippet = chunks[i].slice(0, 300);
        
        db.transaction(() => {
          db.prepare(`
            INSERT INTO session_embeddings (key, session_id, chunk, total_chunks, snippet, model, generated_at, embedding_json)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(key) DO UPDATE SET
              snippet=excluded.snippet,
              model=excluded.model,
              generated_at=excluded.generated_at,
              embedding_json=excluded.embedding_json
          `).run(key, sessionId, i, chunks.length, snippet, model, new Date().toISOString(), JSON.stringify(embedding));
          
          const rowId = db.prepare('SELECT rowid FROM session_embeddings WHERE key = ?').get(key).rowid;
          vssReplaceSession(db, rowId, JSON.stringify(embedding));
        })();

        totalChunks++;
      }

      indexed++;
      onProgress?.({ sessionId, indexed, skipped, failed, chunks: totalChunks });
    } catch (err) {
      failed++;
      onProgress?.({ sessionId, error: err.message, indexed, skipped, failed });
    }
  }

  return { indexed, skipped, failed, chunks: totalChunks };
}
