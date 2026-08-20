/**
 * /api/secrets/* — provider secrets catalog (not dashboard PATs; see /api/keys)
 *
 * SSOT: secrets store. Repo/deploy .env files are projections via export-env.
 *
 * - GET/POST catalog, meta, rotate, usage, import-env (migrate-in only)
 * - POST /api/secrets/export-env   write .env from store → path or all projects
 * - GET  /api/secrets/export-env   dry-run / preview keys for a path
 */

import express from 'express';
import path from 'node:path';
import { requireAuth, requireScope, verifyStepUpToken } from '../auth.mjs';
import { badRequest, serverError, notFound, BRAIN_DIR, resolveVaultFromQuery, ROOT } from './_shared.mjs';
import {
  listSecretsMeta,
  setSecret,
  getSecret,
  getSecretsCatalog,
  updateSecretMeta,
  rotateSecret,
  listRotationDue,
  recordUsage,
  summarizeUsage,
  summarizeUsageByKey,
  listUsageEvents,
  deleteSecret,
} from '../../core/secrets-store.mjs';
import { logger } from '../../core/logger.mjs';
import { getMeshSyncAuthorization, requireMeshSyncAuth } from '../../core/mesh-auth.mjs';
import { throttledFetch } from '../../core/throttled-fetch.mjs';
import { listProviders, getProvider } from '../../core/provider-catalog.mjs';
import {
  scanEnvSources,
  publicScanResult,
  importEnvSecrets,
  candidatesFromPaste,
  inferProvider,
  isCandidateKey,
} from '../../core/env-import.mjs';
import {
  exportEnvToProject,
  exportEnvToRegistry,
  buildEnvProjection,
  buildDeploySecretsPayload,
} from '../../core/secrets-env-export.mjs';

const router = express.Router();

/**
 * Provider secrets are a single host SSOT — NOT per project-vault brain.
 * Selecting any project:<name> scope for memory/graph must not empty the Secrets page.
 * Repo binding lives in secret metadata (repos[]), not separate secrets.enc files.
 *
 * Override only via TR_SECRETS_BRAIN / TR_BRAIN env (deploy/ops).
 */
function secretsBrainDir(_req) {
  if (process.env.TR_SECRETS_BRAIN) return process.env.TR_SECRETS_BRAIN;
  return BRAIN_DIR;
}

/** @deprecated alias — all secrets routes use global SSOT */
function brainDirFromReq(req) {
  return secretsBrainDir(req);
}

function meshServerPort() {
  const value = Number(process.env.TR_SERVER_PORT || process.env.PORT || 3000);
  return Number.isInteger(value) && value > 0 && value <= 65535 ? value : 3000;
}

function meshPeerUrl(ip, route) {
  return `http://${ip}:${meshServerPort()}${route}`;
}

router.get('/api/secrets/checksum', requireMeshSyncAuth, async (req, res) => {
  try {
    const { getSecretsChecksum } = await import('../../core/secrets-sync.mjs');
    const checksum = getSecretsChecksum();
    res.json({ checksum });
  } catch (err) {
    serverError(res, err);
  }
});

router.get('/api/secrets/sync', requireMeshSyncAuth, async (req, res) => {
  try {
    const fs = await import('node:fs');
    const { resolveSecretsPath } = await import('../../core/secrets-store.mjs');
    const SECRETS_FILE = resolveSecretsPath(BRAIN_DIR);
    if (!fs.existsSync(SECRETS_FILE)) {
      return res.status(404).json({ error: 'Secrets file not found' });
    }
    const blob = fs.readFileSync(SECRETS_FILE);
    res.set('Content-Type', 'application/octet-stream');
    res.send(blob);
  } catch (err) {
    serverError(res, err);
  }
});

router.get('/api/secrets/list', requireAuth, requireScope('keys:read', 'config:read'), async (req, res) => {
  try {
    const brainDir = brainDirFromReq(req);
    const keys = await listSecretsMeta(brainDir);
    res.json({ keys, store: path.join(brainDir, 'config', 'secrets.enc') });
  } catch (err) {
    serverError(res, err);
  }
});

router.get('/api/secrets/sync/status', requireAuth, requireScope('keys:read', 'config:read'), async (req, res) => {
  try {
    const { getSecretsChecksum } = await import('../../core/secrets-sync.mjs');
    const { getMeshPeers } = await import('../../core/mesh.mjs');
    
    const localChecksum = getSecretsChecksum();
    const peers = getMeshPeers();
    const authorization = await getMeshSyncAuthorization();
    
    // Mesh peers over Tailscale can take multi-second RTT under load (WAN laptop↔cloud).
    // 1.5s was too aggressive and reported healthy peers as unreachable.
    const PEER_PROBE_TIMEOUT_MS = 10_000;
    const nodes = await Promise.all(peers.map(async (peer) => {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), PEER_PROBE_TIMEOUT_MS);
        
        const response = await throttledFetch(meshPeerUrl(peer.ip, '/api/secrets/checksum'), {
          signal: controller.signal,
          headers: { Authorization: authorization }
        }, PEER_PROBE_TIMEOUT_MS);
        clearTimeout(timeoutId);
        
        if (response.ok) {
          const { checksum } = await response.json();
          return {
            hostname: peer.hostname,
            ip: peer.ip,
            status: checksum === localChecksum ? 'synced' : 'out_of_sync',
            checksum
          };
        }
      } catch (e) {
        // ignore
      }
      return {
        hostname: peer.hostname,
        ip: peer.ip,
        status: 'unreachable',
        checksum: null
      };
    }));

    res.json({
      localChecksum,
      nodes
    });
  } catch (err) {
    serverError(res, err);
  }
});

router.post('/api/secrets/sync/trigger', requireAuth, requireScope('keys:write', 'config:write'), async (req, res) => {
  try {
    const { getMeshPeers } = await import('../../core/mesh.mjs');
    const peers = getMeshPeers();
    const authorization = await getMeshSyncAuthorization();
    
    const PEER_TRIGGER_TIMEOUT_MS = 10_000;
    const results = await Promise.all(peers.map(async (peer) => {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), PEER_TRIGGER_TIMEOUT_MS);
        
        const response = await throttledFetch(meshPeerUrl(peer.ip, '/api/secrets/sync/trigger-pull'), {
          method: 'POST',
          signal: controller.signal,
          headers: {
            'Content-Type': 'application/json',
            Authorization: authorization
          }
        }, PEER_TRIGGER_TIMEOUT_MS);
        clearTimeout(timeoutId);
        
        return {
          hostname: peer.hostname,
          ip: peer.ip,
          success: response.ok
        };
      } catch (e) {
        return {
          hostname: peer.hostname,
          ip: peer.ip,
          success: false,
          error: e.message
        };
      }
    }));

    res.json({ success: true, results });
  } catch (err) {
    serverError(res, err);
  }
});

router.post('/api/secrets/sync/trigger-pull', requireMeshSyncAuth, async (req, res) => {
  await runPull(res);
  
  async function runPull(response) {
    try {
      const { getLeaderInfo, isLeader } = await import('../../core/leader-election.mjs');
      const { pullSecretsFromLeader } = await import('../../core/secrets-sync.mjs');
      
      if (await isLeader()) {
        return response.json({ success: true, message: 'Current node is leader, skip pull' });
      }
      
      const leaderInfo = await getLeaderInfo();
      if (!leaderInfo || !leaderInfo.ip) {
        return response.status(400).json({ error: 'Leader IP not found' });
      }
      
      const ok = await pullSecretsFromLeader(leaderInfo.ip);
      if (ok) {
        response.json({ success: true });
      } else {
        response.status(500).json({ error: 'Failed to pull secrets from leader' });
      }
    } catch (err) {
      serverError(response, err);
    }
  }
});

router.get('/api/secrets/providers', requireAuth, requireScope('keys:read', 'config:read'), (_req, res) => {
  res.json({ providers: listProviders() });
});

/**
 * GET /api/secrets/tracking-health
 * Hard status: any set secret without tracking_status=ok|exempt is an error.
 */
router.get(
  '/api/secrets/tracking-health',
  requireAuth,
  requireScope('keys:read', 'config:read'),
  async (req, res) => {
    try {
      const brainDir = brainDirFromReq(req);
      const { getTrackingHealth } = await import('../../core/provider-account-sync.mjs');
      const health = await getTrackingHealth(brainDir);
      res.status(health.healthy ? 200 : 409).json(health);
    } catch (err) {
      serverError(res, err);
    }
  },
);

/**
 * GET /api/secrets/shared-values
 * Same credential material under multiple secret names / apps → ERROR (rotate per app).
 */
router.get(
  '/api/secrets/shared-values',
  requireAuth,
  requireScope('keys:read', 'config:read'),
  async (req, res) => {
    try {
      const brainDir = brainDirFromReq(req);
      const { getSharedValueHealth } = await import('../../core/secrets-store.mjs');
      const health = await getSharedValueHealth(brainDir);
      res.status(health.healthy ? 200 : 409).json(health);
    } catch (err) {
      serverError(res, err);
    }
  },
);

/**
 * POST /api/secrets/account-sync
 * Live-probe vendor account/usage/subscription APIs and persist tracking meta.
 * Body: { key?, keys?, strict?, use_ai? }
 */
router.post(
  '/api/secrets/account-sync',
  requireAuth,
  requireScope('keys:write', 'config:write'),
  async (req, res) => {
    try {
      const brainDir = brainDirFromReq(req);
      const body = req.body || {};
      const {
        syncSecretAccount,
        syncAllSecretAccounts,
      } = await import('../../core/provider-account-sync.mjs');
      const opts = {
        strict: body.strict !== false,
        use_ai: !!body.use_ai,
        force_exempt: !!body.force_exempt,
      };
      if (body.key) {
        const result = await syncSecretAccount(brainDir, body.key, opts);
        const ok = result.tracking_status === 'ok' || result.tracking_status === 'exempt';
        return res.status(ok ? 200 : 409).json(result);
      }
      if (Array.isArray(body.keys) && body.keys.length) {
        opts.keys = body.keys;
      }
      const report = await syncAllSecretAccounts(brainDir, opts);
      res.status(report.healthy ? 200 : 409).json(report);
    } catch (err) {
      serverError(res, err);
    }
  },
);

/**
 * POST /api/secrets/:key/account-sync — sync one secret by path param
 */
router.post(
  '/api/secrets/:key/account-sync',
  requireAuth,
  requireScope('keys:write', 'config:write'),
  async (req, res) => {
    try {
      const brainDir = brainDirFromReq(req);
      const { syncSecretAccount } = await import('../../core/provider-account-sync.mjs');
      const result = await syncSecretAccount(brainDir, req.params.key, {
        strict: req.body?.strict !== false,
        use_ai: !!req.body?.use_ai,
        force_exempt: !!req.body?.force_exempt,
      });
      const ok = result.tracking_status === 'ok' || result.tracking_status === 'exempt';
      res.status(ok ? 200 : 409).json(result);
    } catch (err) {
      serverError(res, err);
    }
  },
);

router.get('/api/secrets/usage', requireAuth, requireScope('keys:read', 'config:read'), async (req, res) => {
  try {
    const brainDir = brainDirFromReq(req);
    const days = Math.min(90, Math.max(1, parseInt(req.query.days, 10) || 30));
    const summary = summarizeUsage(brainDir, { days });
    const by = summarizeUsageByKey(brainDir, { days });
    const events = listUsageEvents(brainDir, {
      limit: Math.min(200, parseInt(req.query.limit, 10) || 50),
      key_ref: req.query.key_ref || null,
      days,
    });
    res.json({ summary, ...by, events });
  } catch (err) {
    serverError(res, err);
  }
});

router.post('/api/secrets/usage', requireAuth, requireScope('keys:write', 'config:write'), async (req, res) => {
  try {
    const brainDir = brainDirFromReq(req);
    const body = req.body || {};
    const row = recordUsage(brainDir, {
      provider: body.provider || 'unknown',
      model: body.model,
      input_tokens: body.input_tokens || 0,
      output_tokens: body.output_tokens || 0,
      cost_usd: body.cost_usd ?? body.cost ?? null,
      key_ref: body.key_ref || body.key || null,
      source: body.source || 'api',
    });
    res.status(201).json(row);
  } catch (err) {
    serverError(res, err);
  }
});

router.get('/api/secrets/rotation-due', requireAuth, requireScope('keys:read', 'config:read'), async (req, res) => {
  try {
    const brainDir = brainDirFromReq(req);
    const due = await listRotationDue(brainDir, { autoOnly: req.query.auto === '1' });
    res.json({ due, count: due.length });
  } catch (err) {
    serverError(res, err);
  }
});

router.post('/api/secrets/rotation-due/enqueue', requireAuth, requireScope('keys:write', 'config:write'), async (req, res) => {
  try {
    const brainDir = brainDirFromReq(req);
    const { enqueueRotationDueTasks } = await import('../../core/secrets-rotate.mjs');
    const result = await enqueueRotationDueTasks(brainDir, {
      autoOnly: !!req.body?.autoOnly,
    });
    res.json(result);
  } catch (err) {
    serverError(res, err);
  }
});

router.get('/api/secrets', requireAuth, requireScope('keys:read', 'config:read'), async (req, res) => {
  try {
    const brainDir = brainDirFromReq(req);
    if (req.query.catalog === '0') {
      const keys = await listSecretsMeta(brainDir);
      return res.json({ keys, store: path.join(brainDir, 'config', 'secrets.enc') });
    }
    const catalog = await getSecretsCatalog(brainDir);
    res.json(catalog);
  } catch (err) {
    serverError(res, err);
  }
});

/**
 * Preview or write .env projections from secrets store.
 * Body/query: { path?, all_projects?, dry_run?, filename?, include_global?, keys? }
 */
router.post('/api/secrets/export-env', requireAuth, requireScope('keys:write', 'config:write'), async (req, res) => {
  try {
    const brainDir = brainDirFromReq(req);
    const body = req.body || {};
    const dryRun = !!body.dry_run || !!body.dryRun;
    const exportOpts = {
      filename: body.filename || '.env',
      example: body.example !== false,
      dryRun,
      includeGlobal: body.include_global !== false && body.includeGlobal !== false,
      keys: Array.isArray(body.keys) ? body.keys : undefined,
    };

    if (body.all_projects || body.allProjects) {
      const results = await exportEnvToRegistry(brainDir, exportOpts);
      return res.json({ results, store: path.join(brainDir, 'config', 'secrets.enc') });
    }

    const targetPath = body.path || body.project_path || ROOT;
    if (body.preview_only || body.previewOnly) {
      const projection = await buildEnvProjection(brainDir, {
        projectPath: targetPath,
        includeGlobal: exportOpts.includeGlobal,
        keys: exportOpts.keys,
      });
      return res.json({
        path: targetPath,
        keys: projection.keys,
        count: projection.count,
        store: projection.store,
        // never return dotenv body with values over API unless explicit
        has_values: false,
      });
    }

    const result = await exportEnvToProject(brainDir, targetPath, exportOpts);
    res.json({
      ...result,
      // strip any accidental value leakage — only paths and key names
      keys: result.keys,
      count: result.count,
    });
  } catch (err) {
    if (err.message?.includes('not a directory')) return badRequest(res, err.message);
    serverError(res, err);
  }
});

router.get('/api/secrets/export-env', requireAuth, requireScope('keys:read', 'config:read'), async (req, res) => {
  try {
    const brainDir = brainDirFromReq(req);
    const targetPath = req.query.path || ROOT;
    const projection = await buildEnvProjection(brainDir, {
      projectPath: targetPath,
      includeGlobal: req.query.no_global !== '1',
    });
    res.json({
      path: targetPath,
      keys: projection.keys,
      count: projection.count,
      store: projection.store,
    });
  } catch (err) {
    serverError(res, err);
  }
});

/** Deploy helper: returns dotenv text for host agent (auth required). */
router.post('/api/secrets/deploy-payload', requireAuth, requireScope('keys:write', 'config:write'), async (req, res) => {
  try {
    const brainDir = brainDirFromReq(req);
    const body = req.body || {};
    const payload = await buildDeploySecretsPayload(brainDir, {
      projectPath: body.path,
      projectSlug: body.project_slug || body.projectSlug,
      includeGlobal: body.include_global !== false,
      keys: body.keys,
    });
    // For deploy automation — values included once under auth
    res.json(payload);
  } catch (err) {
    serverError(res, err);
  }
});

router.get('/api/secrets/scan-env', requireAuth, requireScope('keys:write', 'config:write'), async (req, res) => {
  try {
    const brainDir = brainDirFromReq(req);
    const existing = await listSecretsMeta(brainDir);
    const existingSet = new Set(existing.map((e) => e.key));
    const scan = scanEnvSources({
      brainDir,
      includeProcessEnv: true,
      cwd: ROOT,
    });
    res.json(publicScanResult(scan, existingSet));
  } catch (err) {
    serverError(res, err);
  }
});

router.post('/api/secrets/parse-env', requireAuth, requireScope('keys:write', 'config:write'), async (req, res) => {
  try {
    const text = req.body?.text;
    if (!text || typeof text !== 'string') {
      return badRequest(res, 'text is required (paste .env contents)');
    }
    if (text.length > 200_000) {
      return badRequest(res, 'text too large (max 200KB)');
    }
    const brainDir = brainDirFromReq(req);
    const existing = await listSecretsMeta(brainDir);
    const existingSet = new Set(existing.map((e) => e.key));
    const { candidates } = candidatesFromPaste(text);
    res.json({
      candidates: candidates.map((c) => ({
        ...c,
        already_set: existingSet.has(c.key),
      })),
      count: candidates.length,
    });
  } catch (err) {
    serverError(res, err);
  }
});

router.post('/api/secrets/import-env', requireAuth, requireScope('keys:write', 'config:write'), async (req, res) => {
  try {
    const brainDir = brainDirFromReq(req);
    const body = req.body || {};
    const overwrite = !!body.overwrite;

    if (body.pairs && typeof body.pairs === 'object') {
      let pairs = body.pairs;
      if (Array.isArray(body.keys) && body.keys.length) {
        const filtered = {};
        for (const k of body.keys) {
          if (pairs[k] != null) filtered[k] = pairs[k];
        }
        pairs = filtered;
      }
      const clean = {};
      for (const [k, v] of Object.entries(pairs)) {
        // Pattern-based only — any secret-shaped name, no product API whitelist
        if (isCandidateKey(k) && v) clean[k] = String(v);
      }
      const result = await importEnvSecrets(brainDir, {
        pairs: clean,
        overwrite,
        actor: 'dashboard-import',
      });
      return res.json(result);
    }

    const result = await importEnvSecrets(brainDir, {
      keys: Array.isArray(body.keys) ? body.keys : undefined,
      all: !!body.all,
      overwrite,
      actor: 'dashboard-import',
    });
    res.json(result);
  } catch (err) {
    serverError(res, err);
  }
});

router.post('/api/secrets', requireAuth, requireScope('keys:write', 'config:write'), async (req, res) => {
  try {
    const body = req.body || {};
    const { key, value } = body;
    if (!key || !value) return badRequest(res, 'key and value are required');
    const brainDir = brainDirFromReq(req);
    const provider = body.provider || inferProvider(key);
    const catalog = getProvider(provider);
    await setSecret(brainDir, key, value, {
      provider,
      scope: body.scope || 'global',
      repos: body.repos,
      subscription_tier: body.subscription_tier,
      monthly_cost_usd: body.monthly_cost_usd,
      monthly_cap_usd: body.monthly_cap_usd ?? catalog?.default_monthly_cap_usd,
      api_docs_url: body.api_docs_url || catalog?.docs_url,
      headscale_url: body.headscale_url,
      headscale_log_command: body.headscale_log_command,
      rotate_every_days: body.rotate_every_days,
      auto_rotate: body.auto_rotate,
      notes: body.notes,
      project_path: body.project_path,
      label: body.label,
      actor: 'dashboard',
    });
    const keys = await listSecretsMeta(brainDir);
    res.status(201).json(keys.find((k) => k.key === key));
  } catch (err) {
    if (err.message?.includes('Invalid')) return badRequest(res, err.message);
    serverError(res, err);
  }
});

router.patch('/api/secrets/:key', requireAuth, requireScope('keys:write', 'config:write'), async (req, res) => {
  try {
    const brainDir = brainDirFromReq(req);
    const row = await updateSecretMeta(brainDir, req.params.key, req.body || {}, {
      actor: 'dashboard',
    });
    if (!row) return notFound(res, `Secret not found: ${req.params.key}`);
    res.json(row);
  } catch (err) {
    if (err.message?.includes('not found')) return notFound(res, err.message);
    serverError(res, err);
  }
});

/**
 * Reveal full secret value — requires short-lived step_up_token from passkey
 * (or password re-entry). Never logged. Audit records key name only.
 */
router.post(
  '/api/secrets/:key/reveal',
  requireAuth,
  requireScope('keys:read', 'config:read'),
  async (req, res) => {
    try {
      const token =
        req.body?.step_up_token ||
        req.headers['x-tr-step-up'] ||
        req.headers['x-total-recall-step-up'];
      const check = verifyStepUpToken(token, 'secrets:reveal');
      if (!check.ok) {
        return res.status(403).json({
          error: check.error,
          code: 'step_up_required',
          hint: 'Complete passkey prompt or password step-up, then retry reveal.',
        });
      }

      const brainDir = brainDirFromReq(req);
      const key = req.params.key;
      const got = await getSecret(brainDir, key, {
        action: 'reveal',
        actor: `step-up:${check.payload?.actor || 'dashboard'}`,
      });
      if (!got.found) return notFound(res, `Secret not found: ${key}`);

      logger.info('secrets', 'Secret revealed (step-up)', {
        key,
        actor: check.payload?.actor || 'dashboard',
      });

      res.json({
        key,
        value: got.value,
        // client should display briefly; server does not store this response
        revealed_at: new Date().toISOString(),
        step_up_actor: check.payload?.actor || null,
      });
    } catch (err) {
      serverError(res, err);
    }
  },
);

router.post('/api/secrets/:key/rotate', requireAuth, requireScope('keys:write', 'config:write'), async (req, res) => {
  try {
    const body = req.body || {};
    const { value } = body;
    if (!value) return badRequest(res, 'value is required for rotate');
    const brainDir = brainDirFromReq(req);

    // Default: after rotate, re-project .env to bound repos / all projects when asked
    const wantExport =
      body.export_env === true ||
      body.exportEnv === true ||
      body.export_all === true ||
      body.exportAll === true;

    if (wantExport) {
      const { rotateSecretAndExport } = await import('../../core/secrets-rotate.mjs');
      const result = await rotateSecretAndExport(brainDir, req.params.key, value, {
        actor: 'dashboard',
        provider: body.provider,
        exportEnv: true,
        exportAllProjects: body.export_all === true || body.exportAll === true,
        exportCwd: false,
        includeGlobal: true,
      });
      // Never echo secret value
      const keys = await listSecretsMeta(brainDir);
      return res.json({
        key: result.key,
        rotated: true,
        next_rotate_due: result.next_rotate_due,
        secret: keys.find((k) => k.key === req.params.key),
        exports: (result.exports || []).map((e) => ({
          ok: e.ok !== false,
          envPath: e.envPath,
          count: e.count,
          name: e.name,
          error: e.error,
        })),
      });
    }

    const result = await rotateSecret(brainDir, req.params.key, value, {
      actor: 'dashboard',
      provider: body.provider,
    });
    const keys = await listSecretsMeta(brainDir);
    res.json({ ...result, secret: keys.find((k) => k.key === req.params.key) });
  } catch (err) {
    if (err.message?.includes('not found')) return notFound(res, err.message);
    serverError(res, err);
  }
});

router.delete('/api/secrets/:key', requireAuth, requireScope('keys:write', 'config:write'), async (req, res) => {
  try {
    const brainDir = brainDirFromReq(req);
    const r = await deleteSecret(brainDir, req.params.key, { actor: 'dashboard' });
    if (!r.found) return notFound(res, `Secret not found: ${req.params.key}`);
    res.json(r);
  } catch (err) {
    serverError(res, err);
  }
});

export { router as secretsRouter };
