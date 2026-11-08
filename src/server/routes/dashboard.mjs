import { Router } from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { requireAuth, requireScope } from '../auth.mjs';
import { getNodes } from '../../core/vault-cache.mjs';
import { DrawerInputError, readDrawerConfig, writeDrawerConfig } from '../../core/workspace-drawers.mjs';
import {
  VAULT_DIR,
  BRAIN_DIR,
  INSTRUCTIONS,
  ROOT as SHARED_ROOT,
  resolveVaultFromQuery,
  pathsForVault,
} from './_shared.mjs';

const router = Router();
// Prefer shared ROOT (fileURLToPath-safe). Fall back with fileURLToPath — never URL.pathname
// (breaks on Windows and on paths with encoded characters).
const ROOT = process.env.TR_ROOT || SHARED_ROOT || path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');

router.get('/api/dashboard/drawers/:edge', requireAuth, requireScope('config:read'), (req, res) => {
  res.set('Cache-Control', 'no-store');
  try {
    return res.json(readDrawerConfig(BRAIN_DIR, req.params.edge));
  } catch (error) {
    if (error instanceof DrawerInputError) return res.status(400).json({ error: error.message });
    return res.status(500).json({ error: 'Could not read the saved drawer.' });
  }
});

router.put('/api/dashboard/drawers/:edge', requireAuth, requireScope('config:write'), async (req, res) => {
  res.set('Cache-Control', 'no-store');
  if (!req.is('application/json')) return res.status(415).json({ error: 'Use JSON to save the drawer.' });
  try {
    return res.json(await writeDrawerConfig(BRAIN_DIR, req.params.edge, req.body?.config, req.body?.version));
  } catch (error) {
    if (error instanceof DrawerInputError) return res.status(400).json({ error: error.message });
    if (error.message.startsWith('Plugin state version conflict')) {
      return res.status(409).json({ error: 'The drawer changed elsewhere. Reload it before saving.' });
    }
    return res.status(500).json({ error: 'Could not save the drawer.' });
  }
});

router.get('/api/dashboard/instructions', requireAuth, requireScope('instructions:read'), (req, res) => {
  const vaultDir = resolveVaultFromQuery(req);
  const paths = pathsForVault(vaultDir);
  // skillsDir = …/.agent/skills → agentDir = …/.agent; surfaces often at repo root (parent of .agent)
  const agentDir = path.dirname(paths.skillsDir);
  const surfaceBase =
    path.basename(agentDir) === '.agent' ? path.dirname(agentDir) : agentDir;

  const surfaces = [];
  const surfaceFiles = ['AGENTS.md', 'GEMINI.md', 'CLAUDE.md', 'INSTRUCTIONS.md'];

  for (const name of surfaceFiles) {
    // Prefer agent-adjacent surfaces; fall back to package ROOT for monorepo dashboard
    const candidates = [
      path.join(surfaceBase, name),
      path.join(agentDir, name),
      path.join(ROOT, name),
    ];
    let filePath = candidates.find((p) => fs.existsSync(p)) || candidates[0];

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
      active,
    });
  }

  const instructionsFile = paths.instructionsFile || INSTRUCTIONS;
  const lastCompileTimestamp = fs.existsSync(instructionsFile)
    ? fs.statSync(instructionsFile).mtime.toISOString()
    : '';
  const totalNodes = fs.existsSync(vaultDir) ? getNodes(vaultDir).length : 0;

  res.json({
    surfaces,
    lastCompileTimestamp,
    totalNodes,
    vault_dir: vaultDir,
  });
});

export default router;
