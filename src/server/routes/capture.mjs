import { Router } from 'express';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { requireAuth, requireScope } from '../auth.mjs';
import { serverError, ROOT, BRAIN_DIR, VAULT_DIR, SKILLS_DIR, INSTRUCTIONS } from './_shared.mjs';
import { logger } from '../../core/logger.mjs';

const router = Router();

router.post('/api/capture/:source', requireAuth, requireScope('memory:write'), async (req, res) => {
  if (!req.body || (req.body.text === undefined && !req.body.content && !req.body.text_content)) {
    return res.status(400).json({ error: 'Missing text content' });
  }
  try {
    const { captureMessage } = await import('../../core/quick-capture.mjs');
    const body = req.body || {};
    // Normalise Slack and Discord payload shapes
    const normalizedText = body.text || body.content || body.text_content;
    const author = body.user_name || body.author?.username || body.user?.name || 'system';
    
    const result = await captureMessage(normalizedText, {
      source: 'webhook',
      actor: author,
      raw: body
    });
    return res.json({ success: true, ...result });
  } catch (err) {
    return serverError(res, err);
  }
});

export default router;
