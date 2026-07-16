/**
 * Config Routes
 *
 * GET  /api/config         — Sanitized runtime + security config
 * GET  /api/config-json    — Full config JSON (security, budget, brain, secrets)
 * POST /api/config-json    — Write config JSON fields
 * GET  /api/config/:name   — Read a named config file from CONFIG_DIR
 * PUT  /api/config/:name   — Write a named config file to CONFIG_DIR
 */

import { Router } from 'express';
import fs from 'node:fs';
import path from 'node:path';
import yaml from 'yaml';
import { requireAuth, requireScope, loadSecurityConfig } from '../auth.mjs';
import { BRAIN_DIR, CONFIG_DIR, AGENT_DIR, serverError, badRequest } from './_shared.mjs';
import { loadRuntimeConfig } from '../../core/runtime.mjs';

const router = Router();

/**
 * Validate a config file name and resolve it to an absolute path.
 * Allows alphanumeric, hyphens, underscores, and dots (for .yml etc.).
 * Rejects any path that contains `..`.
 *
 * @param {string} name
 * @returns {string|null} Absolute path or null if invalid
 */
function safeConfigName(name) {
  if (!/^[a-zA-Z0-9_.-]+$/.test(name) || name.includes('..')) {
    return null;
  }
  return path.join(CONFIG_DIR, name);
}

/**
 * GET /api/config
 * Returns sanitized config (no secrets, no tokens).
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
        const { default: yamlMod } = await import('yaml');
        runtime = yamlMod.parse(fs.readFileSync(runtimePath, 'utf8'));
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

/**
 * GET /api/config-json
 * Returns full config bundle: security, budget, brain, and allowed secrets keys.
 */
router.get('/api/config-json', requireAuth, requireScope('config:read'), (req, res) => {
  try {
    const securityPath = path.join(CONFIG_DIR, 'security.yml');
    const budgetPath   = path.join(CONFIG_DIR, 'budget.yml');
    const brainPath    = path.join(CONFIG_DIR, 'brain.json');
    const secretsPath  = path.join(AGENT_DIR, 'secrets.enc');

    let security = {};
    let budget   = {};
    let brain    = {};
    let secrets  = {};

    if (fs.existsSync(securityPath)) {
      try { security = yaml.parse(fs.readFileSync(securityPath, 'utf8')) || {}; } catch {}
    }
    if (fs.existsSync(budgetPath)) {
      try { budget = yaml.parse(fs.readFileSync(budgetPath, 'utf8')) || {}; } catch {}
    }
    if (fs.existsSync(brainPath)) {
      try { brain = JSON.parse(fs.readFileSync(brainPath, 'utf8')) || {}; } catch {}
    }
    if (fs.existsSync(secretsPath)) {
      try { secrets = JSON.parse(fs.readFileSync(secretsPath, 'utf8')) || {}; } catch {}
    }

    const safeBrain = { ...brain };
    if (safeBrain.token) {
      safeBrain.has_token = true;
      delete safeBrain.token;
    }

    const allowedKeys = ['google_api_key', 'anthropic_api_key', 'openai_api_key', 'openrouter_api_key', 'tavily_api_key', 'brave_api_key', 'exa_api_key', 'serper_api_key', 'github_token'];
    const safeSecrets = {};
    for (const key of allowedKeys) {
      if (secrets[key] !== undefined) {
        safeSecrets[key] = secrets[key];
      }
    }

    res.json({ security, budget, brain: safeBrain, secrets: safeSecrets });
  } catch (err) { serverError(res, err); }
});

/**
 * POST /api/config-json
 * Persist config fields: security (YAML), budget (YAML), brain (JSON), secrets (JSON).
 */
router.post('/api/config-json', requireAuth, requireScope('config:write'), async (req, res) => {
  try {
    const { security, budget, brain, secrets } = req.body;
    const securityPath = path.join(CONFIG_DIR, 'security.yml');
    const budgetPath   = path.join(CONFIG_DIR, 'budget.yml');
    const brainPath    = path.join(CONFIG_DIR, 'brain.json');
    const secretsPath  = path.join(AGENT_DIR, 'secrets.enc');

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
        try { existingBrain = JSON.parse(fs.readFileSync(brainPath, 'utf8')) || {}; } catch {}
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
        try { existingSecrets = JSON.parse(fs.readFileSync(secretsPath, 'utf8')) || {}; } catch {}
      }
      const allowedKeys = ['google_api_key', 'anthropic_api_key', 'openai_api_key', 'openrouter_api_key', 'tavily_api_key', 'brave_api_key', 'exa_api_key', 'serper_api_key', 'github_token'];
      for (const key of allowedKeys) {
        if (secrets[key] !== undefined) {
          if (secrets[key] === '') {
            delete existingSecrets[key];
          } else {
            existingSecrets[key] = secrets[key];
          }
        }
      }
      const { saveSecrets } = await import('../../core/secrets-store.mjs');
      await saveSecrets(AGENT_DIR, existingSecrets);
    }

    res.json({ success: true });
  } catch (err) { serverError(res, err); }
});

/**
 * GET /api/config/:name
 * Read a named config file from CONFIG_DIR.
 */
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

/**
 * PUT /api/config/:name
 * Write a named config file to CONFIG_DIR.
 */
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

export default router;
export { router as configRouter };
