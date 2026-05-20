/**
 * Total Recall — Full REST API Router
 *
 * Mounted at /api/* and /v1/* (OpenAI-compat extensions).
 *
 * Endpoints:
 *
 *   Memory
 *     GET    /api/memory              list nodes (supports ?q= search, ?category=, ?tag=)
 *     POST   /api/memory              create node
 *     GET    /api/memory/:slug        get node by slug
 *     PUT    /api/memory/:slug        update node (full replace)
 *     PATCH  /api/memory/:slug        partial update (body or tags)
 *     DELETE /api/memory/:slug        delete node
 *     POST   /api/memory/compile      recompile vault surface
 *     GET    /api/memory/stats        counts by category
 *
 *   Keys (Personal Access Tokens)
 *     GET    /api/keys                list keys (no raw tokens)
 *     POST   /api/keys                issue a new key (returns raw token once)
 *     DELETE /api/keys/:id            revoke key
 *
 *   Sessions
 *     GET    /api/sessions            list ingested sessions
 *     GET    /api/sessions/:id        get session by id
 *     POST   /api/sessions/ingest     ingest a session (from any source)
 *     DELETE /api/sessions/:id        delete session
 *
 *   Sandbox
 *     POST   /api/sandbox             execute Node.js code, return stdout/stderr
 *
 *   Config
 *     GET    /api/config              get sanitized runtime + security config
 *
 *   Models (OpenAI-compatible extension)
 *     GET    /v1/models               list available Ollama models
 *
 *   Vault (admin operations)
 *     POST   /api/vault/compile       trigger full surface recompile
 *     GET    /api/vault/status        vault file counts + last compile time
 *
 *   Discovery
 *     GET    /.well-known/total-recall.json   client auto-config manifest
 */

import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { spawn } from 'node:child_process';

import { loadNodes, writeNode, deleteNode, createNodeFromMcpPayload, walkMd } from '../core/vault.mjs';
import { compileSurface } from '../core/surface.mjs';
import { runInSandbox } from '../core/sandbox.mjs';
import { issueKey, revokeKey, loadKeys } from './keys.mjs';
import {
  requireAuth,
  requireScope,
  requireAuthOrLocal,
  loadSecurityConfig,
} from './auth.mjs';
import { getEmbedding, cosineSimilarity, loadEmbeddingsIndex, loadSessionEmbeddingsIndex, parseSessionFile, sessionToEmbedChunks, saveSessionEmbeddingToIndex, removeSessionEmbeddingFromIndex } from '../core/embeddings.mjs';
import { semanticSearch } from '../core/search.mjs';
import { listQueue, addToQueue, updateQueueItem, removeFromQueue } from '../core/research-queue.mjs';

const AGENT_DIR = process.env.AGENT_DIR || path.join(os.homedir(), '.agent');
const VAULT_DIR    = path.join(AGENT_DIR, 'memory-vault');
const SKILLS_DIR   = path.join(AGENT_DIR, 'skills');
const DERIVED_DIR  = path.join(AGENT_DIR, 'memory-derived');
const SESSIONS_DIR = path.join(AGENT_DIR, 'sessions');
const INSTRUCTIONS = path.join(AGENT_DIR, 'INSTRUCTIONS.md');

const router = express.Router();

// ─── Helpers ──────────────────────────────────────────────────────────────────

function notFound(res, msg) {
  return res.status(404).json({ error: msg || 'Not found' });
}

function badRequest(res, msg) {
  return res.status(400).json({ error: msg });
}

function serverError(res, err) {
  console.error('[REST]', err);
  return res.status(500).json({ error: err?.message || String(err) });
}

function nodes() {
  return loadNodes(VAULT_DIR);
}

function sanitizeNode({ body, ...rest }) {
  return { ...rest, content: body };
}

// ─── Memory ───────────────────────────────────────────────────────────────────

/**
 * GET /api/memory
 * Query params: q, category, tag, limit, offset
 */
router.get('/api/memory', requireAuth, requireScope('memory:read'), (req, res) => {
  try {
    let list = nodes();

    const { q, category, tag, limit = '200', offset = '0' } = req.query;

    if (q) {
      const query = String(q).toLowerCase();
      list = list.filter(n =>
        [n.slug, n.title, n.category, (n.tags || []).join(' '), n.body]
          .join(' ').toLowerCase().includes(query)
      );
    }
    if (category) {
      list = list.filter(n => n.category === category);
    }
    if (tag) {
      list = list.filter(n => (n.tags || []).includes(tag));
    }

    const total = list.length;
    const off   = Math.max(0, parseInt(offset, 10) || 0);
    const lim   = Math.min(500, Math.max(1, parseInt(limit, 10) || 200));
    const page  = list.slice(off, off + lim).map(sanitizeNode);

    res.json({ total, offset: off, limit: lim, nodes: page });
  } catch (err) {
    serverError(res, err);
  }
});

/**
 * GET /api/memory/stats
 */
router.get('/api/memory/stats', requireAuth, requireScope('memory:read'), (req, res) => {
  try {
    const list = nodes();
    const byCategory = {};
    for (const n of list) {
      byCategory[n.category] = (byCategory[n.category] || 0) + 1;
    }
    res.json({ total: list.length, by_category: byCategory });
  } catch (err) {
    serverError(res, err);
  }
});

/**
 * GET /api/memory/:slug
 */
router.get('/api/memory/:slug', requireAuth, requireScope('memory:read'), (req, res) => {
  try {
    const node = nodes().find(n => n.slug === req.params.slug);
    if (!node) return notFound(res, `Memory node not found: ${req.params.slug}`);
    res.json(sanitizeNode(node));
  } catch (err) {
    serverError(res, err);
  }
});

/**
 * POST /api/memory
 * Body: { slug, title, category, content, tags? }
 */
router.post('/api/memory', requireAuth, requireScope('memory:write'), (req, res) => {
  try {
    const { slug, title, category, content, tags } = req.body || {};
    if (!slug || !title || !category || !content) {
      return badRequest(res, 'Required fields: slug, title, category, content');
    }
    const existing = nodes().find(n => n.slug === slug);
    if (existing) {
      return res.status(409).json({ error: `Node already exists: ${slug}. Use PUT to update.` });
    }
    const node = createNodeFromMcpPayload({ slug, title, category, content });
    if (tags && Array.isArray(tags)) node.tags = tags;
    writeNode(node, VAULT_DIR);
    res.status(201).json(sanitizeNode(node));
  } catch (err) {
    serverError(res, err);
  }
});

/**
 * PUT /api/memory/:slug  — full replace
 */
router.put('/api/memory/:slug', requireAuth, requireScope('memory:write'), (req, res) => {
  try {
    const { title, category, content, tags } = req.body || {};
    if (!title || !category || !content) {
      return badRequest(res, 'Required fields: title, category, content');
    }
    const node = createNodeFromMcpPayload({ slug: req.params.slug, title, category, content });
    if (tags && Array.isArray(tags)) node.tags = tags;
    writeNode(node, VAULT_DIR);
    res.json(sanitizeNode(node));
  } catch (err) {
    serverError(res, err);
  }
});

/**
 * PATCH /api/memory/:slug  — partial update
 */
router.patch('/api/memory/:slug', requireAuth, requireScope('memory:write'), (req, res) => {
  try {
    const existing = nodes().find(n => n.slug === req.params.slug);
    if (!existing) return notFound(res, `Memory node not found: ${req.params.slug}`);

    const { title, category, content, tags } = req.body || {};
    const updated = createNodeFromMcpPayload({
      slug:     existing.slug,
      title:    title    ?? existing.title,
      category: category ?? existing.category,
      content:  content  ?? existing.body,
    });
    updated.tags = tags ?? existing.tags ?? [];
    updated.created_at = existing.created_at;

    writeNode(updated, VAULT_DIR);
    res.json(sanitizeNode(updated));
  } catch (err) {
    serverError(res, err);
  }
});

/**
 * DELETE /api/memory/:slug
 */
router.delete('/api/memory/:slug', requireAuth, requireScope('memory:write'), (req, res) => {
  try {
    const list = nodes();
    const node = list.find(n => n.slug === req.params.slug);
    if (!node) return notFound(res, `Memory node not found: ${req.params.slug}`);

    // Find and delete the file
    if (node._filePath && fs.existsSync(node._filePath)) {
      fs.unlinkSync(node._filePath);
    } else {
      // Walk and find it
      const files = walkMd(VAULT_DIR);
      for (const file of files) {
        const raw = fs.readFileSync(file, 'utf8');
        if (raw.includes(`slug: ${req.params.slug}`)) {
          fs.unlinkSync(file);
          break;
        }
      }
    }
    res.json({ deleted: true, slug: req.params.slug });
  } catch (err) {
    serverError(res, err);
  }
});

// ─── Vault ────────────────────────────────────────────────────────────────────

/**
 * POST /api/memory/search/semantic
 * Body: { query: string, top_k?: number }
 * Returns top-k vault nodes ranked by vector similarity to the query.
 * Requires Ollama with nomic-embed-text running.
 */
router.post('/api/memory/search/semantic', requireAuth, requireScope('memory:read'), async (req, res) => {
  try {
    const { query, top_k, include_sessions = true } = req.body || {};
    if (!query) return badRequest(res, 'query is required');
    const results = await semanticSearch(query, { vaultDir: VAULT_DIR, derivedDir: DERIVED_DIR, top_k, includeSessions: include_sessions });
    if (results.length === 0) return res.status(503).json({ error: 'Embeddings index is empty. Run POST /api/vault/compile to build it.' });
    res.json({ query, top_k: Math.min(Number(top_k) || 5, 20), results });
  } catch (err) {
    if (err.message?.includes('Ollama')) return res.status(503).json({ error: err.message });
    serverError(res, err);
  }
});

/**
 * POST /api/vault/compile
 */
router.post('/api/vault/compile', requireAuth, requireScope('memory:recompile'), async (req, res) => {
  try {
    const start = Date.now();
    await compileSurface({
      vaultDir:        VAULT_DIR,
      skillsDir:       SKILLS_DIR,
      derivedDir:      DERIVED_DIR,
      instructionsFile: INSTRUCTIONS,
    });
    // Incrementally embed any new vault nodes and sessions
    let vaultEmbed = null, sessionEmbed = null;
    try {
      const { buildEmbeddingsIndex, buildSessionEmbeddingsIndex } = await import('../core/embeddings.mjs');
      const { loadNodes } = await import('../core/vault.mjs');
      const vaultNodes = loadNodes(VAULT_DIR);
      vaultEmbed = await buildEmbeddingsIndex(vaultNodes, DERIVED_DIR);
      sessionEmbed = await buildSessionEmbeddingsIndex(SESSIONS_DIR, DERIVED_DIR);
    } catch { /* Ollama may not be running — non-fatal */ }
    res.json({ compiled: true, elapsed_ms: Date.now() - start, vault_embeddings: vaultEmbed, session_embeddings: sessionEmbed });
  } catch (err) {
    serverError(res, err);
  }
});

/**
 * GET /api/vault/status
 */
router.get('/api/vault/status', requireAuth, requireScope('memory:read'), (req, res) => {
  try {
    const nodeCount   = fs.existsSync(VAULT_DIR)  ? walkMd(VAULT_DIR).length  : 0;
    const skillCount  = fs.existsSync(SKILLS_DIR)  ? fs.readdirSync(SKILLS_DIR).filter(d =>
      fs.existsSync(path.join(SKILLS_DIR, d, 'SKILL.md'))).length : 0;
    const lastCompile = fs.existsSync(INSTRUCTIONS)
      ? fs.statSync(INSTRUCTIONS).mtime.toISOString()
      : null;
    const derivedFiles = fs.existsSync(DERIVED_DIR)
      ? fs.readdirSync(DERIVED_DIR).length : 0;

    const vaultEmbedCount   = fs.existsSync(path.join(DERIVED_DIR, 'embeddings.json'))
      ? Object.keys(JSON.parse(fs.readFileSync(path.join(DERIVED_DIR, 'embeddings.json'), 'utf8') || '{}')).length : 0;
    const sessionEmbedCount = fs.existsSync(path.join(DERIVED_DIR, 'session-embeddings.json'))
      ? Object.keys(JSON.parse(fs.readFileSync(path.join(DERIVED_DIR, 'session-embeddings.json'), 'utf8') || '{}')).length : 0;

    // Ollama reachability (best-effort)
    let ollamaOk = false;
    try {
      const r = await fetch(`${process.env.OLLAMA_URL || 'http://127.0.0.1:11434'}/api/tags`, { signal: AbortSignal.timeout(2000) });
      ollamaOk = r.ok;
    } catch { /* offline */ }

    res.json({
      vault_dir:     VAULT_DIR,
      node_count:    nodeCount,
      skill_count:   skillCount,
      derived_files: derivedFiles,
      last_compile:  lastCompile,
      instructions_exists: fs.existsSync(INSTRUCTIONS),
      embeddings: {
        vault_nodes:    vaultEmbedCount,
        session_chunks: sessionEmbedCount,
      },
      ollama: { ok: ollamaOk, url: process.env.OLLAMA_URL || 'http://127.0.0.1:11434' },
    });
  } catch (err) {
    serverError(res, err);
  }
});

// ─── Keys ─────────────────────────────────────────────────────────────────────

/**
 * GET /api/keys
 */
router.get('/api/keys', requireAuth, requireScope('keys:read'), (req, res) => {
  try {
    const keys = loadKeys().map(({ token_hash, ...k }) => k);
    res.json({ keys });
  } catch (err) {
    serverError(res, err);
  }
});

/**
 * POST /api/keys
 * Body: { name, scopes?, expires_at? }
 * Returns raw token once — store it immediately.
 */
router.post('/api/keys', requireAuth, requireScope('keys:write'), (req, res) => {
  try {
    const { name, scopes, expires_at } = req.body || {};
    if (!name) return badRequest(res, 'name is required');
    const key = issueKey(name, { scopes, expires_at });
    res.status(201).json({
      id:         key.id,
      name:       key.name,
      token:      key.token,  // only time it's returned in plaintext
      token_prefix: key.token_prefix,
      scopes:     key.scopes,
      expires_at: key.expires_at,
      created_at: key.created_at,
      _warning:   'Save this token — it will not be shown again.',
    });
  } catch (err) {
    serverError(res, err);
  }
});

/**
 * DELETE /api/keys/:id
 */
router.delete('/api/keys/:id', requireAuth, requireScope('keys:write'), (req, res) => {
  try {
    const key = revokeKey(req.params.id);
    if (!key) return notFound(res, `Key not found: ${req.params.id}`);
    res.json({ revoked: true, id: key.id, name: key.name });
  } catch (err) {
    serverError(res, err);
  }
});

// ─── Sessions ─────────────────────────────────────────────────────────────────

function sessionsDir() {
  return SESSIONS_DIR;
}

function listSessionFiles() {
  const dir = sessionsDir();
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir)
    .filter(f => f.endsWith('.jsonl') || f.endsWith('.json'))
    .sort()
    .reverse(); // newest first
}

function readSessionFile(filename) {
  const filePath = path.join(sessionsDir(), filename);
  if (!fs.existsSync(filePath)) return null;
  const raw = fs.readFileSync(filePath, 'utf8').trim();
  const lines = raw.split('\n').filter(Boolean);
  const entries = lines.map(l => {
    try { return JSON.parse(l); } catch { return null; }
  }).filter(Boolean);
  return { id: filename.replace(/\.(jsonl|json)$/, ''), filename, entries, count: entries.length };
}

/**
 * GET /api/sessions
 */
router.get('/api/sessions', requireAuth, requireScope('memory:read'), (req, res) => {
  try {
    const files = listSessionFiles();
    const { limit = '50', offset = '0' } = req.query;
    const off = parseInt(offset, 10) || 0;
    const lim = Math.min(200, parseInt(limit, 10) || 50);
    const page = files.slice(off, off + lim).map(f => {
      const data = readSessionFile(f);
      return { id: data?.id, filename: f, count: data?.count || 0 };
    });
    res.json({ total: files.length, offset: off, limit: lim, sessions: page });
  } catch (err) {
    serverError(res, err);
  }
});

/**
 * GET /api/sessions/:id
 */
router.get('/api/sessions/:id', requireAuth, requireScope('memory:read'), (req, res) => {
  try {
    const files = listSessionFiles();
    const match = files.find(f => f.startsWith(req.params.id));
    if (!match) return notFound(res, `Session not found: ${req.params.id}`);
    const data = readSessionFile(match);
    res.json(data);
  } catch (err) {
    serverError(res, err);
  }
});

/**
 * POST /api/sessions/ingest
 *
 * Accepts two formats:
 *   A) Raw file relay (from `npx total-recall relay`):
 *      { source, path, content, sha256 }
 *      — content is the raw file text; server parses it based on source type
 *
 *   B) Pre-parsed messages:
 *      { id, source, messages: [{role, content}] }
 */
router.post('/api/sessions/ingest', requireAuth, requireScope('memory:write'), (req, res) => {
  try {
    const body = req.body || {};
    const source = body.source || 'api';

    let messages;

    if (body.content && typeof body.content === 'string') {
      // Format A: raw file content from the relay — extract human/assistant turns
      messages = parseRawSessionContent(body.content, source);
    } else if (Array.isArray(body.messages)) {
      // Format B: pre-parsed messages array
      messages = body.messages;
    } else {
      return badRequest(res, 'Provide either {content} (raw file) or {messages:[{role,content}]}');
    }

    if (messages.length === 0) {
      return res.status(200).json({ ingested: false, reason: 'no extractable messages' });
    }

    // Deduplicate by sha256 of the raw content (relay always sends sha256)
    if (body.sha256) {
      const hashIndex = path.join(AGENT_DIR, 'memory-derived', 'relay-hashes.jsonl');
      fs.mkdirSync(path.dirname(hashIndex), { recursive: true });
      const seen = new Set(
        fs.existsSync(hashIndex)
          ? fs.readFileSync(hashIndex, 'utf8').split('\n').filter(Boolean).map(l => { try { return JSON.parse(l).sha256; } catch { return ''; } })
          : []
      );
      if (seen.has(body.sha256)) {
        return res.status(200).json({ ingested: false, reason: 'duplicate' });
      }
      fs.appendFileSync(hashIndex, JSON.stringify({ sha256: body.sha256, ts: new Date().toISOString(), source }) + '\n');
    }

    const sessionId = body.id || `relay-${source}-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
    const filename  = `${sessionId}.jsonl`;
    const dir = sessionsDir();
    fs.mkdirSync(dir, { recursive: true });
    const filePath = path.join(dir, filename);

    const lines = messages.map(m => JSON.stringify({
      role:       m.role,
      content:    m.content,
      source,
      session_id: sessionId,
      timestamp:  new Date().toISOString(),
    }));
    fs.writeFileSync(filePath, lines.join('\n') + '\n', 'utf8');

    // Best-effort: embed session immediately so it's searchable right away
    setImmediate(async () => {
      try {
        const msgs = parseSessionFile(filePath);
        const chunks = sessionToEmbedChunks(msgs);
        for (let i = 0; i < chunks.length; i++) {
          const key = chunks.length === 1 ? sessionId : `${sessionId}:chunk-${i}`;
          const embedding = await getEmbedding(chunks[i]);
          saveSessionEmbeddingToIndex(DERIVED_DIR, key, chunks[i], embedding);
        }
      } catch { /* Ollama may not be running — non-fatal */ }
    });

    res.status(201).json({ ingested: true, id: sessionId, count: messages.length });
  } catch (err) {
    serverError(res, err);
  }
});

/**
 * Extract human/assistant turns from raw IDE session file content.
 * Handles JSONL (Claude Code, Codex, Cursor, VS Code) and plaintext (Antigravity overview).
 */
function parseRawSessionContent(content, source) {
  const messages = [];
  const lines = content.split('\n').filter(Boolean);

  // Try JSONL first (most IDE formats)
  let jsonlParsed = 0;
  for (const line of lines) {
    let rec;
    try { rec = JSON.parse(line); } catch { continue; }
    jsonlParsed++;

    // Claude Code / Codex / Cursor format
    if (rec.role && (rec.content || rec.message)) {
      const text = typeof rec.content === 'string' ? rec.content
        : Array.isArray(rec.content) ? rec.content.filter(b => b.type === 'text').map(b => b.text).join('\n')
        : typeof rec.message?.text === 'string' ? rec.message.text
        : '';
      if (text.trim()) messages.push({ role: rec.role, content: text.slice(0, 8000) });
      continue;
    }

    // VS Code kind:2 requests array
    if (rec.kind === 2 && Array.isArray(rec.v)) {
      for (const req of rec.v) {
        const user = req.message?.text || '';
        const asst = req.response?.response?.value || req.response?.value || '';
        if (user) messages.push({ role: 'user',      content: user.slice(0, 8000) });
        if (asst) messages.push({ role: 'assistant', content: asst.slice(0, 8000) });
      }
    }
  }

  // If JSONL parsing got nothing meaningful, treat as plaintext (Antigravity overview.txt)
  if (messages.length === 0 && content.trim()) {
    messages.push({ role: 'assistant', content: content.slice(0, 20000) });
  }

  return messages;
}

/**
 * DELETE /api/sessions/:id
 */
router.delete('/api/sessions/:id', requireAuth, requireScope('memory:write'), (req, res) => {
  try {
    const files = listSessionFiles();
    const match = files.find(f => f.startsWith(req.params.id));
    if (!match) return notFound(res, `Session not found: ${req.params.id}`);
    fs.unlinkSync(path.join(sessionsDir(), match));
    // Remove from session embeddings index too
    try { removeSessionEmbeddingFromIndex(DERIVED_DIR, req.params.id); } catch { /* non-fatal */ }
    res.json({ deleted: true, id: req.params.id });
  } catch (err) {
    serverError(res, err);
  }
});

// ─── Sandbox ──────────────────────────────────────────────────────────────────

/**
 * POST /api/sandbox
 * Body: { code }
 */
router.post('/api/sandbox', requireAuth, requireScope('sandbox:run'), async (req, res) => {
  try {
    const { code } = req.body || {};
    if (!code) return badRequest(res, 'code is required');

    const tmpDir  = path.join(os.tmpdir(), 'total-recall-sandbox');
    fs.mkdirSync(tmpDir, { recursive: true });
    const script  = path.join(tmpDir, `rest-${Date.now()}.mjs`);
    fs.writeFileSync(script, code);

    const result = await runInSandbox(script, 15000);
    try { fs.unlinkSync(script); } catch {}

    res.json({
      success: result.success,
      exit_code: result.code,
      output: result.output,
    });
  } catch (err) {
    serverError(res, err);
  }
});

// ─── Config ───────────────────────────────────────────────────────────────────

/**
 * GET /api/config
 * Returns sanitized config (no secrets, no tokens)
 */
router.get('/api/config', requireAuth, requireScope('config:read'), async (req, res) => {
  try {
    const sec = loadSecurityConfig();
    // Scrub anything that looks like a secret
    const safe = JSON.parse(JSON.stringify(sec));
    if (safe.api) { safe.api.pats = '[redacted]'; }

    // Runtime config (sanitized)
    const runtimePath = path.join(AGENT_DIR, 'config', 'runtime.yml');
    let runtime = null;
    if (fs.existsSync(runtimePath)) {
      try {
        const { default: yaml } = await import('yaml');
        runtime = yaml.parse(fs.readFileSync(runtimePath, 'utf8'));
        // Remove any api_key fields
        for (const key of ['api_key', 'apiKey', 'secret', 'token']) {
          if (runtime[key]) runtime[key] = '[redacted]';
        }
      } catch {}
    }

    res.json({ security: safe, runtime });
  } catch (err) {
    serverError(res, err);
  }
});

// ─── Models (OpenAI-compatible) ───────────────────────────────────────────────

/**
 * GET /v1/models
 */
router.get('/v1/models', requireAuthOrLocal, async (req, res) => {
  try {
    let models = [];
    try {
      const controller = new AbortController();
      setTimeout(() => controller.abort(), 3000);
      const r = await fetch('http://localhost:11434/api/tags', { signal: controller.signal });
      if (r.ok) {
        const data = await r.json();
        models = (data.models || []).map(m => ({
          id:       m.name,
          object:   'model',
          created:  Math.floor(Date.now() / 1000),
          owned_by: 'ollama',
        }));
      }
    } catch {}

    // Always include the virtual total-recall model
    if (!models.find(m => m.id === 'total-recall')) {
      models.unshift({
        id:       'total-recall',
        object:   'model',
        created:  Math.floor(Date.now() / 1000),
        owned_by: 'total-recall',
      });
    }

    res.json({ object: 'list', data: models });
  } catch (err) {
    serverError(res, err);
  }
});

// ─── Discovery manifest ────────────────────────────────────────────────────────

/**
 * GET /.well-known/total-recall.json
 * Used by UltraChat and other clients for auto-configuration.
 */
router.get('/.well-known/total-recall.json', (req, res) => {
  try {
    const proto  = req.secure ? 'https' : 'http';
    const host   = req.headers.host || 'localhost:3000';
    const base   = `${proto}://${host}`;
    const sec    = loadSecurityConfig();

    res.json({
      name:          'Total Recall',
      version:       '3.0.0',
      base_url:      base,
      api:           `${base}/v1`,
      mcp:           `${base}/mcp`,
      health:        `${base}/health`,
      models:        `${base}/v1/models`,
      auth: {
        type:        'bearer',
        token_prefix: 'tr_',
        scopes: ['chat:read', 'chat:write', 'memory:read', 'memory:write', 'mcp:use'],
      },
      capabilities:  ['chat', 'memory', 'mcp', 'sandbox', 'sessions'],
      rate_limits: {
        api: sec.rate_limits?.api_requests_per_minute || 60,
        mcp: sec.rate_limits?.mcp_requests_per_minute || 120,
      },
    });
  } catch (err) {
    serverError(res, err);
  }
});

// ─── API reference (human-readable) ───────────────────────────────────────────

/**
 * GET /api
 * Returns the full API reference as JSON (machine + human readable).
 */
router.get('/api', (req, res) => {
  const proto = req.secure ? 'https' : 'http';
  const base  = `${proto}://${req.headers.host || 'localhost:3000'}`;

  res.json({
    name:    'Total Recall REST API',
    version: '3.0.0',
    base_url: base,
    auth: {
      description: 'All endpoints require a Bearer PAT (Personal Access Token).',
      header:      'Authorization: Bearer tr_<token>',
      issue:       'npx total-recall generate-pat --scopes "*" --label myapp',
      endpoint:    'POST /api/keys',
    },
    endpoints: {
      memory: {
        'GET /api/memory':                        'List nodes (q, category, tag, limit, offset)',
        'GET /api/memory/stats':                  'Node counts by category',
        'GET /api/memory/:slug':                  'Get node by slug',
        'POST /api/memory':                       'Create node (slug, title, category, content)',
        'POST /api/memory/search/semantic':       'Semantic search by meaning (query, top_k) — requires Ollama',
        'PUT /api/memory/:slug':                  'Replace node',
        'PATCH /api/memory/:slug':                'Partial update',
        'DELETE /api/memory/:slug':               'Delete node',
      },
      vault: {
        'POST /api/vault/compile':          'Recompile SSSS surface (INSTRUCTIONS.md)',
        'GET /api/vault/status':            'Node count, skill count, last compile time',
      },
      keys: {
        'GET /api/keys':                    'List PATs (no raw tokens)',
        'POST /api/keys':                   'Issue new PAT (name, scopes[], expires_at)',
        'DELETE /api/keys/:id':             'Revoke PAT',
      },
      sessions: {
        'GET /api/sessions':                'List ingested sessions',
        'GET /api/sessions/:id':            'Get session entries',
        'POST /api/sessions/ingest':        'Ingest session {id, source, messages[]}',
        'DELETE /api/sessions/:id':         'Delete session',
      },
      sandbox: {
        'POST /api/sandbox':                'Execute Node.js code {code}',
      },
      config: {
        'GET /api/config':                  'Sanitized runtime + security config',
      },
      models: {
        'GET /v1/models':                   'OpenAI-compatible model list',
        'POST /v1/chat/completions':        'OpenAI-compatible chat (streaming supported)',
      },
      discovery: {
        'GET /.well-known/total-recall.json': 'Client auto-config manifest',
        'GET /health':                      'System health (disk, ollama, vault)',
      },
    },
    scopes: {
      '*':              'All permissions',
      'chat:read':      'Read chat completions',
      'chat:write':     'Create chat completions',
      'memory:read':    'Read memory nodes and sessions',
      'memory:write':   'Write/delete memory nodes and sessions',
      'memory:recompile': 'Trigger vault recompile',
      'keys:read':      'List API keys',
      'keys:write':     'Issue/revoke API keys',
      'sandbox:run':    'Execute code in sandbox',
      'config:read':    'Read sanitized config',
      'mcp:use':        'Use MCP JSON-RPC gateway',
      'health:read':    'Read health endpoints',
    },
    mcp: {
      endpoint:   `${base}/mcp`,
      protocol:   'JSON-RPC 2.0',
      initialize: { method: 'initialize', params: { protocolVersion: '2025-06-18', clientInfo: { name: 'your-app', version: '1.0' }, capabilities: {} } },
      tools:      ['list_memory', 'read_memory', 'search_memory', 'semantic_search', 'write_memory', 'delete_memory', 'recompile_surface', 'run_sandbox', 'read_file', 'list_directory', 'search_files'],
      resources:  ['total-recall://instructions', 'total-recall://memory/index', 'total-recall://ssss/skill'],
    },
  });
});

// ─── Research Queue ───────────────────────────────────────────────────────────
// Thin REST wrappers over src/core/research-queue.mjs

router.get('/api/research', requireAuth, requireScope('memory:read'), (req, res) => {
  try {
    const { status, limit, offset } = req.query;
    res.json(listQueue({ status, limit, offset }));
  } catch (err) { serverError(res, err); }
});

router.post('/api/research', requireAuth, requireScope('memory:write'), (req, res) => {
  try {
    const { topic, priority, notes } = req.body || {};
    if (!topic) return badRequest(res, 'topic is required');
    res.status(201).json(addToQueue({ topic, priority, notes }));
  } catch (err) { serverError(res, err); }
});

router.patch('/api/research/:id', requireAuth, requireScope('memory:write'), (req, res) => {
  try {
    res.json(updateQueueItem(req.params.id, req.body || {}));
  } catch (err) {
    if (err.status === 404) return notFound(res, err.message);
    serverError(res, err);
  }
});

router.delete('/api/research/:id', requireAuth, requireScope('memory:write'), (req, res) => {
  try {
    res.json(removeFromQueue(req.params.id));
  } catch (err) {
    if (err.status === 404) return notFound(res, err.message);
    serverError(res, err);
  }
});

// ─── Brain Export ─────────────────────────────────────────────────────────────

/**
 * GET /api/brain/export
 * Streams entire brain as .tar.gz: vault, derived, sessions, config, skills.
 * Query: ?include=vault,derived,sessions,config,skills  (default: all)
 */
router.get('/api/brain/export', requireAuth, requireScope('memory:read'), async (req, res) => {
  try {
    const ALL_PARTS = {
      vault:    VAULT_DIR,
      derived:  DERIVED_DIR,
      sessions: SESSIONS_DIR,
      config:   path.join(AGENT_DIR, 'config'),
      skills:   SKILLS_DIR,
    };
    const requested = req.query.include
      ? String(req.query.include).split(',').map(s => s.trim())
      : Object.keys(ALL_PARTS);
    const dirs = requested.filter(k => ALL_PARTS[k] && fs.existsSync(ALL_PARTS[k]));
    if (dirs.length === 0) return res.status(404).json({ error: 'No brain data found to export.' });

    const date = new Date().toISOString().slice(0, 10);
    res.setHeader('Content-Type', 'application/gzip');
    res.setHeader('Content-Disposition', `attachment; filename="total-recall-brain-${date}.tar.gz"`);

    const relativeDirs = dirs.map(k => path.relative(AGENT_DIR, ALL_PARTS[k]));
    const tar = spawn('tar', ['czf', '-', '-C', AGENT_DIR, ...relativeDirs], { stdio: ['ignore', 'pipe', 'ignore'] });
    tar.stdout.pipe(res);
    tar.on('error', err => { if (!res.headersSent) serverError(res, err); });
    tar.on('close', code => { if (code !== 0 && !res.writableEnded) res.end(); });
  } catch (err) { serverError(res, err); }
});

export { router as restRouter };
