import { Router } from 'express';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { requireAuth, requireScope } from '../auth.mjs';
import { serverError, ROOT, BRAIN_DIR, VAULT_DIR, SKILLS_DIR, INSTRUCTIONS, DERIVED_DIR, badRequest } from './_shared.mjs';
import { logger } from '../../core/logger.mjs';

const router = Router();

router.post('/api/context', requireAuth, requireScope('memory:read'), async (req, res) => {
  try {
    const { compileContext } = await import('../../core/context-compiler.mjs');
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

router.get('/api/context/preview', requireAuth, requireScope('memory:read'), async (req, res) => {
  try {
    const { previewContext } = await import('../../core/context-compiler.mjs');
    const result = previewContext({ vaultDir: VAULT_DIR });
    res.json(result);
  } catch (err) {
    serverError(res, err);
  }
});

router.post('/api/context/stream', requireAuth, requireScope('memory:read'), async (req, res) => {
  try {
    const { streamParallelContext } = await import('../../core/parallel-context.mjs');
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

router.get('/api/context/flash/health', requireAuth, requireScope('memory:read'), async (req, res) => {
  try {
    const { checkFlashHealth } = await import('../../core/parallel-context.mjs');
    const result = await checkFlashHealth();
    res.json(result);
  } catch (err) {
    serverError(res, err);
  }
});

export default router;
