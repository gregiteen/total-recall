import { Router } from 'express';
import { requireAuth, requireScope } from '../auth.mjs';
import path from 'node:path';
import { getNodes } from '../../core/vault-cache.mjs';
import { mergeGlobalRuleNodes, legacyRuleContributions } from '../../core/surface.mjs';
import { brainDir as globalBrainDir } from '../../core/config.mjs';
import { surfaceInputsHash } from '../../core/command-surface.mjs';
import {
  serverError,
  badRequest,
  resolveVaultFromQuery,
  pathsForVault,
} from './_shared.mjs';

const router = Router();

router.post('/api/context', requireAuth, requireScope('memory:read'), async (req, res) => {
  try {
    const { compileContext, capsuleResponse } = await import('../../core/context-compiler.mjs');
    const { query, budget, momentum_slugs, actions, include_knowledge, debug } = req.body || {};
    if (include_knowledge !== undefined && typeof include_knowledge !== 'boolean') return badRequest(res, 'include_knowledge must be boolean');
    if (debug !== undefined && typeof debug !== 'boolean') return badRequest(res, 'debug must be boolean');
    if (actions !== undefined && (!Array.isArray(actions) || actions.some(action => typeof action !== 'string'))) return badRequest(res, 'actions must be an array of strings');
    const vaultDir = resolveVaultFromQuery(req, { strict: true });
    const { derivedDir, skillsDir } = pathsForVault(vaultDir);
    const globalVault = path.join(globalBrainDir, 'memory-vault');
    const nodes = path.resolve(vaultDir) === path.resolve(globalVault) ? getNodes(vaultDir).map(n => ({ ...n, _layer: 'global' })) :
      mergeGlobalRuleNodes(getNodes(vaultDir), getNodes(globalVault));
    const result = await compileContext({
      query: query || '',
      vaultDir,
      derivedDir,
      budget: budget || {},
      consumer: 'api',
      momentumSlugs: momentum_slugs || [],
      actions: actions || [],
      includeKnowledge: include_knowledge === true,
      nodes,
      projectRoot: path.dirname(path.dirname(skillsDir)),
      contributions: legacyRuleContributions(skillsDir),
      versionInputs: surfaceInputsHash({ skillsDir }),
    });
    res.json(capsuleResponse(result, { total: budget?.total ?? 4000, debug: debug === true }));
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
