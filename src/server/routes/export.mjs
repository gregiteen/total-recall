import { Router } from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { requireAuth, requireScope } from '../auth.mjs';
import {
  serverError,
  resolveVaultFromQuery,
  pathsForVault,
} from './_shared.mjs';

const router = Router();

router.get('/api/brain/export', requireAuth, requireScope('brain:export'), async (req, res) => {
  try {
    const vaultDir = resolveVaultFromQuery(req);
    const paths = pathsForVault(vaultDir);
    const brainDir = paths.brainDir;

    const ALL_PARTS = {
      vault:    vaultDir,
      derived:  paths.derivedDir,
      sessions: paths.sessionsDir,
      config:   path.join(brainDir, 'config'),
      skills:   paths.skillsDir,
    };
    const requested = req.query.include
      ? String(req.query.include).split(',').map(s => s.trim())
      : Object.keys(ALL_PARTS);
    const dirs = requested.filter(k => ALL_PARTS[k] && fs.existsSync(ALL_PARTS[k]));
    if (dirs.length === 0) return res.status(404).json({ error: 'No brain data found to export.' });

    const date = new Date().toISOString().slice(0, 10);
    res.setHeader('Content-Type', 'application/gzip');
    res.setHeader('Content-Disposition', `attachment; filename="total-recall-brain-${date}.tar.gz"`);
    res.setHeader('X-Total-Recall-Vault', vaultDir);

    // Only pack paths under brainDir (avoid `..` parent escapes for skills)
    const relativeDirs = [];
    for (const k of dirs) {
      const abs = ALL_PARTS[k];
      const rel = path.relative(brainDir, abs);
      if (rel.startsWith('..') || path.isAbsolute(rel)) {
        // skills lives as sibling of total-recall under .agent/skills — skip unsafe parent
        if (k === 'skills') continue;
        continue;
      }
      relativeDirs.push(rel || '.');
    }
    if (relativeDirs.length === 0) {
      // Always can pack vault at least
      relativeDirs.push(path.relative(brainDir, vaultDir) || 'memory-vault');
    }

    const tar = spawn('tar', [
      'czf', '-',
      '-C', brainDir,
      '--exclude=security.yml',
      '--exclude=keys.jsonl',
      '--exclude=session-secret',
      ...relativeDirs,
    ], { stdio: ['ignore', 'pipe', 'ignore'] });
    tar.stdout.pipe(res);
    tar.on('error', err => { if (!res.headersSent) serverError(res, err); });
    tar.on('close', code => { if (code !== 0 && !res.writableEnded) res.end(); });
  } catch (err) {
    serverError(res, err);
  }
});

export default router;
