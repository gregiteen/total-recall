import { Router } from 'express';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { requireAuth, requireScope } from '../auth.mjs';
import { serverError, ROOT, BRAIN_DIR, VAULT_DIR, SKILLS_DIR, INSTRUCTIONS, badRequest } from './_shared.mjs';
import { logger } from '../../core/logger.mjs';
import { detectRuleFiles, importRuleFiles } from '../../core/import-rules.mjs';

const router = Router();

router.get('/api/import/rules', requireAuth, requireScope('memory:read'), (req, res) => {
  try {
    const allowedRoots = [ROOT, VAULT_DIR];
    const rawDirs = req.query.dir ? (Array.isArray(req.query.dir) ? req.query.dir : [req.query.dir]) : allowedRoots;
    const dirs = rawDirs.filter(d => allowedRoots.some(root => path.resolve(d).startsWith(path.resolve(root))));
    if (dirs.length === 0) return badRequest(res, 'No permitted directories specified');
    const detected = detectRuleFiles(dirs);
    res.json({ dirs, detected });
    
  } catch (err) { serverError(res, err); }
});

router.post('/api/import/rules', requireAuth, requireScope('memory:write'), async (req, res) => {
  try {
    const { dirs, force = false, dryRun = false } = req.body || {};
    const searchDirs = dirs?.length ? dirs : [ROOT, VAULT_DIR];
    const detected = detectRuleFiles(searchDirs);
    const toImport = req.body?.files?.length
      ? detected.filter(f => req.body.files.includes(f.absolutePath))
      : detected.filter(f => !f.alreadyImported || force);
    if (dryRun) return res.json({ dryRun: true, detected, toImport, imported: [], skipped: [], failed: [] });
    const result = await importRuleFiles(toImport, { force, vaultDir: VAULT_DIR });
    res.json({ detected, ...result });
    
  } catch (err) { serverError(res, err); }
});

export default router;
