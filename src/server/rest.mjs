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
import { spawn, spawnSync } from 'node:child_process';
import matter from 'gray-matter';
import { fileURLToPath } from 'node:url';
import yaml from 'yaml';
import { loadRuntimeConfig } from '../core/runtime.mjs';


import { writeNode, deleteNode, safeStringify } from '../core/vault.mjs';
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
import { shareRouter }    from './routes/share.mjs';
import { authRouter }     from './routes/auth.mjs';
import { sandboxRouter }  from './routes/sandbox.mjs';
import { researchRouter } from './routes/research.mjs';
import { skillsRouter }   from './routes/skills.mjs';
import { docsRouter }     from './routes/docs.mjs';
import syncRouter         from './routes/sync.mjs';
// ollamaUrl removed — CLI agents replace Ollama
import {
  AGENT_DIR,
  BRAIN_DIR,
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
router.use(shareRouter);
router.use(authRouter);
router.use(sandboxRouter);
router.use(researchRouter);
router.use(skillsRouter);
router.use(docsRouter);
router.use(syncRouter);

// ─── Brain Routing Middleware ──────────────────────────────────────────────────────────────────

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
 * POST /api/vault/compact
 * Compact all active append-only log files (dedup, remove tombstones).
 */
router.post('/api/vault/compact', requireAuth, requireScope('memory:write'), async (req, res) => {
  try {
    const { compactAppendLogs } = await import('../core/append-log.mjs');
    const result = compactAppendLogs();
    res.json({ compacted: true, ...result });
  } catch (err) {
    serverError(res, err);
  }
});

/**
 * POST /api/context
 * Dynamic streaming context compilation.
 * Assembles a query-aware, temporally-scored, budget-constrained context
 * document from the vault in real-time. Every token earns its place.
 *
 * Body: { query: string, budget?: object, momentum_slugs?: string[] }
 * Returns: { context: string, stats: object }
 */
router.post('/api/context', requireAuth, requireScope('memory:read'), async (req, res) => {
  try {
    const { compileContext } = await import('../core/context-compiler.mjs');
    const { query, budget, momentum_slugs } = req.body || {};
    const result = await compileContext({
      query: query || '',
      vaultDir: VAULT_DIR,
      derivedDir: DERIVED_DIR,
      budget: budget || {},
      consumer: 'api',
      momentumSlugs: momentum_slugs || [],
    });
    res.json(result);
  } catch (err) {
    serverError(res, err);
  }
});

/**
 * GET /api/context/preview
 * Lightweight context preview — returns temporally-scored candidates
 * and budget allocation without computing embeddings.
 */
router.get('/api/context/preview', requireAuth, requireScope('memory:read'), async (req, res) => {
  try {
    const { previewContext } = await import('../core/context-compiler.mjs');
    const result = previewContext({ vaultDir: VAULT_DIR });
    res.json(result);
  } catch (err) {
    serverError(res, err);
  }
});

/**
 * POST /api/context/stream
 * Massively parallel context streaming via Flash fan-out.
 * Chunks the entire vault, dispatches parallel Flash calls to score
 * every node against the query simultaneously, merges into budget.
 *
 * Body: { query: string, budget_tokens?: number, batch_size?: number,
 *         concurrency?: number, min_score?: number }
 * Returns: { context: string, stats: object, scored: array }
 */
router.post('/api/context/stream', requireAuth, requireScope('memory:read'), async (req, res) => {
  try {
    const { streamParallelContext } = await import('../core/parallel-context.mjs');
    const { query, budget_tokens, batch_size, concurrency, min_score } = req.body || {};
    if (!query) return badRequest(res, 'query is required');
    const result = await streamParallelContext({
      query,
      vaultDir: VAULT_DIR,
      budgetTokens: budget_tokens,
      batchSize: batch_size,
      concurrency,
      minScore: min_score,
    });
    res.json(result);
  } catch (err) {
    serverError(res, err);
  }
});

/**
 * GET /api/context/flash/health
 * Check Flash API connectivity for parallel context streaming.
 */
router.get('/api/context/flash/health', requireAuth, requireScope('memory:read'), async (req, res) => {
  try {
    const { checkFlashHealth } = await import('../core/parallel-context.mjs');
    const result = await checkFlashHealth();
    res.json(result);
  } catch (err) {
    serverError(res, err);
  }
});

// ─── Vector Field ─────────────────────────────────────────────────────────────

/**
 * POST /api/field/compile
 * Compile the full vector field: embed all nodes, compute N×N covariance
 * matrix, track velocities, persist to disk.
 */
router.post('/api/field/compile', requireAuth, requireScope('memory:recompile'), async (req, res) => {
  try {
    const { compileField } = await import('../core/vector-field.mjs');
    const result = await compileField({ vaultDir: VAULT_DIR, derivedDir: DERIVED_DIR });
    res.json({ compiled: true, ...result.meta });
  } catch (err) {
    serverError(res, err);
  }
});

/**
 * POST /api/field/sample
 * Sample the vector field at a query point.
 * Returns ranked nodes with direct similarity, entanglement boost, and velocity.
 *
 * Body: { query: string, top_k?: number, entanglement_boost?: number, velocity_weight?: number }
 */
router.post('/api/field/sample', requireAuth, requireScope('memory:read'), async (req, res) => {
  try {
    const { sampleField } = await import('../core/vector-field.mjs');
    const { query, top_k, entanglement_boost, velocity_weight } = req.body || {};
    if (!query) return badRequest(res, 'query is required');
    const result = await sampleField({
      query,
      topK: top_k,
      entanglementBoost: entanglement_boost,
      velocityWeight: velocity_weight,
      derivedDir: DERIVED_DIR,
    });
    res.json(result);
  } catch (err) {
    serverError(res, err);
  }
});

/**
 * GET /api/field/stats
 * Vector field statistics: point count, velocity distribution,
 * strongest couplings, compilation metadata.
 */
router.get('/api/field/stats', requireAuth, requireScope('memory:read'), async (req, res) => {
  try {
    const { fieldStats } = await import('../core/vector-field.mjs');
    res.json(fieldStats(DERIVED_DIR));
  } catch (err) {
    serverError(res, err);
  }
});

/**
 * POST /api/dream
 */
router.post('/api/dream', requireAuth, requireScope('memory:recompile'), async (req, res) => {
  try {
    const { runDreamCycle } = await import('../core/dream.mjs');
    const conflictsDir = path.join(BRAIN_DIR, 'memory-inbox', 'conflicts');
    
    const result = await runDreamCycle({
      vaultDir: VAULT_DIR,
      skillsDir: SKILLS_DIR,
      derivedDir: DERIVED_DIR,
      conflictsDir,
      instructionsFile: INSTRUCTIONS,
    });

    res.json({ success: true, status: result.status });
  } catch (err) {
    serverError(res, err);
  }
});

/**
 * GET /api/vault/hash
 * Lightweight endpoint for PWA cache invalidation.
 * Returns only the vault content hash — no expensive I/O.
 */
router.get('/api/vault/hash', requireAuth, requireScope('memory:read'), (req, res) => {
  try {
    const hashFile = path.join(DERIVED_DIR, 'vault-hash.txt');
    const hash = fs.existsSync(hashFile) ? fs.readFileSync(hashFile, 'utf8').trim() : null;
    res.json({ vault_hash: hash });
  } catch (err) {
    serverError(res, err);
  }
});

/**
 * GET /api/vault/status
 */
router.get('/api/vault/status', requireAuth, requireScope('memory:read'), async (req, res) => {
  try {
    // Use vault-cache instead of scanning every .md file from disk
    const nodeCount = getNodes(VAULT_DIR).length;
    const skillCount  = fs.existsSync(SKILLS_DIR)  ? fs.readdirSync(SKILLS_DIR, { withFileTypes: true }).filter(d =>
      d.isDirectory() && fs.existsSync(path.join(SKILLS_DIR, d.name, 'SKILL.md'))).length : 0;
    const lastCompile = fs.existsSync(INSTRUCTIONS)
      ? fs.statSync(INSTRUCTIONS).mtime.toISOString()
      : null;
    const derivedFiles = fs.existsSync(DERIVED_DIR)
      ? fs.readdirSync(DERIVED_DIR).length : 0;

    // Use mtime-cached loaders instead of raw readFile + JSON.parse
    const vaultEmbedCount   = Object.keys(loadEmbeddingsIndex(DERIVED_DIR)).length;
    const sessionEmbedCount = Object.keys(loadSessionEmbeddingsIndex(DERIVED_DIR)).length;

    // CLI agent availability (best-effort)
    const { findBinaryInPath } = await import('../core/runtime.mjs');
    let cliAgents = [];
    for (const bin of ['antigravity', 'gemini', 'claude', 'codex']) {
      if (findBinaryInPath(bin)) cliAgents.push(bin);
    }

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
      cli_agents: { available: cliAgents },
    });
  } catch (err) {
    serverError(res, err);
  }
});

/**
 * POST /api/diagnostics/agents
 * Run `upgrade --agents` diagnostics checks and return the console text output.
 */
router.post('/api/diagnostics/agents', requireAuth, requireScope('health:read'), async (req, res) => {
  try {
    const result = spawnSync('node', [path.join(ROOT, 'bin', 'total-recall.mjs'), 'upgrade', '--agents'], {
      encoding: 'utf8',
      cwd: ROOT,
      env: { ...process.env }
    });
    const output = (result.stdout || '') + (result.stderr || '');
    res.json({ success: result.status === 0, output });
  } catch (err) {
    serverError(res, err);
  }
});


// ─── Keys ─────────── (moved to ./routes/keys.mjs)
// ─── Sessions ─────── (moved to ./routes/sessions.mjs)
// ─── Sandbox ──────────────────────────────────────────────────────────────────
// Moved to routes/sandbox.mjs

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
    const runtimePath = path.join(BRAIN_DIR, 'config', 'runtime.yml');
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
// Moved to routes/research.mjs
// ─── Active Integrations ──────────────────────────────────────────────────────

/**
 * GET /api/integrations/active
 */
router.get('/api/integrations/active', requireAuth, (req, res) => {
  try {
    const HOME = os.homedir();
    const configDir = path.join(BRAIN_DIR, 'config');
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
      config:   path.join(BRAIN_DIR, 'config'),
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

    const relativeDirs = dirs.map(k => path.relative(BRAIN_DIR, ALL_PARTS[k]));
    const tar = spawn('tar', ['czf', '-', '-C', BRAIN_DIR, '--exclude=security.yml', '--exclude=keys.jsonl', '--exclude=session-secret', ...relativeDirs], { stdio: ['ignore', 'pipe', 'ignore'] });
    tar.stdout.pipe(res);
    tar.on('error', err => { if (!res.headersSent) serverError(res, err); });
    tar.on('close', code => { if (code !== 0 && !res.writableEnded) res.end(); });
    
  } catch (err) { serverError(res, err); }
});

// ─── Chrome Extension Download ───────────────────────────────────────────────

router.get('/api/extension/download', requireAuth, requireScope('config:read'), async (_req, res) => {
  try {
    // Extension lives at <package-root>/extension/
    const extDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../extension');
    if (!fs.existsSync(extDir) || !fs.existsSync(path.join(extDir, 'manifest.json'))) {
      return res.status(404).json({ error: 'Chrome extension not found in this installation.' });
    }

    // Never inject PATs into packaged extension source. Pair from the extension
    // options page so secrets stay in extension-local storage.

    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', 'attachment; filename="total-recall-extension.zip"');

    // Use zip if available, fall back to tar
    const zip = spawn('zip', ['-r', '-', '.'], { cwd: extDir, stdio: ['ignore', 'pipe', 'ignore'] });
    zip.stdout.pipe(res);
    zip.on('error', () => {
      // zip not available — try tar
      if (!res.headersSent) {
        res.setHeader('Content-Type', 'application/gzip');
        res.setHeader('Content-Disposition', 'attachment; filename="total-recall-extension.tar.gz"');
        const tar = spawn('tar', ['czf', '-', '-C', path.dirname(extDir), 'extension'], { stdio: ['ignore', 'pipe', 'ignore'] });
        tar.stdout.pipe(res);
        tar.on('error', err => { if (!res.headersSent) serverError(res, err); });
        tar.on('close', () => { if (!res.writableEnded) res.end(); });
      }
    });
    zip.on('close', code => {
      if (code !== 0 && !res.writableEnded) res.end();
    });
  } catch (err) {
    serverError(res, err);
  }
});

/**
 * GET /api/extension/status
 * Returns whether the extension is available (packaged) and connected (has sent captures).
 */
router.get('/api/extension/status', requireAuth, requireScope('config:read'), async (_req, res) => {
  try {
    const extDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../extension');
    const available = fs.existsSync(path.join(extDir, 'manifest.json'));
    let version = '0.0.0';
    if (available) {
      try {
        const manifest = JSON.parse(fs.readFileSync(path.join(extDir, 'manifest.json'), 'utf8'));
        version = manifest.version || '0.0.0';
      } catch {}
    }

    // Check if extension has ever connected by looking for the marker file
    const markerPath = path.join(BRAIN_DIR, 'config', '.extension-connected');
    const connected = fs.existsSync(markerPath);

    res.json({ available, connected, version });
    
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

router.get("/api/conflicts", requireAuth, requireScope("ssss:read"), async (req, res) => {
  if (!isDashboardEnhanced()) {
    return res.status(404).json({ error: "dashboard-enhanced feature flag not enabled" });
  }
  try {
    const conflictsDir = path.join(BRAIN_DIR, "memory-inbox", "conflicts");
    const conflicts = [];

    if (fs.existsSync(conflictsDir)) {
      const files = fs.readdirSync(conflictsDir).filter(f => f.endsWith(".md"));
      for (const file of files) {
        try {
          const raw = fs.readFileSync(path.join(conflictsDir, file), "utf8");
          const parsed = matter(raw);
          conflicts.push({
            ...parsed.data,
            body: parsed.content
          });
        } catch (e) {
          // ignore malformed
        }
      }
    }

    // Also run a dynamic scan just in case
    const { detectSemanticConflicts } = await import("../core/conflict-detector.mjs");
    const list = nodes();
    const dynamicConflicts = [];
    for (let i = 0; i < list.length; i++) {
      const found = detectSemanticConflicts(list[i], list.slice(0, i));
      dynamicConflicts.push(...found);
    }

    // Merge them: if a conflict is already on disk, don't duplicate it.
    const merged = [...conflicts];
    for (const dc of dynamicConflicts) {
      const exists = merged.some(c =>
        (c.new_slug === dc.new_slug && c.existing_slug === dc.existing_slug) ||
        (c.new_slug === dc.existing_slug && c.existing_slug === dc.new_slug)
      );
      if (!exists) {
        merged.push(dc);
      }
    }

    res.json({ conflicts: merged });
  } catch (err) {
    serverError(res, err);
  }
});

router.post("/api/conflicts/resolve", requireAuth, requireScope("memory:write"), async (req, res) => {
  try {
    const { conflict_id, action, winner_slug } = req.body || {};
    if (!conflict_id || !action || !winner_slug) {
      return badRequest(res, "Required fields: conflict_id, action, winner_slug");
    }
    if (action !== "keep" && action !== "supersede") {
      return badRequest(res, "action must be either 'keep' or 'supersede'");
    }

    const inboxDir = path.join(BRAIN_DIR, "memory-inbox");
    const { resolveConflict } = await import("../core/conflict-detector.mjs");
    const result = resolveConflict(conflict_id, inboxDir, action, winner_slug);
    if (!result.resolved) {
      return badRequest(res, result.error || "Failed to resolve conflict");
    }

    invalidate(); // clear cache
    res.json({ success: true, conflict_id });
  } catch (err) {
    serverError(res, err);
  }
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

// Moved to routes/skills.mjs

// ─── Scripts Editor & Execution ───────────────────────────────────────────────

const SCRIPTS_DIR = path.join(SKILLS_DIR, "total-recall", "scripts");

router.get("/api/scripts", requireAuth, requireScope("files:read"), (req, res) => {
  try {
    if (!fs.existsSync(SCRIPTS_DIR)) {
      fs.mkdirSync(SCRIPTS_DIR, { recursive: true });
    }
    const files = fs.readdirSync(SCRIPTS_DIR).filter(file => 
      file.endsWith(".mjs") || file.endsWith(".js") || file.endsWith(".py") || file.endsWith(".sh")
    ).map(file => {
      const stats = fs.statSync(path.join(SCRIPTS_DIR, file));
      return {
        name: file,
        size: stats.size,
        modified: stats.mtime
      };
    });
    res.json(files);
  } catch (err) {
    serverError(res, err);
  }
});

router.get("/api/scripts/:name", requireAuth, requireScope("files:read"), (req, res) => {
  try {
    const { name } = req.params;
    if (name.includes("..") || name.includes("/") || name.includes("\\")) {
      return res.status(400).json({ error: "Invalid script name" });
    }
    const scriptPath = path.join(SCRIPTS_DIR, name);
    if (!fs.existsSync(scriptPath)) {
      return res.status(404).json({ error: `Script "${name}" not found` });
    }
    const content = fs.readFileSync(scriptPath, "utf8");
    res.json({ name, content });
  } catch (err) {
    serverError(res, err);
  }
});

router.put("/api/scripts/:name", requireAuth, requireScope("files:write"), (req, res) => {
  try {
    const { name } = req.params;
    const { content } = req.body;
    if (name.includes("..") || name.includes("/") || name.includes("\\")) {
      return res.status(400).json({ error: "Invalid script name" });
    }
    if (typeof content !== "string") {
      return res.status(400).json({ error: "Missing or invalid `content` field." });
    }
    if (!fs.existsSync(SCRIPTS_DIR)) {
      fs.mkdirSync(SCRIPTS_DIR, { recursive: true });
    }
    const scriptPath = path.join(SCRIPTS_DIR, name);
    fs.writeFileSync(scriptPath, content, "utf8");
    res.json({ success: true, message: `Script "${name}" saved successfully` });
  } catch (err) {
    serverError(res, err);
  }
});

router.post("/api/scripts/:name/run", sandboxRateLimiter(), requireAuth, requireScope("sandbox:run"), requireSandboxEnabled, async (req, res) => {
  try {
    const { name } = req.params;
    if (name.includes("..") || name.includes("/") || name.includes("\\")) {
      return res.status(400).json({ error: "Invalid script name" });
    }
    const scriptPath = path.join(SCRIPTS_DIR, name);
    if (!fs.existsSync(scriptPath)) {
      return res.status(404).json({ error: `Script "${name}" not found` });
    }

    const isNodeScript = name.endsWith(".js") || name.endsWith(".mjs") || name.endsWith(".cjs");
    if (!isNodeScript) {
      return res.status(400).json({
        error: "Only Node.js scripts can be run through the sandbox endpoint."
      });
    }

    const result = await runInSandbox(scriptPath, 10000, {
      allowNetwork: req.body?.allowNetwork === true
    });
    res.json({
      success: result.success,
      output: result.output || "(no output)",
      exitCode: result.code ?? null,
      signal: result.signal ?? null
    });
  } catch (err) {
    serverError(res, err);
  }
});



router.get('/api/logs/:type', requireAuth, requireScope('health:read'), (req, res) => {
  try {
    const { type } = req.params;
    if (type !== 'server' && type !== 'daemon') {
      return res.status(400).json({ error: 'Invalid log type. Must be "server" or "daemon"' });
    }
    const logPath = path.join(BRAIN_DIR, 'logs', `${type}.log`);
    if (!fs.existsSync(logPath)) {
      return res.json({ content: '(no logs yet)' });
    }

    const stat = fs.statSync(logPath);
    const maxReadBytes = 50000;
    let content = '';

    if (stat.size > maxReadBytes) {
      const fd = fs.openSync(logPath, 'r');
      const buffer = Buffer.alloc(maxReadBytes);
      fs.readSync(fd, buffer, 0, maxReadBytes, stat.size - maxReadBytes);
      fs.closeSync(fd);
      content = buffer.toString('utf8');
    } else {
      content = fs.readFileSync(logPath, 'utf8');
    }

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
        
        // By default, filter out completed tasks
        if (req.query.status !== 'all' && data.status === 'completed') {
          continue;
        }
        
        tasks.push({ ...data, body: content.trim(), slug: file.replace('.md', '') });
      } catch (e) {
        // skip
      }
    }
    res.json(tasks.sort((a, b) => (a.priority || 5) - (b.priority || 5)));
    
  } catch (err) { serverError(res, err); }
});

router.delete('/api/tasks/cleanup', requireAuth, requireScope('tasks:write'), (req, res) => {
  try {
    if (!fs.existsSync(TASKS_DIR)) {
      return res.json({ deleted: 0 });
    }
    let deleted = 0;
    const files = fs.readdirSync(TASKS_DIR);
    for (const file of files) {
      if (!file.endsWith('.md')) continue;
      const filePath = path.join(TASKS_DIR, file);
      try {
        const raw = fs.readFileSync(filePath, 'utf8');
        const { data } = matter(raw);
        if (data.status === 'completed') {
          fs.unlinkSync(filePath);
          deleted++;
        }
      } catch (e) {
        // skip
      }
    }
    res.json({ deleted });
    
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

router.get('/api/config-json', requireAuth, requireScope('config:read'), (req, res) => {
  try {
    const securityPath = path.join(CONFIG_DIR, 'security.yml');
    const budgetPath = path.join(CONFIG_DIR, 'budget.yml');
    const brainPath = path.join(CONFIG_DIR, 'brain.json');
    const secretsPath = path.join(AGENT_DIR, 'secrets.enc');

    let security = {};
    let budget = {};
    let brain = {};
    let secrets = {};

    if (fs.existsSync(securityPath)) {
      try {
        security = yaml.parse(fs.readFileSync(securityPath, 'utf8')) || {};
      } catch {}
    }
    if (fs.existsSync(budgetPath)) {
      try {
        budget = yaml.parse(fs.readFileSync(budgetPath, 'utf8')) || {};
      } catch {}
    }
    if (fs.existsSync(brainPath)) {
      try {
        brain = JSON.parse(fs.readFileSync(brainPath, 'utf8')) || {};
      } catch {}
    }
    if (fs.existsSync(secretsPath)) {
      try {
        secrets = JSON.parse(fs.readFileSync(secretsPath, 'utf8')) || {};
      } catch {}
    }

    const safeBrain = { ...brain };
    if (safeBrain.token) {
      safeBrain.has_token = true;
      delete safeBrain.token;
    }

    const allowedKeys = ['google_api_key', 'anthropic_api_key', 'openai_api_key', 'tavily_api_key', 'brave_api_key', 'exa_api_key', 'serper_api_key', 'github_token'];
    const safeSecrets = {};
    for (const key of allowedKeys) {
      if (secrets[key] !== undefined) {
        safeSecrets[key] = secrets[key];
      }
    }

    res.json({ security, budget, brain: safeBrain, secrets: safeSecrets });
    
  } catch (err) { serverError(res, err); }
});

router.post('/api/config-json', requireAuth, requireScope('config:write'), (req, res) => {
  try {
    const { security, budget, brain, secrets } = req.body;
    const securityPath = path.join(CONFIG_DIR, 'security.yml');
    const budgetPath = path.join(CONFIG_DIR, 'budget.yml');
    const brainPath = path.join(CONFIG_DIR, 'brain.json');
    const secretsPath = path.join(AGENT_DIR, 'secrets.enc');

    if (!fs.existsSync(CONFIG_DIR)) {
      fs.mkdirSync(CONFIG_DIR, { recursive: true });
    }

    if (security) {
      fs.writeFileSync(securityPath, yaml.stringify(security), { encoding: 'utf8', mode: 0o600 });
    }
    if (budget) {
      fs.writeFileSync(budgetPath, yaml.stringify(budget), { encoding: 'utf8', mode: 0o600 });
    }
    if (brain) {
      let existingBrain = {};
      if (fs.existsSync(brainPath)) {
        try {
          existingBrain = JSON.parse(fs.readFileSync(brainPath, 'utf8')) || {};
        } catch {}
      }
      const nextBrain = { ...existingBrain, ...brain };
      if ((brain.token === undefined || brain.token === '') && existingBrain.token) {
        nextBrain.token = existingBrain.token;
      }
      delete nextBrain.has_token;
      fs.writeFileSync(brainPath, JSON.stringify(nextBrain, null, 2), { encoding: 'utf8', mode: 0o600 });
    }
    if (secrets) {
      let existingSecrets = {};
      if (fs.existsSync(secretsPath)) {
        try {
          existingSecrets = JSON.parse(fs.readFileSync(secretsPath, 'utf8')) || {};
        } catch {}
      }
      const allowedKeys = ['google_api_key', 'anthropic_api_key', 'openai_api_key', 'tavily_api_key', 'brave_api_key', 'exa_api_key', 'serper_api_key', 'github_token'];
      for (const key of allowedKeys) {
        if (secrets[key] !== undefined) {
          if (secrets[key] === '') {
            delete existingSecrets[key];
          } else {
            existingSecrets[key] = secrets[key];
          }
        }
      }
      fs.writeFileSync(secretsPath, JSON.stringify(existingSecrets, null, 2), { encoding: 'utf8', mode: 0o600 });
    }

    res.json({ success: true });
    
  } catch (err) { serverError(res, err); }
});

router.get('/api/usage', requireAuth, async (req, res) => {
  try {
    const { syncUsageLedger, calculateCurrentCost } = await import('../core/usage-tracker.mjs');
    
    // Sync the ledger first to capture new logs and lock in current prices
    const pricingMap = await getPricingMap();
    syncUsageLedger(pricingMap);
    
    res.json(calculateCurrentCost());
  } catch (err) { serverError(res, err); }
});

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
    console.error("API ERROR:", err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/openrouter-models
 * Dynamically fetches the list of available OpenRouter models.
 */
router.get('/api/openrouter-models', requireAuth, async (req, res) => {
  try {
    const response = await fetch('https://openrouter.ai/api/v1/models');
    if (response.ok) {
      const data = await response.json();
      const models = data.data.map(m => {
        return {
          id: m.id,
          displayName: m.name,
          pricing: m.pricing,
          created: m.created || 0
        };
      });
      // Sort first by provider (alphabetical), then by created (descending)
      models.sort((a, b) => {
        const provA = a.id.split('/')[0];
        const provB = b.id.split('/')[0];
        if (provA < provB) return -1;
        if (provA > provB) return 1;
        return b.created - a.created;
      });
      return res.json({ models });
    }
    throw new Error(`OpenRouter API responded with ${response.status}`);
  } catch (err) {
    console.error("API ERROR:", err);
    res.status(500).json({ error: err.message });
  }
});

// ─── Consolidated Auth Routes ──────────────────────────────────────────────────
// Moved to routes/auth.mjs

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

router.get('/api/dashboard/instructions', requireAuth, requireScope('instructions:read'), (req, res) => {
  const surfaces = [];
  const surfaceFiles = ['AGENTS.md', 'GEMINI.md', 'CLAUDE.md', 'INSTRUCTIONS.md'];
  
  for (const name of surfaceFiles) {
    let filePath;
    if (name === 'INSTRUCTIONS.md') {
      filePath = INSTRUCTIONS;
    } else {
      filePath = path.join(process.cwd(), name);
    }
    
    let size = 0;
    let lastCompiled = '';
    let active = false;
    
    if (fs.existsSync(filePath)) {
      const stat = fs.statSync(filePath);
      size = stat.size;
      lastCompiled = stat.mtime.toISOString();
      active = true;
    }
    
    surfaces.push({
      name,
      filename: name,
      size,
      lastCompiled,
      active
    });
  }
  
  const lastCompileTimestamp = fs.existsSync(INSTRUCTIONS) ? fs.statSync(INSTRUCTIONS).mtime.toISOString() : '';
  const totalNodes = fs.existsSync(VAULT_DIR) ? getNodes(VAULT_DIR).length : 0;
  
  res.json({
    surfaces,
    lastCompileTimestamp,
    totalNodes
  });
});

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
  return path.join(SKILLS_DIR, 'total-recall', 'skills', 'tr-ssss', 'references');
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
        const r = readTextResource(path.join(SKILLS_DIR, 'total-recall', 'skills', 'tr-ssss', 'SKILL.md'), 'ssss-skill');
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

router.get('/api/ssss/instructions', requireAuth, requireScope('ssss:read', 'instructions:read'), (req, res) => {
  const surface = req.query.surface;
  if (surface) {
    if (surface === 'INSTRUCTIONS.md') {
      return sendTextResource(res, INSTRUCTIONS, 'instructions');
    }
    const safeSurface = path.basename(surface);
    const surfacePath = path.join(process.cwd(), safeSurface);
    return sendTextResource(res, surfacePath, safeSurface);
  }
  return sendTextResource(res, INSTRUCTIONS, 'instructions');
});

router.get('/api/ssss/skill/ssss', requireAuth, requireScope('ssss:read'), (_req, res) => {
  return sendTextResource(res, path.join(SKILLS_DIR, 'total-recall', 'skills', 'tr-ssss', 'SKILL.md'), 'ssss-skill');
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

// ─── Brain Layer Management ────────────────────────────────────────────────

/**
 * GET /api/brains
 * List all known brains (global + registered projects) with state metadata.
 * The global brain reads project brain frontmatter for state display.
 */
router.get('/api/brains', requireAuth, requireScope('ssss:read'), async (req, res) => {
  try {
    const globalBrainDir = path.join(os.homedir(), '.agent', 'skills', 'total-recall');
    const brains = [];

    // Global brain
    const globalVaultDir = path.join(globalBrainDir, 'memory-vault');
    let globalNodeCount = 0;
    if (fs.existsSync(globalVaultDir)) {
      try {
        globalNodeCount = getNodes(globalVaultDir).length;
      } catch {
        // Count .md files manually
        const countMd = (dir) => {
          if (!fs.existsSync(dir)) return 0;
          let count = 0;
          for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
            if (entry.isDirectory()) count += countMd(path.join(dir, entry.name));
            else if (entry.name.endsWith('.md')) count++;
          }
          return count;
        };
        globalNodeCount = countMd(globalVaultDir);
      }
    }

    brains.push({
      id: 'global',
      name: 'Global Brain',
      layer: 'global',
      path: globalBrainDir,
      exists: fs.existsSync(globalBrainDir),
      node_count: globalNodeCount,
      last_compiled: getLastModified(path.join(globalBrainDir, 'memory-derived', 'graph-index.jsonl')),
    });

    // Project brains from registry
    const registryPath = path.join(globalBrainDir, 'config', 'project-registry.json');
    if (fs.existsSync(registryPath)) {
      try {
        const registry = JSON.parse(fs.readFileSync(registryPath, 'utf8'));
        for (const project of registry) {
          const projectVaultDir = path.join(project.brainDir, 'memory-vault');
          let nodeCount = 0;
          const exists = fs.existsSync(project.brainDir);

          if (exists && fs.existsSync(projectVaultDir)) {
            const countMd = (dir) => {
              if (!fs.existsSync(dir)) return 0;
              let count = 0;
              for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
                if (entry.isDirectory()) count += countMd(path.join(dir, entry.name));
                else if (entry.name.endsWith('.md')) count++;
              }
              return count;
            };
            nodeCount = countMd(projectVaultDir);
          }

          brains.push({
            id: `project:${project.name}`,
            name: project.name,
            layer: 'project',
            path: project.brainDir,
            project_root: project.path,
            exists,
            node_count: nodeCount,
            registered_at: project.registered_at,
            last_compiled: project.last_compiled || getLastModified(path.join(project.brainDir, 'memory-derived', 'graph-index.jsonl')),
          });
        }
      } catch (err) {
        logger.error('server', 'Failed to read project registry', { error: err.message });
      }
    }

    // Portfolio Sync Tenant
    try {
      // Need to import dynamically because rest.mjs is already imported above
      const config = await import('../core/config.mjs');
      if (config.portfolioSync?.enabled) {
        const tenantVaultDir = config.portfolioSync.vaultDir;
        const exists = fs.existsSync(tenantVaultDir);
        let nodeCount = 0;
        
        if (exists) {
            const countMd = (dir) => {
              if (!fs.existsSync(dir)) return 0;
              let count = 0;
              for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
                if (entry.isDirectory()) count += countMd(path.join(dir, entry.name));
                else if (entry.name.endsWith('.md')) count++;
              }
              return count;
            };
            nodeCount = countMd(tenantVaultDir);
        }

        brains.push({
          id: 'tenant:portfolio-site',
          name: 'Portfolio Site (Tenant)',
          layer: 'tenant',
          path: tenantVaultDir,
          project_root: path.dirname(tenantVaultDir),
          exists,
          node_count: nodeCount,
          last_compiled: null
        });
      }
    } catch (err) {
       // ignore
    }

    res.json({ brains });
    
  } catch (err) { serverError(res, err); }
});

/**
 * GET /api/brains/:id/nodes
 * List all memory nodes for a specific brain.
 */
router.get('/api/brains/:id/nodes', requireAuth, requireScope('ssss:read', 'memory:read'), async (req, res) => {
  try {
    const brainId = req.params.id;
    let brainDir;
    let vaultDir;

    if (brainId === 'global') {
      brainDir = path.join(os.homedir(), '.agent', 'skills', 'total-recall');
      vaultDir = path.join(brainDir, 'memory-vault');
    } else if (brainId.startsWith('project:')) {
      const projectName = brainId.slice('project:'.length);
      const globalBrainDir = path.join(os.homedir(), '.agent', 'skills', 'total-recall');
      const registryPath = path.join(globalBrainDir, 'config', 'project-registry.json');
      if (!fs.existsSync(registryPath)) {
        return res.status(404).json({ error: 'Project registry not found' });
      }
      const registry = JSON.parse(fs.readFileSync(registryPath, 'utf8'));
      const project = registry.find(p => p.name === projectName);
      if (!project) {
        return res.status(404).json({ error: `Project "${projectName}" not found in registry` });
      }
      brainDir = project.brainDir;
      vaultDir = path.join(brainDir, 'memory-vault');
    } else if (brainId.startsWith('tenant:')) {
      const tenantName = brainId.slice('tenant:'.length);
      if (tenantName !== 'portfolio-site') {
         return res.status(404).json({ error: `Tenant "${tenantName}" not found` });
      }
      const config = await import('../core/config.mjs');
      if (!config.portfolioSync?.enabled) {
         return res.status(404).json({ error: `Tenant sync not enabled` });
      }
      vaultDir = config.portfolioSync.vaultDir;
    } else {
      return res.status(400).json({ error: 'Invalid brain ID. Use "global", "project:<name>", or "tenant:<name>"' });
    }

    if (!fs.existsSync(vaultDir)) {
      return res.json({ nodes: [], brain_id: brainId });
    }

    let nodes = getNodes(vaultDir);
    const { q, category, status, tag } = req.query;
    if (q) {
      const query = String(q).toLowerCase();
      nodes = nodes.filter(n =>
        [n.slug, n.title, n.category, (n.tags || []).join(' '), n.body]
          .join(' ').toLowerCase().includes(query)
      );
    }
    if (category) nodes = nodes.filter(n => n.category === category);
    if (status) nodes = nodes.filter(n => n.status === status);
    if (tag) nodes = nodes.filter(n => (n.tags || []).includes(tag));

    res.json({ nodes, brain_id: brainId, count: nodes.length });
  } catch (err) { serverError(res, err); }
});

let cachedPricingMap = null;
let lastPricingFetch = 0;

async function getPricingMap() {
  if (cachedPricingMap && Date.now() - lastPricingFetch < 1000 * 60 * 60) {
    return cachedPricingMap;
  }
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 3000);
    const response = await fetch('https://openrouter.ai/api/v1/models', { signal: controller.signal });
    clearTimeout(timeoutId);
    if (response.ok) {
      const data = await response.json();
      const map = {};
      for (const m of (data.data || [])) {
        const parts = m.id.split('/');
        const baseId = parts[parts.length - 1];
        map[baseId] = m.pricing;
        map[m.id] = m.pricing;
      }
      cachedPricingMap = map;
      lastPricingFetch = Date.now();
      return map;
    }
  } catch (e) {}
  return {};
}

/**
 * GET /api/gemini-models
 * Dynamically fetches the list of available Gemini models using the user's GOOGLE_API_KEY.
 * Falls back to a modern list of Gemini models if GOOGLE_API_KEY is not set or the fetch fails.
 */
router.get('/api/gemini-models', requireAuth, async (req, res) => {
  try {
    // 1. Dynamically fetch available models from the antigravity CLI at runtime
    try {
      const { findBinaryInPath } = await import('../core/runtime.mjs');
      const antigravityPath = findBinaryInPath('antigravity');
      if (antigravityPath) {
        const result = spawnSync(antigravityPath, ['--help'], { encoding: 'utf8', timeout: 3000 });
        if (result.status === 0 && result.stdout) {
          const output = result.stdout;
          const discovered = [];

          // Match standard gemini-X.Y-Z names
          const modelRegex = /gemini-\d+\.\d+(?:-\w+)?/g;
          const matches = output.match(modelRegex) || [];
          for (const m of matches) {
            discovered.push(m);
          }

          // Match version-style models like X.Y-pro or X.Y-flash and prefix with gemini-
          const versionRegex = /\b(\d+\.\d+-\w+)\b/g;
          const versionMatches = output.match(versionRegex) || [];
          for (const vm of versionMatches) {
            discovered.push(`gemini-${vm}`);
          }

          const uniqueModels = [...new Set(discovered)];
          if (uniqueModels.length > 0) {
            const pricingMap = await getPricingMap();
            const cliModels = uniqueModels.map(modelId => {
              const parts = modelId.split('-');
              const displayName = parts.map(p => p.charAt(0).toUpperCase() + p.slice(1)).join(' ');
              return { id: modelId, displayName, pricing: pricingMap[modelId] || pricingMap[`google/${modelId}`] };
            });
            return res.json({ models: cliModels, source: 'cli' });
          }
        }
      }
    } catch (e) {
      // Fail silently and fall back
    }

    let apiKey = process.env.GOOGLE_API_KEY || process.env.GEMINI_API_KEY;
    if (!apiKey) {
      try {
        const secretsPath = path.join(AGENT_DIR, 'secrets.enc');
        if (fs.existsSync(secretsPath)) {
          const secrets = JSON.parse(fs.readFileSync(secretsPath, 'utf8')) || {};
          apiKey = secrets.gemini_api_key || secrets.google_api_key;
        }
      } catch {}
    }



    if (!apiKey) return res.json({ models: [], source: 'missing_key' });

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);
      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`, {
        signal: controller.signal
      });
      clearTimeout(timeoutId);

      if (response.ok) {
        const data = await response.json();
        const pricingMap = await getPricingMap();
        const models = (data.models || [])
          .filter(m => m.name.startsWith('models/gemini-') || m.name.startsWith('models/gemini'))
          .map(m => {
            const id = m.name.replace(/^models\//, '');
            // Create nice display name e.g., "gemini-3.5-flash" -> "Gemini 3.5 Flash"
            const parts = id.split('-');
            const displayName = parts.map(p => p.charAt(0).toUpperCase() + p.slice(1)).join(' ');
            const pricing = pricingMap[`google/${id}`] || pricingMap[id] || null;
            return { id, displayName, pricing };
          })
          ;
        if (models.length > 0) {
          return res.json({ models, source: 'dynamic' });
        }
      }
    } catch {}

    res.json({ models: [], source: 'api_error' });
  } catch (err) {
    serverError(res, err);
  }
});

/**
 * GET /api/claude-models
 * Dynamically fetches the list of available Anthropic models using the user's ANTHROPIC_API_KEY.
 */
router.get('/api/claude-models', requireAuth, async (req, res) => {
  try {
    let apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      try {
        const secretsPath = path.join(AGENT_DIR, 'secrets.enc');
        if (fs.existsSync(secretsPath)) {
          const secrets = JSON.parse(fs.readFileSync(secretsPath, 'utf8')) || {};
          apiKey = secrets.anthropic_api_key;
        }
      } catch {}
    }



    if (!apiKey) return res.json({ models: [], source: 'missing_key' });

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);
      const response = await fetch('https://api.anthropic.com/v1/models', {
        headers: {
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01'
        },
        signal: controller.signal
      });
      clearTimeout(timeoutId);

      if (response.ok) {
        const data = await response.json();
        const pricingMap = await getPricingMap();
        const models = (data.data || []).map(m => {
          const parts = m.id.split('-');
          const displayName = parts.map(p => p.charAt(0).toUpperCase() + p.slice(1)).join(' ');
          const pricing = pricingMap[`openai/${m.id}`] || pricingMap[m.id] || null;
          return { id: m.id, displayName, pricing };
        });
        if (models.length > 0) {
          return res.json({ models, source: 'dynamic' });
        }
      }
    } catch {}

    res.json({ models: [], source: 'api_error' });
  } catch (err) {
    serverError(res, err);
  }
});

/**
 * GET /api/openai-models
 * Dynamically fetches the list of available OpenAI models using the user's OPENAI_API_KEY.
 */
router.get('/api/openai-models', requireAuth, async (req, res) => {
  try {
    let apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      try {
        const secretsPath = path.join(AGENT_DIR, 'secrets.enc');
        if (fs.existsSync(secretsPath)) {
          const secrets = JSON.parse(fs.readFileSync(secretsPath, 'utf8')) || {};
          apiKey = secrets.openai_api_key;
        }
      } catch {}
    }



    if (!apiKey) return res.json({ models: [], source: 'missing_key' });

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);
      const response = await fetch('https://api.openai.com/v1/models', {
        headers: {
          'Authorization': `Bearer ${apiKey}`
        },
        signal: controller.signal
      });
      clearTimeout(timeoutId);

      if (response.ok) {
        const data = await response.json();
        const pricingMap = await getPricingMap();
        const models = (data.data || [])
          .filter(m => m.id.startsWith('gpt-') || m.id.startsWith('o1') || m.id.startsWith('o3') || m.id.startsWith('o4') || m.id.startsWith('chatgpt-'))
          .map(m => {
            const pricing = pricingMap[`openai/${m.id}`] || pricingMap[m.id] || null;
            return { id: m.id, displayName: m.id, pricing };
          });
          
        if (models.length > 0) {
          models.sort((a, b) => a.id.localeCompare(b.id));
          return res.json({ models, source: 'dynamic' });
        }
      }
    } catch {}

    res.json({ models: [], source: 'api_error' });
  } catch (err) {
    serverError(res, err);
  }
});


function getLastModified(filePath) {
  try {
    if (fs.existsSync(filePath)) {
      return fs.statSync(filePath).mtime.toISOString();
    }
  } catch {}
  return null;
}

/**
 * GET /api/update/check
 */
router.get('/api/update/check', requireAuth, async (req, res) => {
  try {
    const localPkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
    const currentVersion = localPkg.version || '0.0.0';

    const registryRes = await fetch('https://registry.npmjs.org/total-recall-brain/latest');
    if (!registryRes.ok) {
      throw new Error(`Failed to fetch latest version from npm: ${registryRes.status}`);
    }
    const registryData = await registryRes.json();
    const latestVersion = registryData.version || '0.0.0';

    const updateAvailable = latestVersion !== currentVersion;

    res.json({
      currentVersion,
      latestVersion,
      updateAvailable
    });
  } catch (err) {
    serverError(res, err);
  }
});

/**
 * POST /api/update/run
 */
router.post('/api/update/run', requireAuth, async (req, res) => {
  try {
    res.json({ success: true, message: 'Update started. Server is updating and will restart shortly.' });

    setImmediate(async () => {
      logger.info('update', 'Starting auto-update process...');
      try {
        const { exec } = await import('node:child_process');
        
        const runCmd = (cmd, cwd) => new Promise((resolve, reject) => {
          logger.info('update', `Running: ${cmd} in ${cwd}`);
          exec(cmd, { cwd }, (err, stdout, stderr) => {
            if (err) {
              logger.error('update', `Command failed: ${cmd}. Error: ${err.message}`);
              return reject(err);
            }
            resolve({ stdout, stderr });
          });
        });

        // 1. git pull
        await runCmd('git pull', ROOT);
        // 2. npm install
        await runCmd('npm install', ROOT);
        // 3. build/install frontend if package.json exists
        const frontendPath = path.join(ROOT, 'frontend');
        if (fs.existsSync(path.join(frontendPath, 'package.json'))) {
          await runCmd('npm install', frontendPath);
          await runCmd('npm run build', frontendPath);
        }

        logger.info('update', 'Update successfully applied. Restarting server...');
        process.exit(0);
      } catch (err) {
        logger.error('update', `Auto-update failed: ${err.message}`);
      }
    });
  } catch (err) {
    serverError(res, err);
  }
});

router.get('/api/help', requireAuth, (req, res) => {
  const { topic } = req.query;
  const docsDir = path.join(ROOT, 'docs');
  const referenceDir = path.join(docsDir, 'reference');

  if (!topic) {
    return res.json({
      topics: [
        { id: 'cli-reference', title: 'CLI Reference Guide', description: 'npx total-recall command catalog and flags' },
        { id: 'ssss', title: 'SSSS Specifications', description: 'Structured Semantic Syntax System guide' },
        { id: 'architecture', title: 'System Architecture', description: 'System topology and VFS structures' },
        { id: 'collab', title: 'Collaboration Guide', description: 'Collaborative workspaces and team annotations' }
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

export { router as restRouter };
