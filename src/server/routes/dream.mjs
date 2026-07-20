import { Router } from 'express';
import path from 'node:path';
import { requireAuth, requireScope } from '../auth.mjs';
import { serverError, resolveVaultFromQuery, pathsForVault } from './_shared.mjs';

const router = Router();

router.post('/api/dream', requireAuth, requireScope('memory:recompile'), async (req, res) => {
  try {
    const { runDreamCycle } = await import('../../core/dream.mjs');
    const vaultDir = resolveVaultFromQuery(req);
    const paths = pathsForVault(vaultDir);
    const conflictsDir = path.join(paths.brainDir, 'memory-inbox', 'conflicts');

    const result = await runDreamCycle({
      vaultDir,
      skillsDir: paths.skillsDir,
      derivedDir: paths.derivedDir,
      conflictsDir,
      instructionsFile: paths.instructionsFile,
    });

    res.json({ success: true, status: result.status, vault_dir: vaultDir });
  } catch (err) {
    serverError(res, err);
  }
});

export default router;
