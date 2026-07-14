/**
 * Help / Discovery Routes
 *
 * GET /.well-known/total-recall.json  — Client auto-config manifest
 * GET /api                            — Full API reference (machine + human readable)
 * GET /api/help                       — In-product documentation topics
 */

import { Router } from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { requireAuth } from '../auth.mjs';
import { loadSecurityConfig } from '../auth.mjs';
import { serverError } from './_shared.mjs';

// Resolve package root (src/server/routes/ → go up 3 levels)
const ROOT = process.env.TR_ROOT || path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');

const router = Router();

// ─── Discovery manifest ────────────────────────────────────────────────────────

/**
 * GET /.well-known/total-recall.json
 * Used by UltraChat and other clients for auto-configuration.
 */
router.get('/.well-known/total-recall.json', (req, res) => {
  try {
    const proto = req.secure ? 'https' : 'http';
    const host  = req.headers.host || 'localhost:3000';
    const base  = `${proto}://${host}`;
    const sec   = loadSecurityConfig();

    res.json({
      name:          'Total Recall',
      version:       '3.0.0',
      base_url:      base,
      api:           `${base}/v1`,
      health:        `${base}/health`,
      models:        `${base}/v1/models`,
      auth: {
        type:         'bearer',
        token_prefix: 'tr_',
        scopes: ['chat:read', 'chat:write', 'memory:read', 'memory:write'],
      },
      capabilities:  ['chat', 'memory', 'sandbox', 'sessions'],
      rate_limits: {
        api: sec.rate_limits?.api_requests_per_minute || 60,
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
        'POST /api/memory/search/semantic':       'Semantic search by meaning (query, top_k)',
        'PUT /api/memory/:slug':                  'Replace node',
        'PATCH /api/memory/:slug':                'Partial update',
        'DELETE /api/memory/:slug':               'Delete node',
      },
      vault: {
        'POST /api/vault/compile':          'Recompile SSSS surface (INSTRUCTIONS.md)',
        'POST /api/vault/compact':          'Compact all active append-only log files',
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
        'GET /health':                      'System health (disk, embedding service, vault)',
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
      'health:read':    'Read health endpoints',
    },
  });
});

// ─── In-product help ──────────────────────────────────────────────────────────

/**
 * GET /api/help
 * Returns a list of help topics, or the content of a specific topic.
 * Query: ?topic=cli-reference|ssss|architecture|collab
 */
router.get('/api/help', requireAuth, (req, res) => {
  const { topic } = req.query;
  const docsDir      = path.join(ROOT, 'docs');
  const referenceDir = path.join(docsDir, 'reference');

  if (!topic) {
    return res.json({
      topics: [
        { id: 'cli-reference', title: 'CLI Reference Guide', description: 'npx total-recall command catalog and flags' },
        { id: 'ssss',          title: 'SSSS Specifications', description: 'Structured Semantic Syntax System guide' },
        { id: 'architecture',  title: 'System Architecture', description: 'System topology and VFS structures' },
        { id: 'collab',        title: 'Collaboration Guide', description: 'Collaborative workspaces and team annotations' }
      ]
    });
  }

  try {
    let filePath = '';
    if (topic === 'cli-reference') {
      filePath = path.join(referenceDir, 'cli-reference.md');
    } else if (topic === 'ssss') {
      filePath = path.join(docsDir, 'SSSS.md');
    } else if (topic === 'architecture') {
      filePath = path.join(docsDir, 'ARCHITECTURE.md');
    } else if (topic === 'collab') {
      filePath = path.join(referenceDir, 'collab.md');
    } else {
      return res.status(404).json({ error: 'Help topic not found' });
    }

    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: 'Help topic document not found on server' });
    }

    const content = fs.readFileSync(filePath, 'utf8');
    res.json({ topic, content });
  } catch (err) {
    serverError(res, err);
  }
});

export default router;
export { router as helpRouter };
