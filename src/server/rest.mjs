/**
 * Total Recall — Full REST API Router
 *
 * Mounted at /api/* and /v1/* (OpenAI-compat extensions).
 * Delegates to resource sub-routers in src/server/routes/*.mjs.
 *
 * Route Inventory:
 *
 *   Memory (routes/memory.mjs)
 *     GET    /api/memory              list nodes (supports ?q= search, ?category=, ?tag=)
 *     POST   /api/memory              create node
 *     GET    /api/memory/:slug        get node by slug
 *     PUT    /api/memory/:slug        update node (full replace)
 *     PATCH  /api/memory/:slug        partial update (body or tags)
 *     DELETE /api/memory/:slug        delete node
 *     GET    /api/memory/stats        counts by category
 *
 *   Keys (routes/keys.mjs)
 *     GET    /api/keys                list personal access tokens (no raw tokens)
 *     POST   /api/keys                issue a new personal access token (returns raw token once)
 *     DELETE /api/keys/:id            revoke key
 *
 *   Sessions (routes/sessions.mjs)
 *     GET    /api/sessions            list ingested session logs
 *     GET    /api/sessions/:id        get session details by id
 *     POST   /api/sessions/ingest     ingest a session log (Claude Code, Cursor, Cursor CLI, raw)
 *     DELETE /api/sessions/:id        delete session log
 *
 *   Sandbox
 *     POST   /api/sandbox             execute Node.js code securely in sandbox, returns stdout/stderr
 *
 *   Config
 *     GET    /api/config              get sanitized runtime + security config
 *
 *   Models (OpenAI-compatible extension)
 *     GET    /v1/models               list available Ollama models
 *
 *   Vault (admin operations)
 *     POST   /api/vault/compile       trigger full surface compile (re-generates compile.json)
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


import { loadNodes, writeNode, deleteNode, walkMd, safeStringify } from '../core/vault.mjs';
import { getNodes, invalidate } from '../core/vault-cache.mjs';
import { compileSurface } from '../core/surface.mjs';
import { runInSandbox } from '../core/sandbox.mjs';
import { issueKey } from './keys.mjs';
import connect from '../cli/connect.mjs';
import {
  requireAuth,
  requireScope,
  requireAuthOrLocal,
  loadSecurityConfig,
  loginHandler,
  logoutHandler,
  changePasswordHandler,
  sandboxRateLimiter,
  requireSandboxEnabled,
} from './auth.mjs';
import { getEmbedding, cosineSimilarity, loadEmbeddingsIndex, loadSessionEmbeddingsIndex } from '../core/embeddings.mjs';
import { semanticSearch } from '../core/search.mjs';
import { listQueue, addToQueue, updateQueueItem, removeFromQueue } from '../core/research-queue.mjs';
import { detectRuleFiles, importRuleFiles } from '../core/import-rules.mjs';
import { synthesize as synthesizeTts, isTtsEnabled, TtsNotConfiguredError } from '../core/tts.mjs';
import { logger } from '../core/logger.mjs';
import { memoryRouter }   from './routes/memory.mjs';
import { keysRouter }     from './routes/keys.mjs';
import { sessionsRouter } from './routes/sessions.mjs';
import { ollamaUrl } from '../core/config.mjs';
import {
  AGENT_DIR,
  VAULT_DIR,
  SKILLS_DIR,
  DERIVED_DIR,
  SESSIONS_DIR,
  INSTRUCTIONS,
  FILES_DIR,
  TASKS_DIR,
  CONFIG_DIR
} from './routes/_shared.mjs';

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

// Per-resource sub-routers (see ./routes/*.mjs). Mounted before the inline
// handlers below so URL precedence stays identical to the pre-refactor file.
router.use(memoryRouter);
router.use(keysRouter);
router.use(sessionsRouter);

// ─── Helpers ──────────────────────────────────────────────────────────────────

function notFound(res, msg) {
  return res.status(404).json({ error: msg || 'Not found' });
}

function badRequest(res, msg) {
  return res.status(400).json({ error: msg });
}

function serverError(res, err) {
  logger.error('rest', 'Internal server error', { error: err.message, stack: err.stack });
  return res.status(500).json({ error: 'Internal server error' });
}

function nodes() {
  return getNodes(VAULT_DIR);
}

function sanitizeNode({ body, ...rest }) {
  return { ...rest, content: body };
}

// ─── Memory CRUD ───  (moved to ./routes/memory.mjs)
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
      invalidate();
      const vaultNodes = getNodes(VAULT_DIR);
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
      const r = await fetch(`${ollamaUrl}/api/tags`, { signal: AbortSignal.timeout(2000) });
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
      ollama: { ok: ollamaOk, url: ollamaUrl },
    });
  } catch (err) {
    serverError(res, err);
  }
});

// ─── Keys ─────────── (moved to ./routes/keys.mjs)
// ─── Sessions ─────── (moved to ./routes/sessions.mjs)
// ─── Sandbox ──────────────────────────────────────────────────────────────────

/**
 * POST /api/sandbox
 * Body: { code }
 */
// Sandbox is rate-limited *before* requireAuth on purpose — limiter keys on
// the authenticated principal when present, so it's IP-bucketed for
// pre-auth misuse and key-bucketed once a PAT is attached.
router.post('/api/sandbox', sandboxRateLimiter(), requireAuth, requireScope('sandbox:run'), requireSandboxEnabled, async (req, res) => {
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
      health:        `${base}/health`,
      models:        `${base}/v1/models`,
      auth: {
        type:        'bearer',
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
      'health:read':    'Read health endpoints',
    },
  });
});

// ─── Research Queue ───────────────────────────────────────────────────────────
// Thin REST wrappers over src/core/research-queue.mjs

router.get('/api/research', requireAuth, requireScope('memory:read'), (req, res) => {
  try {
    const { status, query, limit, offset } = req.query;
    res.json(listQueue({ status, query, limit, offset }));
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

// ─── Active Integrations ──────────────────────────────────────────────────────

/**
 * GET /api/integrations/active
 */
router.get('/api/integrations/active', requireAuth, (req, res) => {
  try {
    const HOME = os.homedir();
    const configDir = path.join(HOME, '.agent', 'config');
    const configFile = path.join(configDir, 'wizard-config.json');

    let configuredIdes = [];
    if (fs.existsSync(configFile)) {
      try {
        const parsed = JSON.parse(fs.readFileSync(configFile, 'utf8'));
        if (Array.isArray(parsed.configuredIdes)) {
          configuredIdes = parsed.configuredIdes;
        }
      } catch (e) {
        // ignore
      }
    }

    // Fallback detection (filesystem probing) if configuredIdes is empty
    if (configuredIdes.length === 0) {
      const checks = {
        'claude-code': [path.join(HOME, '.claude', 'projects'), path.join(HOME, '.claude', 'CLAUDE.md')],
        'codex':       [path.join(HOME, '.codex', 'sessions'), path.join(HOME, '.codex', 'AGENTS.md')],
        'cursor':      [path.join(HOME, '.cursor', 'projects'), path.join(HOME, '.cursor')],
        'antigravity': [path.join(HOME, '.gemini', 'antigravity')],
        'vscode':      [path.join(HOME, 'Library', 'Application Support', 'Code'), path.join(HOME, '.vscode')],
        'gemini':      [path.join(HOME, '.gemini')],
        'pi':          [path.join(HOME, '.pi', 'agent')],
        'hermes':      [path.join(HOME, '.hermes')],
        'openclaw':    [path.join(HOME, '.openclaw')],
      };

      for (const [ide, paths] of Object.entries(checks)) {
        if (paths.some(p => { try { return fs.existsSync(p); } catch { return false; } })) {
          configuredIdes.push(ide);
        }
      }
    }

    res.json({ success: true, active: configuredIdes });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ─── Integrations Connection ──────────────────────────────────────────────────


/**
 * POST /api/integrations/connect
 * Body: { client: string, baseUrl?: string }
 */
router.post('/api/integrations/connect', requireAuth, (req, res) => {
  try {
    const { client, baseUrl } = req.body || {};
    if (!client) return badRequest(res, 'client is required');

    const validClients = [
      'vscode', 'pi', 'hermes', 'openclaw', 'cursor', 'claude-code',
      'codex', 'gemini', 'aider', 'ultrachat', 'obsidian',
      'generic', 'antigravity'
    ];

    if (!validClients.includes(client)) {
      return badRequest(res, `Unknown client: ${client}`);
    }

    // Generate a fresh key for this client
    const scopes = ['ssss:read', 'memory:read'];
    const keyName = `${client.charAt(0).toUpperCase() + client.slice(1)} Link`;
    const newKey = issueKey(keyName, { scopes });
    const token = newKey.token;

    // Call the connect function from cli/connect.mjs
    const args = [client, '--token', token];
    if (baseUrl) {
      args.push('--brain', baseUrl);
    }

    // Run the connection logic asynchronously in the background so it doesn't block,
    // or run it synchronously (it is extremely fast as it just writes a few local files).
    connect(args)
      .then(() => {
        res.json({
          success: true,
          message: `Successfully connected ${client}`,
          token_preview: newKey.token_prefix,
          key_id: newKey.id
        });
      })
      .catch(err => {
        serverError(res, err);
      });
  } catch (err) {
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
    const allowedRoots = [process.cwd(), os.homedir()];
    const rawDirs = req.query.dir ? (Array.isArray(req.query.dir) ? req.query.dir : [req.query.dir]) : allowedRoots;
    const dirs = rawDirs.filter(d => allowedRoots.some(root => path.resolve(d).startsWith(path.resolve(root))));
    if (dirs.length === 0) return badRequest(res, 'No permitted directories specified');
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
    const searchDirs = dirs?.length ? dirs : [process.cwd(), os.homedir()];
    const detected = detectRuleFiles(searchDirs);
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
router.get('/api/brain/export', requireAuth, requireScope('brain:export'), async (req, res) => {
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
    const tar = spawn('tar', ['czf', '-', '-C', AGENT_DIR, '--exclude=security.yml', '--exclude=keys.jsonl', '--exclude=session-secret', ...relativeDirs], { stdio: ['ignore', 'pipe', 'ignore'] });
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

router.get('/api/skills/:name', requireAuth, requireScope('files:read', 'ssss:read'), (req, res) => {
  try {
    const { name } = req.params;
    if (name.includes('..') || name.includes('/') || name.includes('\\')) {
      return res.status(400).json({ error: 'Invalid skill name' });
    }
    const skillPath = path.join(SKILLS_DIR, name, 'SKILL.md');
    if (!fs.existsSync(skillPath)) {
      return res.status(404).json({ error: `Skill "${name}" not found` });
    }
    const content = fs.readFileSync(skillPath, 'utf8');
    res.json({ name, content });
  } catch (err) { serverError(res, err); }
});

router.put('/api/skills/:name', requireAuth, requireScope('files:write', 'ssss:write'), (req, res) => {
  try {
    const { name } = req.params;
    const { content } = req.body;
    if (name.includes('..') || name.includes('/') || name.includes('\\')) {
      return res.status(400).json({ error: 'Invalid skill name' });
    }
    if (typeof content !== 'string') {
      return res.status(400).json({ error: 'Missing or invalid `content` field.' });
    }
    const skillDir = path.join(SKILLS_DIR, name);
    if (!fs.existsSync(skillDir)) {
      fs.mkdirSync(skillDir, { recursive: true });
    }
    const skillPath = path.join(skillDir, 'SKILL.md');
    fs.writeFileSync(skillPath, content, 'utf8');
    res.json({ success: true, message: `Skill "${name}" updated successfully` });
  } catch (err) { serverError(res, err); }
});

router.delete('/api/skills/:name', requireAuth, requireScope('files:write', 'ssss:write'), (req, res) => {
  try {
    const { name } = req.params;
    if (name.includes('..') || name.includes('/') || name.includes('\\')) {
      return res.status(400).json({ error: 'Invalid skill name' });
    }
    const skillDir = path.join(SKILLS_DIR, name);
    if (!fs.existsSync(skillDir)) {
      return res.status(404).json({ error: `Skill "${name}" not found` });
    }
    fs.rmSync(skillDir, { recursive: true, force: true });
    res.json({ success: true, message: `Skill "${name}" deleted successfully` });
  } catch (err) { serverError(res, err); }
});

router.get('/api/logs/:type', requireAuth, requireScope('health:read'), (req, res) => {
  try {
    const { type } = req.params;
    if (type !== 'server' && type !== 'daemon') {
      return res.status(400).json({ error: 'Invalid log type. Must be "server" or "daemon"' });
    }
    const logPath = path.join(AGENT_DIR, 'logs', `${type}.log`);
    if (!fs.existsSync(logPath)) {
      return res.json({ content: '(no logs yet)' });
    }
    const content = fs.readFileSync(logPath, 'utf8');
    const lines = content.split('\n');
    const lastLines = lines.slice(-200).join('\n');
    res.json({ content: lastLines });
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
    const raw = safeStringify(body || '', frontmatter);
    fs.writeFileSync(path.join(TASKS_DIR, `${slug}.md`), raw, 'utf8');
    res.json({ slug, ...frontmatter });
  } catch (err) { serverError(res, err); }
});

// ─── Config & Sandbox ─────────────────────────────────────────────────────────

function safeConfigName(name) {
  // Allow alphanumeric, hyphens, underscores, and dots (for file extensions like .yml)
  if (!/^[a-zA-Z0-9_.-]+$/.test(name) || name.includes('..')) {
    return null;
  }
  return path.join(CONFIG_DIR, name);
}

router.get('/api/config/:name', requireAuth, requireScope('config:read'), (req, res) => {
  try {
    const filePath = safeConfigName(req.params.name);
    if (!filePath) return badRequest(res, 'Invalid config name');
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
    const filePath = safeConfigName(req.params.name);
    if (!filePath) return badRequest(res, 'Invalid config name');
    if (!fs.existsSync(CONFIG_DIR)) {
      fs.mkdirSync(CONFIG_DIR, { recursive: true });
    }
    fs.writeFileSync(filePath, req.body.content, 'utf8');
    res.json({ success: true });
  } catch (err) { serverError(res, err); }
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

router.put('/api/instructions', requireAuth, requireScope('instructions:write'), (req, res) => {
  const { content } = req.body;
  if (typeof content !== 'string') {
    return res.status(400).json({ error: 'Missing or invalid `content` field.' });
  }
  try {
    fs.writeFileSync(INSTRUCTIONS, content, 'utf8');
    return res.json({ success: true, message: 'Instructions updated successfully' });
  } catch (err) {
    logger.error('api', `Failed to write instructions: ${err.message}`);
    return res.status(500).json({ error: err.message });
  }
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
