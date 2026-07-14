import { Router } from 'express';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { requireAuth, requireScope } from '../auth.mjs';
import { serverError, ROOT, BRAIN_DIR, VAULT_DIR, SKILLS_DIR, INSTRUCTIONS, DERIVED_DIR, badRequest } from './_shared.mjs';
import { logger } from '../../core/logger.mjs';

const router = Router();

router.post('/api/field/compile', requireAuth, requireScope('memory:recompile'), async (req, res) => {
  try {
    const { compileField } = await import('../../core/vector-field.mjs');
    const result = await compileField({ vaultDir: VAULT_DIR, derivedDir: DERIVED_DIR });
    res.json({ compiled: true, ...result.meta });
  } catch (err) {
    serverError(res, err);
  }
});

router.post('/api/field/sample', requireAuth, requireScope('memory:read'), async (req, res) => {
  try {
    const { sampleField } = await import('../../core/vector-field.mjs');
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

router.get('/api/field/stats', requireAuth, requireScope('memory:read'), async (req, res) => {
  try {
    const { fieldStats } = await import('../../core/vector-field.mjs');
    res.json(fieldStats(DERIVED_DIR));
  } catch (err) {
    serverError(res, err);
  }
});

export default router;
