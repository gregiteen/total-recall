import { Router } from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { requireAuth, requireScope } from '../auth.mjs';
import { getNodes } from '../../core/vault-cache.mjs';
import { DrawerInputError, readDrawerConfig, readDrawerHistory, restoreDrawerConfig, writeDrawerConfig } from '../../core/workspace-drawers.mjs';
import { resolvePluginBrainTargets } from '../plugin-brain-targets.mjs';
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

// Drawer layouts are private per brain: a missing or ambiguous selection never
// falls back to the global brain, because that would silently write its chrome.
function drawerBrain(value, auth) {
  if (typeof value !== 'string' || !value) throw new DrawerInputError('Select one brain for the drawer.');
  return resolvePluginBrainTargets([value], auth)[0];
}

function drawerError(res, error) {
  if (error instanceof DrawerInputError) return res.status(400).json({ error: error.message });
  if ([400, 403, 404, 409, 503].includes(error.status)) return res.status(error.status).json({ error: error.message });
  if (error.message.startsWith('Plugin state version conflict')) {
    return res.status(409).json({ error: 'The drawer changed elsewhere. Reload it before saving or restoring.' });
  }
  return res.status(500).json({ error: 'Could not access the saved drawer.' });
}

for (const history of [false, true]) {
  router.get('/api/dashboard/drawers/:edge' + (history ? '/history' : ''), requireAuth, requireScope('config:read'), (req, res) => {
    res.set('Cache-Control', 'private, no-store');
    try {
      const { brainDir } = drawerBrain(req.query.brain, req.auth);
      return res.json((history ? readDrawerHistory : readDrawerConfig)(brainDir, req.params.edge));
    } catch (error) { return drawerError(res, error); }
  });
}

router.put('/api/dashboard/drawers/:edge', requireAuth, requireScope('config:write'), async (req, res) => {
  res.set('Cache-Control', 'private, no-store');
  if (!req.is('application/json')) return res.status(415).json({ error: 'Use JSON to save the drawer.' });
  try {
    const { brainDir } = drawerBrain(req.body?.brainId, req.auth);
    if (Object.keys(req.body ?? {}).some(key => !['brainId', 'config', 'version'].includes(key))) throw new DrawerInputError('Invalid drawer save request.');
    return res.json(await writeDrawerConfig(brainDir, req.params.edge, req.body?.config, req.body?.version));
  } catch (error) {
    return drawerError(res, error);
  }
});

router.post('/api/dashboard/drawers/:edge/restore', requireAuth, requireScope('config:write'), async (req, res) => {
  res.set('Cache-Control', 'private, no-store');
  if (!req.is('application/json')) return res.status(415).json({ error: 'Use JSON to restore the drawer.' });
  try {
    const { brainDir } = drawerBrain(req.body?.brainId, req.auth);
    if (Object.keys(req.body ?? {}).some(key => !['brainId', 'revision', 'version'].includes(key))) throw new DrawerInputError('Invalid drawer restore request.');
    return res.json(await restoreDrawerConfig(brainDir, req.params.edge, req.body?.revision, req.body?.version));
  } catch (error) { return drawerError(res, error); }
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
