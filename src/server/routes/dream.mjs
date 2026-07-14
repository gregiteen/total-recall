import { Router } from 'express';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { requireAuth, requireScope } from '../auth.mjs';
import { serverError, ROOT, BRAIN_DIR, VAULT_DIR, SKILLS_DIR, INSTRUCTIONS, DERIVED_DIR } from './_shared.mjs';
import { logger } from '../../core/logger.mjs';

const router = Router();

router.post('/api/dream', requireAuth, requireScope('memory:recompile'), async (req, res) => {
  try {
    const { runDreamCycle } = await import('../../core/dream.mjs');
    const conflictsDir = path.join(BRAIN_DIR, 'memory-inbox', 'conflicts');
    
    const result = await runDreamCycle({
      vaultDir: VAULT_DIR,
      skillsDir: SKILLS_DIR,
      derivedDir: DERIVED_DIR,
      conflictsDir,
      instructionsFile: INSTRUCTIONS,
    });

    res.json({ success: true, status: result.status });
  } catch (err) {
    serverError(res, err);
  }
});

export default router;
