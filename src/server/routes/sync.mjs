import { Router } from 'express';
import { runSync } from '../../core/portfolio-sync.mjs';
import config from '../../core/config.mjs';
import { requireAuth } from '../auth.mjs';

const router = Router();

router.post('/api/sync/portfolio/proposals/:id/decision', requireAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const { action, notes } = req.body;
    
    const token = process.env[config.portfolioSync.tokenRef];
    if (!token) {
      return res.status(500).json({ error: 'Missing sync token' });
    }

    const baseUrl = config.portfolioSync.baseUrl.replace(/\/+$/, '');
    
    // Server-side fetch to droplet
    const dropletRes = await fetch(`${baseUrl}/api/admin/proposals/${id}/decision`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({ action, notes })
    });

    if (!dropletRes.ok) {
      const err = await dropletRes.text();
      return res.status(dropletRes.status).json({ error: `Droplet rejected decision: ${err}` });
    }

    const data = await dropletRes.json();

    // Trigger sync to pull updated state
    await runSync();

    res.json({ success: true, droplet_response: data });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
