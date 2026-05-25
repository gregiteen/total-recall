/**
 * /api/sessions/* routes
 *
 * - GET    /api/sessions             list (limit, offset)
 * - GET    /api/sessions/:id         read full session
 * - POST   /api/sessions/ingest      ingest (raw file or pre-parsed)
 * - DELETE /api/sessions/:id         delete
 */

import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { requireAuth, requireScope, ingestRateLimiter } from '../auth.mjs';
import {
  parseSessionFile,
  sessionToEmbedChunks,
  getEmbedding,
  saveSessionEmbeddingToIndex,
  removeSessionEmbeddingFromIndex,
} from '../../core/embeddings.mjs';
import {
  AGENT_DIR,
  BRAIN_DIR,
  SESSIONS_DIR,
  DERIVED_DIR,
  notFound,
  badRequest,
  serverError,
} from './_shared.mjs';

const router = express.Router();

const activeEmbeddings = new Set();

async function drainActiveEmbeddings() {
  if (activeEmbeddings.size === 0) return;
  await Promise.allSettled(Array.from(activeEmbeddings));
}


function listSessionFiles() {
  if (!fs.existsSync(SESSIONS_DIR)) return [];
  return fs.readdirSync(SESSIONS_DIR)
    .filter(f => f.endsWith('.jsonl') || f.endsWith('.json'))
    .sort()
    .reverse();
}

function readSessionFile(filename) {
  const filePath = path.join(SESSIONS_DIR, filename);
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
 * Extract human/assistant turns from raw IDE session file content.
 * Handles JSONL (Claude Code, Codex, Cursor, VS Code) and plaintext (Antigravity overview).
 */
function parseRawSessionContent(content, source) {
  const messages = [];
  const lines = content.split('\n').filter(Boolean);

  for (const line of lines) {
    let rec;
    try { rec = JSON.parse(line); } catch { continue; }

    if (source === 'antigravity' && (rec.type === 'USER_INPUT' || (rec.source === 'MODEL' && (rec.type === 'PLANNER_RESPONSE' || rec.type === 'RESPONSE' || rec.type === 'model_response')))) {
      let role = rec.type === 'USER_INPUT' ? 'user' : 'assistant';
      let text = rec.content || '';
      if (role === 'user' && text.includes('<USER_REQUEST>')) {
        const match = text.match(/<USER_REQUEST>([\s\S]*?)<\/USER_REQUEST>/);
        if (match) text = match[1].trim();
      }
      if (text.trim()) messages.push({ role, content: text.slice(0, 8000) });
      continue;
    }

    if (rec.role && (rec.content || rec.message)) {
      const text = typeof rec.content === 'string' ? rec.content
        : Array.isArray(rec.content) ? rec.content.filter(b => b.type === 'text').map(b => b.text).join('\n')
        : typeof rec.message?.text === 'string' ? rec.message.text
        : '';
      if (text.trim()) messages.push({ role: rec.role, content: text.slice(0, 8000) });
      continue;
    }

    if (rec.kind === 2 && Array.isArray(rec.v)) {
      for (const req of rec.v) {
        const user = req.message?.text || '';
        const asst = req.response?.response?.value || req.response?.value || '';
        if (user) messages.push({ role: 'user',      content: user.slice(0, 8000) });
        if (asst) messages.push({ role: 'assistant', content: asst.slice(0, 8000) });
      }
    }
  }

  if (messages.length === 0 && content.trim()) {
    if (source === 'antigravity') {
      for (const line of content.split('\n').filter(Boolean)) {
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

router.get('/api/sessions', requireAuth, requireScope('memory:read'), (req, res) => {
  try {
    const files = listSessionFiles();
    const { limit = '50', offset = '0' } = req.query;
    const off = parseInt(offset, 10) || 0;
    const lim = Math.min(200, parseInt(limit, 10) || 50);
    const page = files.slice(off, off + lim).map(f => {
      const data = readSessionFile(f);
      const stat = fs.statSync(path.join(SESSIONS_DIR, f));
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

router.get('/api/sessions/:id', requireAuth, requireScope('memory:read'), (req, res) => {
  try {
    const files = listSessionFiles();
    const match = files.find(f => f.startsWith(req.params.id));
    if (!match) return notFound(res, `Session not found: ${req.params.id}`);
    res.json(readSessionFile(match));
  } catch (err) {
    serverError(res, err);
  }
});

router.post('/api/sessions/ingest', ingestRateLimiter(), requireAuth, requireScope('memory:write'), (req, res) => {
  try {
    const body = req.body || {};
    const source = body.source || 'api';

    let messages;
    if (body.content && typeof body.content === 'string') {
      messages = parseRawSessionContent(body.content, source);
    } else if (Array.isArray(body.messages)) {
      messages = body.messages;
    } else {
      return badRequest(res, 'Provide either {content} (raw file) or {messages:[{role,content}]}');
    }

    if (messages.length === 0) {
      return res.status(200).json({ ingested: false, reason: 'no extractable messages' });
    }

    // Deduplicate by sha256 of the raw content (relay always sends sha256)
    if (body.sha256) {
      const hashIndex = path.join(BRAIN_DIR, 'memory-derived', 'relay-hashes.jsonl');
      fs.mkdirSync(path.dirname(hashIndex), { recursive: true });
      const seen = new Set(
        fs.existsSync(hashIndex)
          ? fs.readFileSync(hashIndex, 'utf8').split('\n').filter(Boolean).map(l => {
              try { return JSON.parse(l).sha256; } catch { return ''; }
            })
          : []
      );
      if (seen.has(body.sha256)) {
        return res.status(200).json({ ingested: false, reason: 'duplicate' });
      }
      fs.appendFileSync(hashIndex, JSON.stringify({ sha256: body.sha256, ts: new Date().toISOString(), source }) + '\n');
    }

    const rawSessionId = body.id || `relay-${source}-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
    const sessionId = rawSessionId.replace(/[^a-zA-Z0-9_-]/g, '_');
    const filename  = `${sessionId}.jsonl`;
    fs.mkdirSync(SESSIONS_DIR, { recursive: true });
    const filePath = path.join(SESSIONS_DIR, filename);

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
    const promise = (async () => {
      if (process.isShuttingDown) return;
      try {
        const msgs = parseSessionFile(filePath);
        const chunks = sessionToEmbedChunks(msgs);
        for (let i = 0; i < chunks.length; i++) {
          if (process.isShuttingDown) return;
          const key = chunks.length === 1 ? sessionId : `${sessionId}:chunk-${i}`;
          const embedding = await getEmbedding(chunks[i]);
          if (process.isShuttingDown) return;
          saveSessionEmbeddingToIndex(DERIVED_DIR, key, chunks[i], embedding);
        }
      } catch (err) {
        /* Ollama may not be running — non-fatal */
      }
    })();

    activeEmbeddings.add(promise);
    promise.finally(() => {
      activeEmbeddings.delete(promise);
    });

    res.status(200).json({ ok: true, ingested: true, id: sessionId, count: messages.length });
  } catch (err) {
    serverError(res, err);
  }
});

router.delete('/api/sessions/:id', requireAuth, requireScope('memory:write'), (req, res) => {
  try {
    const files = listSessionFiles();
    const match = files.find(f => f.startsWith(req.params.id));
    if (!match) return notFound(res, `Session not found: ${req.params.id}`);
    fs.unlinkSync(path.join(SESSIONS_DIR, match));
    try { removeSessionEmbeddingFromIndex(DERIVED_DIR, req.params.id); } catch { /* non-fatal */ }
    res.json({ deleted: true, id: req.params.id });
  } catch (err) {
    serverError(res, err);
  }
});

export { router as sessionsRouter, drainActiveEmbeddings };

