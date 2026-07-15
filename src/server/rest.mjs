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
 *     GET    /v1/models               list available models (OpenAI-compatible)
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
import ssssRouter         from './routes/ssss.mjs';
import { keysRouter }     from './routes/keys.mjs';
import { secretsRouter }  from './routes/secrets.mjs';
import { sessionsRouter } from './routes/sessions.mjs';
import { shareRouter }    from './routes/share.mjs';
import { authRouter }     from './routes/auth.mjs';
import { webauthnRouter } from './routes/webauthn.mjs';
import { sandboxRouter }  from './routes/sandbox.mjs';
import { researchRouter } from './routes/research.mjs';
import { skillsRouter }   from './routes/skills.mjs';
import { docsRouter }     from './routes/docs.mjs';
import syncRouter         from './routes/sync.mjs';
import extensionRouter    from './routes/extension.mjs';
import systemRouter       from './routes/system.mjs';
import configRouter       from './routes/config.mjs';
import helpRouter         from './routes/help.mjs';
import brainsRouter       from './routes/brains.mjs';
import integrationsRouter from './routes/integrations.mjs';
import modelsRouter       from './routes/models.mjs';
import graphRouter        from './routes/graph.mjs';
import vaultRouter        from './routes/vault.mjs';
import dashboardRouter    from './routes/dashboard.mjs';
import tasksRouter        from './routes/tasks.mjs';
import captureRouter      from './routes/capture.mjs';
import { collabRouter }   from './routes/collab.mjs';
import contextRouter      from './routes/context.mjs';
import dreamRouter        from './routes/dream.mjs';
import exportRouter       from './routes/export.mjs';
import fieldRouter        from './routes/field.mjs';
import filesRouter        from './routes/files.mjs';
import importRouter       from './routes/import.mjs';
import instructionsRouter from './routes/instructions.mjs';
import scriptsRouter      from './routes/scripts.mjs';
import ttsRouter          from './routes/tts.mjs';
import updateRouter       from './routes/update.mjs';
import { rulesRouter }    from './routes/rules.mjs';
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

const ROOT = process.env.TR_ROOT || path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
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
router.use(secretsRouter);
router.use(sessionsRouter);
router.use(shareRouter);
router.use(authRouter);
router.use(webauthnRouter);
router.use(sandboxRouter);
router.use(researchRouter);
router.use(skillsRouter);
router.use(docsRouter);
router.use(syncRouter);
router.use(extensionRouter);
router.use(systemRouter);
router.use(configRouter);
router.use(helpRouter);
router.use(brainsRouter);
router.use(integrationsRouter);
router.use(modelsRouter);
router.use(graphRouter);
router.use(vaultRouter);
router.use(dashboardRouter);
router.use(tasksRouter);
router.use(captureRouter);
router.use(collabRouter);
router.use(contextRouter);
router.use(dreamRouter);
router.use(exportRouter);
router.use(fieldRouter);
router.use(filesRouter);
router.use(importRouter);
router.use(instructionsRouter);
router.use(scriptsRouter);
router.use(ttsRouter);
router.use(updateRouter);
router.use(ssssRouter);
router.use(rulesRouter);

export { router as restRouter };
export default router;
