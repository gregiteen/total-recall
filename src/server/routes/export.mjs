import { Router } from 'express';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawn } from 'node:child_process';
import { requireAuth, requireScope } from '../auth.mjs';
import { serverError, ROOT, BRAIN_DIR, VAULT_DIR, SKILLS_DIR, INSTRUCTIONS, DERIVED_DIR, SESSIONS_DIR } from './_shared.mjs';
import { logger } from '../../core/logger.mjs';

const router = Router();

router.get('/api/brain/export', requireAuth, requireScope('brain:export'), async (req, res) => {
  try {
    const ALL_PARTS = {
      vault:    VAULT_DIR,
      derived:  DERIVED_DIR,
      sessions: SESSIONS_DIR,
      config:   path.join(BRAIN_DIR, 'config'),
      skills:   SKILLS_DIR,
    };
    const requested = req.query.include
      ? String(req.query.include).split(',').map(s => s.trim())
      : Object.keys(ALL_PARTS);
    const dirs = requested.filter(k => ALL_PARTS[k] && fs.existsSync(ALL_PARTS[k]));
    if (dirs.length === 0) return res.status(404).json({ error: 'No brain data found to export.' });

    const date = new Date().toISOString().slice(0, 10);
    res.setHeader('Content-Type', 'application/gzip');
    res.setHeader('Content-Disposition', `attachment; filename="total-recall-brain-${date}.tar.gz"`);

    const relativeDirs = dirs.map(k => path.relative(BRAIN_DIR, ALL_PARTS[k]));
    const tar = spawn('tar', ['czf', '-', '-C', BRAIN_DIR, '--exclude=security.yml', '--exclude=keys.jsonl', '--exclude=session-secret', ...relativeDirs], { stdio: ['ignore', 'pipe', 'ignore'] });
    tar.stdout.pipe(res);
    tar.on('error', err => { if (!res.headersSent) serverError(res, err); });
    tar.on('close', code => { if (code !== 0 && !res.writableEnded) res.end(); });
    
  } catch (err) { serverError(res, err); }
});

export default router;
