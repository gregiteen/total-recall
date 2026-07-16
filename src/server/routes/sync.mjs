import { Router } from 'express';
import { runSync } from '../../core/remote-vault-sync.mjs';
import config from '../../core/config.mjs';
import { requireAuth } from '../auth.mjs';
import { throttledFetch } from '../../core/throttled-fetch.mjs';

const router = Router();

/** Generic remote-vault proposal decision proxy (optional feature). */
router.post('/api/sync/remote-vault/proposals/:id/decision', requireAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const { action, notes } = req.body;

    const token = process.env[config.remoteVaultSync.tokenRef];
    if (!token) {
      return res.status(500).json({ error: 'Missing remote vault sync token' });
    }

    if (!config.remoteVaultSync.baseUrl) {
      return res.status(500).json({ error: 'TR_REMOTE_VAULT_URL not configured' });
    }

    const baseUrl = config.remoteVaultSync.baseUrl.replace(/\/+$/, '');

    const remoteRes = await throttledFetch(`${baseUrl}/api/admin/proposals/${id}/decision`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ action, notes }),
    });

    if (!remoteRes.ok) {
      const err = await remoteRes.text();
      return res.status(remoteRes.status).json({ error: `Remote rejected decision: ${err}` });
    }

    const data = await remoteRes.json();
    await runSync();

    res.json({ success: true, remote_response: data });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
