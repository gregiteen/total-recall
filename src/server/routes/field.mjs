import { Router } from 'express';
import { requireAuth, requireScope } from '../auth.mjs';
import { serverError, badRequest, resolveVaultFromQuery, pathsForVault } from './_shared.mjs';

const router = Router();

router.post('/api/field/compile', requireAuth, requireScope('memory:recompile'), async (req, res) => {
  try {
    const { compileField } = await import('../../core/vector-field.mjs');
    const vaultDir = resolveVaultFromQuery(req);
    const { derivedDir } = pathsForVault(vaultDir);
    const result = await compileField({ vaultDir, derivedDir });
    res.json({ compiled: true, vault_dir: vaultDir, ...result.meta });
  } catch (err) {
    serverError(res, err);
  }
});

router.post('/api/field/sample', requireAuth, requireScope('memory:read'), async (req, res) => {
  try {
    const { sampleField } = await import('../../core/vector-field.mjs');
    const { query, top_k, entanglement_boost, velocity_weight } = req.body || {};
    if (!query) return badRequest(res, 'query is required');
    const vaultDir = resolveVaultFromQuery(req);
    const { derivedDir } = pathsForVault(vaultDir);
    const result = await sampleField({
      query,
      topK: top_k,
      entanglementBoost: entanglement_boost,
      velocityWeight: velocity_weight,
      derivedDir,
    });
    res.json(result);
  } catch (err) {
    serverError(res, err);
  }
});

router.get('/api/field/stats', requireAuth, requireScope('memory:read'), async (req, res) => {
  try {
    const { fieldStats } = await import('../../core/vector-field.mjs');
    const vaultDir = resolveVaultFromQuery(req);
    const { derivedDir } = pathsForVault(vaultDir);
    res.json({ vault_dir: vaultDir, ...fieldStats(derivedDir) });
  } catch (err) {
    serverError(res, err);
  }
});

export default router;
