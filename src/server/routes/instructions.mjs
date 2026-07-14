import { Router } from 'express';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { requireAuth, requireScope } from '../auth.mjs';
import { serverError, ROOT, BRAIN_DIR, VAULT_DIR, SKILLS_DIR, INSTRUCTIONS } from './_shared.mjs';
import { logger } from '../../core/logger.mjs';

const router = Router();

router.get('/api/instructions', requireAuth, requireScope('instructions:read'), (req, res) => {
  return sendTextResource(res, path.join(ROOT, 'INSTRUCTIONS.md'), 'instructions');
});

router.put('/api/instructions', requireAuth, requireScope('instructions:write'), (req, res) => {
  const { content } = req.body;
  if (typeof content !== 'string') {
    return res.status(400).json({ error: 'Missing or invalid `content` field.' });
  }
  try {
    fs.writeFileSync(INSTRUCTIONS, content, 'utf8');
    return res.json({ success: true, message: 'Instructions updated successfully' });
  } catch (err) {
    logger.error('api', `Failed to write instructions: ${err.message}`);
    return res.status(500).json({ error: err.message });
  }
});

export default router;
