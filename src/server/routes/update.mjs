import { Router } from 'express';
import { requireAuth } from '../auth.mjs';
import { spawn } from 'node:child_process';
import { ROOT, serverError } from './_shared.mjs';

const router = Router();

router.get('/api/update/check', requireAuth, async (req, res) => {
  try {
    const pkg = await import('../../../package.json', { with: { type: 'json' } });
    const current = pkg.default.version;
    const proc = spawn('npm', ['view', 'total-recall-brain', 'version'], { stdio: ['ignore', 'pipe', 'ignore'] });
    let latest = '';
    proc.stdout.on('data', d => latest += d.toString());
    proc.on('close', () => {
      latest = latest.trim();
      res.json({
        current,
        latest,
        update_available: current !== latest && latest.length > 0
      });
    });
  } catch (err) {
    serverError(res, err);
  }
});

router.post('/api/update/run', requireAuth, async (req, res) => {
  try {
    const proc = spawn('npm', ['install', 'total-recall-brain@latest', '--no-save'], {
      cwd: ROOT,
      detached: true,
      stdio: 'ignore'
    });
    proc.unref();
    res.json({ updating: true, message: 'Update started in background. Daemon will restart automatically.' });
  } catch (err) {
    serverError(res, err);
  }
});

export default router;
