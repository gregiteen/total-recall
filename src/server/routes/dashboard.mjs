import { Router } from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { requireAuth, requireScope } from '../auth.mjs';
import { getNodes } from '../../core/vault-cache.mjs';
import { VAULT_DIR, INSTRUCTIONS, ROOT as SHARED_ROOT } from './_shared.mjs';

const router = Router();
// Prefer shared ROOT (fileURLToPath-safe). Fall back with fileURLToPath — never URL.pathname
// (breaks on Windows and on paths with encoded characters).
const ROOT = process.env.TR_ROOT || SHARED_ROOT || path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');

router.get('/api/dashboard/instructions', requireAuth, requireScope('instructions:read'), (req, res) => {
  const surfaces = [];
  const surfaceFiles = ['AGENTS.md', 'GEMINI.md', 'CLAUDE.md', 'INSTRUCTIONS.md'];
  
  for (const name of surfaceFiles) {
    let filePath;
    if (name === 'INSTRUCTIONS.md') {
      filePath = path.join(ROOT, name);
    } else {
      filePath = path.join(ROOT, name);
    }
    
    let size = 0;
    let lastCompiled = '';
    let active = false;
    
    if (fs.existsSync(filePath)) {
      const stat = fs.statSync(filePath);
      size = stat.size;
      lastCompiled = stat.mtime.toISOString();
      active = true;
    }
    
    surfaces.push({
      name,
      filename: name,
      size,
      lastCompiled,
      active
    });
  }
  
  const lastCompileTimestamp = fs.existsSync(INSTRUCTIONS) ? fs.statSync(INSTRUCTIONS).mtime.toISOString() : '';
  const totalNodes = fs.existsSync(VAULT_DIR) ? getNodes(VAULT_DIR).length : 0;
  
  res.json({
    surfaces,
    lastCompileTimestamp,
    totalNodes
  });
});

export default router;
