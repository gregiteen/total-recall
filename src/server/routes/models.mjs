/**
 * Models routes — OpenAI-compatible and provider-specific model list endpoints.
 *
 * GET /v1/models             - OpenAI-compatible model list (catalog + runtime config)
 * GET /api/gemini-models     - Gemini models (CLI discovery → Google API → fallback)
 * GET /api/claude-models     - Anthropic models (dynamic from API)
 * GET /api/openai-models     - OpenAI models (dynamic from API)
 * GET /api/openrouter-models - OpenRouter model catalog
 *
 * Extracted from rest.mjs as part of the per-resource router refactor.
 */

import { Router } from 'express';
import fs from 'node:fs';
import path from 'node:path';
import matter from 'gray-matter';
import { spawnSync } from 'node:child_process';
import { requireAuth, requireAuthOrLocal } from '../auth.mjs';
import { loadRuntimeConfig } from '../../core/runtime.mjs';
import {
  AGENT_DIR,
  ROOT,
  MODEL_CATALOG_DIR,
  CONFIG_DIR,
  serverError,
} from './_shared.mjs';

const router = Router();

// ─── Helpers ───────────────────────────────────────────────────────────────────

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

/** Fetch OpenRouter pricing map (cached 1 hour). */
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

// ─── Routes ────────────────────────────────────────────────────────────────────

/**
 * GET /v1/models
 * OpenAI-compatible model list — reads from MODEL.md catalog files + runtime config.
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

/**
 * GET /api/gemini-models
 * Dynamically fetches available Gemini models.
 * Strategy: CLI discovery → Google API → static fallback list.
 */
router.get('/api/gemini-models', requireAuth, async (req, res) => {
  try {
    // 1. Try antigravity CLI
    try {
      const { findBinaryInPath } = await import('../../core/runtime.mjs');
      const antigravityPath = findBinaryInPath('antigravity');
      if (antigravityPath) {
        const result = spawnSync(antigravityPath, ['--help'], { encoding: 'utf8', timeout: 3000 });
        if (result.status === 0 && result.stdout) {
          const output = result.stdout;
          const discovered = [];

          const modelRegex = /gemini-\d+\.\d+(?:-\w+)?/g;
          const matches = output.match(modelRegex) || [];
          for (const m of matches) {
            discovered.push(m);
          }

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

    // 2. Try Google API key
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

    const fallbackModels = [
      { id: 'gemini-3.5-flash', displayName: 'Gemini 3.5 Flash', pricing: null },
      { id: 'gemini-3.5-pro', displayName: 'Gemini 3.5 Pro', pricing: null },
      { id: 'gemini-2.5-pro', displayName: 'Gemini 2.5 Pro', pricing: null },
      { id: 'gemini-2.5-flash', displayName: 'Gemini 2.5 Flash', pricing: null }
    ];

    if (!apiKey) return res.json({ models: fallbackModels, source: 'missing_key' });

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
            const parts = id.split('-');
            const displayName = parts.map(p => p.charAt(0).toUpperCase() + p.slice(1)).join(' ');
            const pricing = pricingMap[`google/${id}`] || pricingMap[id] || null;
            return { id, displayName, pricing };
          });
        if (models.length > 0) {
          return res.json({ models, source: 'dynamic' });
        }
      }
    } catch {}

    res.json({ models: fallbackModels, source: 'api_error' });
  } catch (err) {
    serverError(res, err);
  }
});

/**
 * GET /api/claude-models
 * Dynamically fetches available Anthropic models using ANTHROPIC_API_KEY.
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
 * Dynamically fetches available OpenAI models using OPENAI_API_KEY.
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

/**
 * GET /api/openrouter-models
 * Dynamically fetches the list of available OpenRouter models.
 */
router.get('/api/openrouter-models', requireAuth, async (req, res) => {
  try {
    const response = await fetch('https://openrouter.ai/api/v1/models');
    if (response.ok) {
      const data = await response.json();
      const models = data.data.map(m => ({
        id: m.id,
        displayName: m.name,
        pricing: m.pricing,
        created: m.created || 0
      }));
      // Sort by provider (alphabetical), then by created (descending)
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
    console.error('API ERROR:', err);
    res.status(500).json({ error: err.message });
  }
});

export default router;
