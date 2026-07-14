import { Router } from 'express';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { requireAuth, requireScope } from '../auth.mjs';
import { serverError, ROOT, BRAIN_DIR, VAULT_DIR, SKILLS_DIR, INSTRUCTIONS, FILES_DIR } from './_shared.mjs';
import { logger } from '../../core/logger.mjs';

const router = Router();

router.get('/api/files', requireAuth, requireScope('files:read'), (req, res) => {
  try {
    if (!fs.existsSync(FILES_DIR)) {
      fs.mkdirSync(FILES_DIR, { recursive: true });
    }
    const files = fs.readdirSync(FILES_DIR).map(file => {
      try {
        const stats = fs.statSync(path.join(FILES_DIR, file));
        return {
          name: file,
          size: stats.size,
          modified: stats.mtime,
          isDirectory: stats.isDirectory()
        };
      } catch (err) {
        return null;
      }
    }).filter(Boolean);
    res.json(files);
    
  } catch (err) { serverError(res, err); }
});

export default router;
