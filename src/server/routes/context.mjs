import { Router } from 'express';
import { requireAuth, requireScope } from '../auth.mjs';
import {
  serverError,
  badRequest,
  resolveVaultFromQuery,
  pathsForVault,
} from './_shared.mjs';

const router = Router();

router.post('/api/context', requireAuth, requireScope('memory:read'), async (req, res) => {
  try {
    const { compileContext } = await import('../../core/context-compiler.mjs');
    const { query, budget, momentum_slugs } = req.body || {};
    const vaultDir = resolveVaultFromQuery(req);
    const { derivedDir } = pathsForVault(vaultDir);
    const result = await compileContext({
      query: query || '',
      vaultDir,
      derivedDir,
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
    const vaultDir = resolveVaultFromQuery(req);
    const result = previewContext({ vaultDir });
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
    const vaultDir = resolveVaultFromQuery(req);
    const result = await streamParallelContext({
      query,
      vaultDir,
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
