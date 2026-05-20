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
import matter from 'gray-matter';
import { fileURLToPath } from 'node:url';
import { loadRuntimeConfig } from '../core/runtime.mjs';


import { loadNodes, writeNode, deleteNode, createNodeFromMcpPayload, walkMd } from '../core/vault.mjs';
import { compileSurface } from '../core/surface.mjs';
import { runInSandbox } from '../core/sandbox.mjs';
import { issueKey, revokeKey, loadKeys } from './keys.mjs';
import {
  requireAuth,
  requireScope,
  requireAuthOrLocal,
  loadSecurityConfig,
  loginHandler,
  logoutHandler,
  changePasswordHandler,
} from './auth.mjs';
import { getEmbedding, cosineSimilarity, loadEmbeddingsIndex, loadSessionEmbeddingsIndex, parseSessionFile, sessionToEmbedChunks, saveSessionEmbeddingToIndex, removeSessionEmbeddingFromIndex } from '../core/embeddings.mjs';
import { semanticSearch } from '../core/search.mjs';
import { listQueue, addToQueue, updateQueueItem, removeFromQueue } from '../core/research-queue.mjs';
import { detectRuleFiles, importRuleFiles } from '../core/import-rules.mjs';
import { synthesize as synthesizeTts, isTtsEnabled, TtsNotConfiguredError } from '../core/tts.mjs';
import { logger } from '../core/logger.mjs';

const AGENT_DIR = process.env.AGENT_DIR || path.join(os.homedir(), '.agent');
const VAULT_DIR    = path.join(AGENT_DIR, 'memory-vault');
const SKILLS_DIR   = path.join(AGENT_DIR, 'skills');
const DERIVED_DIR  = path.join(AGENT_DIR, 'memory-derived');
const SESSIONS_DIR = path.join(AGENT_DIR, 'sessions');
const INSTRUCTIONS = path.join(AGENT_DIR, 'INSTRUCTIONS.md');
const FILES_DIR    = path.join(AGENT_DIR, 'files');
const TASKS_DIR    = path.join(AGENT_DIR, 'scheduler', 'queue');
const CONFIG_DIR   = path.join(AGENT_DIR, 'config');

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const MODEL_CATALOG_DIR = path.join(ROOT, 'models', 'catalog', 'total-recall');

function listFilesRecursive(root, predicate) {
  const out = [];
  if (!fs.existsSync(root)) return out;
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    const fullPath = path.join(root, entry.name);
    if (entry.isDirectory()) out.push(...listFilesRecursive(fullPath, predicate));
    else if (entry.isFile() && predicate(fullPath)) out.push(fullPath);
  }
  return out;
}

function loadCatalogModels(runtimeConfig = {}) {
  const modelFiles = listFilesRecursive(MODEL_CATALOG_DIR, file => path.basename(file) === 'MODEL.md');
  return modelFiles.map((filePath) => {
    const raw = fs.readFileSync(filePath, 'utf8');
    const parsed = matter(raw);
    const data = parsed.data || {};
    const folderId = path.basename(path.dirname(filePath));
    const id = data.name || `total-recall/${folderId}`;
    const aliases = [...new Set([
      id,
      data.model_id,
      data.name,
      `total-recall/${folderId}`,
      folderId
    ].filter(Boolean))];

    return {
      id,
      object: 'model',
      created: 0,
      owned_by: data.provider || 'total-recall',
      root: runtimeConfig.model || data.model_id || id,
      parent: null,
      aliases,
      metadata: {
        provider: data.provider || 'total-recall',
        provider_type: data.provider_type || 'local-runtime',
        display_name: data.display_name || data.name || id,
        model_id: data.model_id || id,
        runtime_model: runtimeConfig.model || null,
        pricing_prompt: data.pricing_prompt ?? 0,
        pricing_completion: data.pricing_completion ?? 0,
        supports_tools: data.supports_tools ?? true,
        supports_vision: data.supports_vision ?? false,
        supports_code: data.supports_code ?? true
      }
    };
  });
}

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
router.get('/api/vault/status', requireAuth, requireScope('memory:read'), async (req, res) => {
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

  const id = filename.replace(/\.(jsonl|json)$/, '');
  let exchanges = entries;
  if (entries.length === 1 && entries[0] && Array.isArray(entries[0].messages)) {
    exchanges = entries[0].messages.map(m => ({
      ...m,
      session_id: m.session_id || entries[0].id || entries[0].session_id || id
    }));
  } else {
    exchanges = entries.map(m => ({
      ...m,
      session_id: m.session_id || id
    }));
  }

  return {
    id,
    filename,
    entries,
    exchanges,
    count: exchanges.length
  };
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
      const stat = fs.statSync(path.join(sessionsDir(), f));
      return {
        id: data?.id,
        filename: f,
        count: data?.count || 0,
        modified: stat.mtime.toISOString(),
        size: stat.size
      };
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

    let rawSessionId = body.id || `relay-${source}-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
    const sessionId = rawSessionId.replace(/[^a-zA-Z0-9_-]/g, '_');
    const filename  = `${sessionId}.jsonl`;
    const dir = sessionsDir();
    fs.mkdirSync(dir, { recursive: true });
    const filePath = path.join(dir, filename);

    const sessionObj = {
      id: sessionId,
      source,
      messages: messages.map(m => ({
        role:       m.role,
        content:    m.content,
        source,
        session_id: sessionId,
        timestamp:  m.timestamp || new Date().toISOString(),
      }))
    };
    fs.writeFileSync(filePath, JSON.stringify(sessionObj) + '\n', 'utf8');

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

    res.status(200).json({ ok: true, ingested: true, id: sessionId, count: messages.length });
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
    if (source === 'antigravity') {
      const lineArray = content.split('\n').filter(Boolean);
      for (const line of lineArray) {
        const trimmed = line.trim();
        if (!trimmed) continue;

        let role = 'assistant';
        if (trimmed.startsWith('USER:') || trimmed.startsWith('User:') || trimmed.startsWith('[user]')) {
          role = 'user';
        } else if (trimmed.startsWith('TOOL:') || trimmed.startsWith('[tool]') || trimmed.includes('tool_call')) {
          role = 'tool';
        }
        messages.push({ role, content: trimmed.slice(0, 8000) });
      }
    } else {
      messages.push({ role: 'assistant', content: content.slice(0, 20000) });
    }
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
    const runtimeConfig = loadRuntimeConfig(path.join(CONFIG_DIR, 'runtime.yml'));
    const catalogModels = loadCatalogModels(runtimeConfig);
    const data = catalogModels.length > 0
      ? catalogModels
      : [{
          id: runtimeConfig.model,
          object: 'model',
          created: 0,
          owned_by: 'total-recall',
          root: runtimeConfig.model,
          parent: null,
          aliases: [runtimeConfig.model],
          metadata: {
            provider: 'total-recall',
            provider_type: runtimeConfig.runtime || 'local-runtime',
            display_name: runtimeConfig.model,
            model_id: runtimeConfig.model,
            runtime_model: runtimeConfig.model,
            pricing_prompt: 0,
            pricing_completion: 0,
            supports_tools: true,
            supports_vision: false,
            supports_code: true
          }
        }];

    res.json({ object: 'list', data });
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

// ─── Rule File Import ─────────────────────────────────────────────────────────
// Thin wrappers over src/core/import-rules.mjs

/**
 * GET /api/import/rules
 * Detect existing rule files in given dirs.
 * Query: ?dir=/path  (repeatable, default: process.cwd())
 */
router.get('/api/import/rules', requireAuth, requireScope('memory:read'), (req, res) => {
  try {
    const dirs = req.query.dir ? (Array.isArray(req.query.dir) ? req.query.dir : [req.query.dir]) : [process.cwd()];
    const detected = detectRuleFiles(dirs);
    res.json({ dirs, detected });
  } catch (err) { serverError(res, err); }
});

/**
 * POST /api/import/rules
 * Import rule files into the vault.
 * Body: { dirs?: string[], files?: string[], force?: boolean, dryRun?: boolean }
 */
router.post('/api/import/rules', requireAuth, requireScope('memory:write'), (req, res) => {
  try {
    const { dirs, force = false, dryRun = false } = req.body || {};
    const detected = detectRuleFiles(dirs?.length ? dirs : [process.cwd()]);
    const toImport = req.body?.files?.length
      ? detected.filter(f => req.body.files.includes(f.absolutePath))
      : detected.filter(f => !f.alreadyImported || force);
    if (dryRun) return res.json({ dryRun: true, detected, toImport, imported: [], skipped: [], failed: [] });
    const result = importRuleFiles(toImport, { force, vaultDir: VAULT_DIR });
    res.json({ detected, ...result });
  } catch (err) { serverError(res, err); }
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

// ─── Dashboard Intelligence Endpoints (feature-flagged) ──────────────────────────
// Feature flag: presence of ~/.agent/memory-vault/preferences/dashboard-enhanced.md

function isDashboardEnhanced() {
  return fs.existsSync(path.join(VAULT_DIR, '..', 'preferences', 'dashboard-enhanced.md'));
}

router.get('/api/graph', requireAuth, requireScope('ssss:read'), (req, res) => {
  if (!isDashboardEnhanced()) {
    return res.status(404).json({ error: 'dashboard-enhanced feature flag not enabled' });
  }
  try {
    const graphFile = path.join(DERIVED_DIR, 'graph-index.jsonl');
    const routesFile = path.join(DERIVED_DIR, 'skill-routes.jsonl');
    const nodes = fs.existsSync(graphFile)
      ? fs.readFileSync(graphFile, 'utf8').split('\n').filter(Boolean).map(l => JSON.parse(l))
      : [];
    const routes = fs.existsSync(routesFile)
      ? fs.readFileSync(routesFile, 'utf8').split('\n').filter(Boolean).map(l => JSON.parse(l))
      : [];
    res.json({ nodes, routes });
  } catch (err) { serverError(res, err); }
});

router.get('/api/conflicts', requireAuth, requireScope('ssss:read'), async (req, res) => {
  if (!isDashboardEnhanced()) {
    return res.status(404).json({ error: 'dashboard-enhanced feature flag not enabled' });
  }
  try {
    const { detectSemanticConflicts } = await import('../core/conflict-detector.mjs');
    const list = nodes();
    const conflicts = [];
    for (let i = 0; i < list.length; i++) {
      const found = detectSemanticConflicts(list[i], list.slice(0, i));
      conflicts.push(...found);
    }
    res.json({ conflicts });
  } catch (err) { serverError(res, err); }
});

// ─── Files, Skills & Tasks ───────────────────────────────────────────────────

router.get('/api/files', requireAuth, requireScope('files:read'), (req, res) => {
  try {
    if (!fs.existsSync(FILES_DIR)) {
      fs.mkdirSync(FILES_DIR, { recursive: true });
    }
    const files = fs.readdirSync(FILES_DIR).map(file => {
      const stats = fs.statSync(path.join(FILES_DIR, file));
      return {
        name: file,
        size: stats.size,
        modified: stats.mtime,
        isDirectory: stats.isDirectory()
      };
    });
    res.json(files);
  } catch (err) { serverError(res, err); }
});

router.get('/api/skills', requireAuth, requireScope('files:read', 'ssss:read'), (req, res) => {
  try {
    if (!fs.existsSync(SKILLS_DIR)) {
      fs.mkdirSync(SKILLS_DIR, { recursive: true });
    }
    const skills = fs.readdirSync(SKILLS_DIR).map(dir => {
      const dirPath = path.join(SKILLS_DIR, dir);
      const stats = fs.statSync(dirPath);
      return {
        name: dir,
        size: stats.size,
        modified: stats.mtime,
        isDirectory: stats.isDirectory()
      };
    });
    res.json(skills);
  } catch (err) { serverError(res, err); }
});

router.get('/api/tasks', requireAuth, requireScope('tasks:read'), (req, res) => {
  try {
    if (!fs.existsSync(TASKS_DIR)) {
      return res.json([]);
    }
    const tasks = [];
    const files = fs.readdirSync(TASKS_DIR);
    for (const file of files) {
      if (!file.endsWith('.md')) continue;
      try {
        const raw = fs.readFileSync(path.join(TASKS_DIR, file), 'utf8');
        const { data, content } = matter(raw);
        tasks.push({ ...data, body: content.trim(), slug: file.replace('.md', '') });
      } catch (e) {
        // skip
      }
    }
    res.json(tasks.sort((a, b) => (a.priority || 5) - (b.priority || 5)));
  } catch (err) { serverError(res, err); }
});

router.post('/api/tasks', requireAuth, requireScope('tasks:write'), (req, res) => {
  try {
    const { category, target, body, priority = 5 } = req.body || {};
    if (!category || !target) {
      return badRequest(res, 'Missing category or target');
    }
    if (!fs.existsSync(TASKS_DIR)) {
      fs.mkdirSync(TASKS_DIR, { recursive: true });
    }
    const slug = `task-${Date.now()}`;
    const frontmatter = {
      type: 'task',
      priority,
      category,
      target,
      estimated_calls: 5,
      deadline: new Date(Date.now() + 86400000).toISOString().split('T')[0],
      created_by: 'api',
      reason: 'User requested deep research via Chat UI',
      status: 'pending',
      progress: 0
    };
    const raw = matter.stringify(body || '', frontmatter);
    fs.writeFileSync(path.join(TASKS_DIR, `${slug}.md`), raw, 'utf8');
    res.json({ slug, ...frontmatter });
  } catch (err) { serverError(res, err); }
});

// ─── Config & Sandbox ─────────────────────────────────────────────────────────

router.get('/api/config/:name', requireAuth, requireScope('config:read'), (req, res) => {
  try {
    const filePath = path.join(CONFIG_DIR, req.params.name);
    if (!fs.existsSync(filePath)) {
      if (req.params.name === 'DESIGN.md') {
        return res.json({ content: '# Design System\n\nPreview your markdown here.' });
      }
      return res.json({ content: '' });
    }
    const content = fs.readFileSync(filePath, 'utf8');
    res.json({ content });
  } catch (err) { serverError(res, err); }
});

router.put('/api/config/:name', requireAuth, requireScope('config:write'), (req, res) => {
  try {
    const filePath = path.join(CONFIG_DIR, req.params.name);
    if (!fs.existsSync(CONFIG_DIR)) {
      fs.mkdirSync(CONFIG_DIR, { recursive: true });
    }
    fs.writeFileSync(filePath, req.body.content, 'utf8');
    res.json({ success: true });
  } catch (err) { serverError(res, err); }
});

router.post('/api/sandbox', requireAuth, requireScope('sandbox:run'), async (req, res) => {
  const { code, timeout_ms = 5000 } = req.body || {};
  if (!code) return badRequest(res, 'code is required');
  const tmpPath = path.join(os.tmpdir(), `sandbox-${Date.now()}.mjs`);
  try {
    fs.writeFileSync(tmpPath, code);
    const result = await runInSandbox(tmpPath, timeout_ms);
    res.json(result);
  } catch (e) {
    res.status(500).json({ success: false, output: e.message });
  } finally {
    try { fs.unlinkSync(tmpPath); } catch { /* ignore */ }
  }
});

// ─── Quick Capture — Slack / Discord inbound webhooks ────────────────────────────
// Feature: Phase 8 quick-capture (parallel to future Telegram path).
// Writes inbound messages as draft SSSS inbox nodes for Dream Cycle synthesis.
router.post('/api/capture/:source', requireAuth, requireScope('memory:write'), async (req, res) => {
  const { source } = req.params;
  if (!['slack', 'discord'].includes(source)) {
    return res.status(400).json({ error: 'source must be "slack" or "discord"' });
  }
  try {
    const { captureMessage } = await import('../core/quick-capture.mjs');
    const body = req.body || {};
    // Normalise Slack and Discord payload shapes
    const text = body.text || body.content || body.message || '';
    const author = body.user?.name || body.user_name || body.author?.username || body.username || null;
    const channel = body.channel?.name || body.channel_name || body.channel_id || null;
    if (!text.trim()) return res.status(400).json({ error: 'No message text found in payload' });
    const result = captureMessage({ text, author, channel, source });
    res.json({ ok: true, slug: result.slug });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Consolidated Auth Routes ──────────────────────────────────────────────────

router.post('/auth/login', loginHandler);
router.post('/auth/logout', logoutHandler);
router.post('/auth/change-password', requireAuth, changePasswordHandler);
router.get('/auth/me', requireAuth, (req, res) => res.json({ authenticated: true }));

// ─── Voice / TTS (Kokoro / System) ───────────────────────────────────────────────

router.get('/api/tts/status', requireAuth, requireScope('tts:use'), (_req, res) => {
  res.json({ enabled: isTtsEnabled() });
});

router.post('/api/tts', requireAuth, requireScope('tts:use'), async (req, res) => {
  try {
    const { text, voice, format, speed } = req.body || {};
    if (typeof text !== 'string' || !text.trim()) {
      return res.status(400).json({ error: 'Missing or empty `text` field.' });
    }
    if (text.length > 5000) {
      return res.status(413).json({ error: 'Text exceeds 5000-character limit.' });
    }

    const { buffer, mimeType } = await synthesizeTts(text, { voice, format, speed });
    res.setHeader('Content-Type', mimeType);
    res.setHeader('Cache-Control', 'no-store');
    res.send(buffer);
  } catch (err) {
    if (err instanceof TtsNotConfiguredError) {
      return res.status(503).json({ error: err.message, code: err.code });
    }
    logger.error('api', `TTS error: ${err.message}`);
    res.status(500).json({ error: err.message });
  }
});

// ─── Instructions (sync consumers) ─────────────────────────────────────────────

router.get('/api/instructions', requireAuth, requireScope('instructions:read'), (req, res) => {
  return sendTextResource(res, INSTRUCTIONS, 'instructions');
});

// ─── SSSS Resources (sync and integration consumers) ─────────────────────────

function sha256(content) {
  return crypto.createHash('sha256').update(content).digest('hex');
}

function readTextResource(filePath, name) {
  if (!fs.existsSync(filePath)) return null;
  const content = fs.readFileSync(filePath, 'utf8');
  const stat = fs.statSync(filePath);
  return {
    name,
    content,
    sha256: sha256(content),
    bytes: stat.size,
    modified: stat.mtime.toISOString()
  };
}

function sendTextResource(res, filePath, name) {
  const resource = readTextResource(filePath, name);
  if (!resource) {
    return res.status(404).json({ error: `${name} is not available` });
  }
  return res.json(resource);
}

function baseUrl(req) {
  return `${req.protocol}://${req.get('host')}`;
}

function absoluteUrl(req, routePath) {
  return new URL(routePath, baseUrl(req)).toString();
}

function ssssReferenceDir() {
  return path.join(SKILLS_DIR, 'ssss', 'references');
}

function listSsssReferences(req) {
  const refsDir = ssssReferenceDir();
  if (!fs.existsSync(refsDir)) return [];
  return fs.readdirSync(refsDir)
    .filter(file => file.endsWith('.md'))
    .sort()
    .map((file) => {
      const name = file.replace(/\.md$/, '');
      const resource = readTextResource(path.join(refsDir, file), name);
      return {
        name,
        url: absoluteUrl(req, `/api/ssss/references/${name}`),
        sha256: resource?.sha256 || null,
        bytes: resource?.bytes || 0,
        modified: resource?.modified || null
      };
    });
}

function safeReferencePath(name) {
  if (!/^[a-zA-Z0-9_-]+$/.test(String(name || ''))) return null;
  return path.join(ssssReferenceDir(), `${name}.md`);
}

router.get('/api/ssss', requireAuth, requireScope('ssss:read'), (req, res) => {
  const resources = {
    instructions: {
      name: 'instructions',
      url: absoluteUrl(req, '/api/ssss/instructions'),
      ...(() => {
        const r = readTextResource(INSTRUCTIONS, 'instructions');
        return r ? { sha256: r.sha256, bytes: r.bytes, modified: r.modified } : { sha256: null, bytes: 0, modified: null };
      })()
    },
    skill: {
      name: 'ssss-skill',
      url: absoluteUrl(req, '/api/ssss/skill/ssss'),
      ...(() => {
        const r = readTextResource(path.join(SKILLS_DIR, 'ssss', 'SKILL.md'), 'ssss-skill');
        return r ? { sha256: r.sha256, bytes: r.bytes, modified: r.modified } : { sha256: null, bytes: 0, modified: null };
      })()
    },
    spec: {
      name: 'ssss-spec',
      url: absoluteUrl(req, '/api/ssss/spec'),
      ...(() => {
        const r = readTextResource(path.join(ssssReferenceDir(), 'ssss-spec.md'), 'ssss-spec');
        return r ? { sha256: r.sha256, bytes: r.bytes, modified: r.modified } : { sha256: null, bytes: 0, modified: null };
      })()
    },
    references: listSsssReferences(req)
  };

  res.json({
    name: 'ssss',
    schema_version: 2,
    resources
  });
});

router.get('/api/ssss/instructions', requireAuth, requireScope('ssss:read', 'instructions:read'), (_req, res) => {
  return sendTextResource(res, INSTRUCTIONS, 'instructions');
});

router.get('/api/ssss/skill/ssss', requireAuth, requireScope('ssss:read'), (_req, res) => {
  return sendTextResource(res, path.join(SKILLS_DIR, 'ssss', 'SKILL.md'), 'ssss-skill');
});

router.get('/api/ssss/spec', requireAuth, requireScope('ssss:read'), (_req, res) => {
  return sendTextResource(res, path.join(ssssReferenceDir(), 'ssss-spec.md'), 'ssss-spec');
});

router.get('/api/ssss/references', requireAuth, requireScope('ssss:read'), (req, res) => {
  res.json({ references: listSsssReferences(req) });
});

router.get('/api/ssss/references/:name', requireAuth, requireScope('ssss:read'), (req, res) => {
  const filePath = safeReferencePath(req.params.name);
  if (!filePath) return res.status(400).json({ error: 'Invalid reference name' });
  return sendTextResource(res, filePath, req.params.name);
});

export { router as restRouter };
