import { Router } from 'express';
import path from 'node:path';
import { requireAuth, requireScope } from '../auth.mjs';
import {
  serverError,
  ROOT,
  VAULT_DIR,
  badRequest,
  resolveVaultFromQuery,
} from './_shared.mjs';
import { detectRuleFiles, importRuleFiles } from '../../core/import-rules.mjs';

const router = Router();

router.get('/api/import/rules', requireAuth, requireScope('memory:read'), (req, res) => {
  try {
    const vaultDir = resolveVaultFromQuery(req);
    const allowedRoots = [ROOT, VAULT_DIR, vaultDir, path.dirname(ROOT)];
    const rawDirs = req.query.dir ? (Array.isArray(req.query.dir) ? req.query.dir : [req.query.dir]) : [ROOT];
    const dirs = rawDirs.filter(d =>
      allowedRoots.some(root => path.resolve(d).startsWith(path.resolve(root))),
    );
    if (dirs.length === 0) return badRequest(res, 'No permitted directories specified');
    const detected = detectRuleFiles(dirs);
    res.json({ dirs, detected, vault_dir: vaultDir });
  } catch (err) {
    serverError(res, err);
  }
});

router.post('/api/import/rules', requireAuth, requireScope('memory:write'), async (req, res) => {
  try {
    const { dirs, force = false, dryRun = false } = req.body || {};
    const vaultDir = resolveVaultFromQuery(req);
    const searchDirs = dirs?.length ? dirs : [ROOT];
    const detected = detectRuleFiles(searchDirs);
    const toImport = req.body?.files?.length
      ? detected.filter(f => req.body.files.includes(f.absolutePath))
      : detected.filter(f => !f.alreadyImported || force);
    if (dryRun) {
      return res.json({
        dryRun: true,
        detected,
        toImport,
        imported: [],
        skipped: [],
        failed: [],
        vault_dir: vaultDir,
      });
    }
    const result = await importRuleFiles(toImport, { force, vaultDir });
    res.json({ detected, vault_dir: vaultDir, ...result });
  } catch (err) {
    serverError(res, err);
  }
});

export default router;
