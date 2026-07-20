import { Router } from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { requireAuth, requireScope } from '../auth.mjs';
import {
  serverError,
  INSTRUCTIONS,
  ROOT,
  resolveVaultFromQuery,
  pathsForVault,
} from './_shared.mjs';
import { logger } from '../../core/logger.mjs';

const router = Router();

function resolveInstructionsPath(req) {
  const vaultDir = resolveVaultFromQuery(req);
  const paths = pathsForVault(vaultDir);
  // Prefer brain-local INSTRUCTIONS, then shared constant, then package ROOT
  const candidates = [
    paths.instructionsFile,
    // surface compile often writes to parent of .agent (repo root)
    path.join(path.dirname(path.dirname(paths.skillsDir)), 'INSTRUCTIONS.md'),
    INSTRUCTIONS,
    path.join(ROOT, 'INSTRUCTIONS.md'),
  ];
  for (const p of candidates) {
    if (p && fs.existsSync(p)) return p;
  }
  return paths.instructionsFile || INSTRUCTIONS;
}

function sendTextResource(res, filePath, label) {
  try {
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: `${label} not found`, path: filePath });
    }
    const content = fs.readFileSync(filePath, 'utf8');
    res.type('text/markdown').send(content);
  } catch (err) {
    serverError(res, err);
  }
}

router.get('/api/instructions', requireAuth, requireScope('instructions:read'), (req, res) => {
  return sendTextResource(res, resolveInstructionsPath(req), 'instructions');
});

router.put('/api/instructions', requireAuth, requireScope('instructions:write'), (req, res) => {
  const { content } = req.body;
  if (typeof content !== 'string') {
    return res.status(400).json({ error: 'Missing or invalid `content` field.' });
  }
  try {
    const target = resolveInstructionsPath(req);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, content, 'utf8');
    return res.json({ success: true, message: 'Instructions updated successfully', path: target });
  } catch (err) {
    logger.error('api', `Failed to write instructions: ${err.message}`);
    return res.status(500).json({ error: err.message });
  }
});

export default router;
