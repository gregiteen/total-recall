import express from 'express';
import { requireAuth, requireScope } from '../auth.mjs';
import { BRAIN_DIR } from './_shared.mjs';
import { logger } from '../../core/logger.mjs';
import {
  headscaleFetch,
  headscaleFetchWithLegacyFallback,
} from '../../core/headscale-client.mjs';

const router = express.Router();

router.use('/api/headscale', requireAuth);

router.get('/api/headscale/node', requireScope('config:read'), async (req, res) => {
  try {
    const data = await headscaleFetchWithLegacyFallback('/api/v1/node', '/api/v1/machine', {}, BRAIN_DIR);
    res.json(data);
  } catch (err) {
    logger.error('headscale', `GET /node failed: ${err.message}`);
    res.status(500).json({ error: err.message });
  }
});

router.delete('/api/headscale/node/:id', requireScope('config:write'), async (req, res) => {
  try {
    if (!/^\d+$/.test(req.params.id)) return res.status(400).json({ error: 'Invalid node id' });
    const data = await headscaleFetchWithLegacyFallback(
      `/api/v1/node/${req.params.id}`,
      `/api/v1/machine/${req.params.id}`,
      { method: 'DELETE' },
      BRAIN_DIR,
    );
    res.json(data);
  } catch (err) {
    logger.error('headscale', `DELETE /node/${req.params.id} failed: ${err.message}`);
    res.status(500).json({ error: err.message });
  }
});

router.get('/api/headscale/preauthkey', requireScope('config:read'), async (req, res) => {
  try {
    const user = req.query.user ? String(req.query.user) : '';
    const data = await headscaleFetch(
      `/api/v1/preauthkey${user ? `?user=${encodeURIComponent(user)}` : ''}`,
      {},
      BRAIN_DIR,
    );
    res.json(data);
  } catch (err) {
    logger.error('headscale', `GET /preauthkey failed: ${err.message}`);
    res.status(500).json({ error: err.message });
  }
});

router.post('/api/headscale/preauthkey', requireScope('config:write'), async (req, res) => {
  try {
    const data = await headscaleFetch(
      '/api/v1/preauthkey',
      {
        method: 'POST',
        body: JSON.stringify(req.body),
      },
      BRAIN_DIR,
    );
    res.json(data);
  } catch (err) {
    logger.error('headscale', `POST /preauthkey failed: ${err.message}`);
    res.status(500).json({ error: err.message });
  }
});

router.get('/api/headscale/user', requireScope('config:read'), async (req, res) => {
  try {
    const data = await headscaleFetch('/api/v1/user', {}, BRAIN_DIR);
    res.json(data);
  } catch (err) {
    logger.error('headscale', `GET /user failed: ${err.message}`);
    res.status(500).json({ error: err.message });
  }
});

export default router;
