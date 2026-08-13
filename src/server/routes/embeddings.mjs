/**
 * Embedding provider status and model selection.
 *
 * The vault's vector width is a storage constraint, so the model list is
 * reported with compatibility already resolved — the UI shows why a model is
 * unusable rather than hiding it.
 */

import express from 'express';
import { requireAuth, requireScope } from '../auth.mjs';
import { logger } from '../../core/logger.mjs';
import { EMBEDDING_DIMS } from '../../core/embeddings.mjs';
import {
  getOllamaProviderStatus,
  resolveOllamaEndpoint,
  selectEmbeddingModel,
  resetOllamaDiscovery,
} from '../../core/ollama-embeddings.mjs';

const router = express.Router();

router.use('/api/embeddings', requireAuth);

/** Which provider would serve the next embedding, and what else is available. */
router.get('/api/embeddings/provider', requireScope('config:read'), async (req, res) => {
  try {
    const status = await getOllamaProviderStatus({
      dims: EMBEDDING_DIMS,
      preferred: process.env.TR_OLLAMA_EMBED_MODEL || null,
    });

    // The hosted chain is the fallback; report which links are even configured
    // so an operator can tell "local is down" from "everything is down".
    const fallbacks = [
      { provider: 'openrouter', configured: Boolean(process.env.OPENROUTER_API_KEY) },
      { provider: 'google', configured: Boolean(process.env.GOOGLE_API_KEY || process.env.GEMINI_API_KEY) },
      { provider: 'openai', configured: Boolean(process.env.OPENAI_API_KEY) },
    ];

    res.json({ dims: EMBEDDING_DIMS, local: status, fallbacks });
  } catch (err) {
    logger.error('embeddings', `GET /provider failed: ${err.message}`);
    res.status(500).json({ error: err.message });
  }
});

/**
 * Pin a model for this process, or clear the pin to return to auto-selection.
 * The pin is validated before it is accepted — a model that cannot embed at the
 * vault width is rejected here rather than failing every later recall.
 */
router.post('/api/embeddings/model', requireScope('config:write'), async (req, res) => {
  try {
    const requested = req.body?.model;

    if (requested === null || requested === '') {
      delete process.env.TR_OLLAMA_EMBED_MODEL;
      resetOllamaDiscovery();
      const status = await getOllamaProviderStatus({ dims: EMBEDDING_DIMS });
      return res.json({ ok: true, pinned: null, selected: status.selected });
    }

    if (typeof requested !== 'string') {
      return res.status(400).json({ error: 'model must be a string, or null to clear the pin' });
    }

    const endpoint = await resolveOllamaEndpoint();
    if (!endpoint) return res.status(503).json({ error: 'No Ollama endpoint reachable' });

    resetOllamaDiscovery();
    const resolved = await selectEmbeddingModel(endpoint, {
      dims: EMBEDDING_DIMS,
      preferred: requested,
      force: true,
    });

    // selectEmbeddingModel falls through to auto-selection on a bad pin, so an
    // exact-match check is what distinguishes "accepted" from "silently ignored".
    const matched = resolved === requested || resolved?.split(':')[0] === requested;
    if (!matched) {
      return res.status(400).json({
        error: `${requested} cannot embed at ${EMBEDDING_DIMS} dims on ${endpoint}`,
        would_select: resolved,
      });
    }

    process.env.TR_OLLAMA_EMBED_MODEL = requested;
    resetOllamaDiscovery();
    res.json({ ok: true, pinned: requested, selected: resolved });
  } catch (err) {
    logger.error('embeddings', `POST /model failed: ${err.message}`);
    res.status(500).json({ error: err.message });
  }
});

/** Force re-discovery after a node comes up or a model is pulled. */
router.post('/api/embeddings/rediscover', requireScope('config:write'), async (req, res) => {
  try {
    resetOllamaDiscovery();
    const status = await getOllamaProviderStatus({
      dims: EMBEDDING_DIMS,
      preferred: process.env.TR_OLLAMA_EMBED_MODEL || null,
    });
    res.json({ ok: true, local: status });
  } catch (err) {
    logger.error('embeddings', `POST /rediscover failed: ${err.message}`);
    res.status(500).json({ error: err.message });
  }
});

export default router;
