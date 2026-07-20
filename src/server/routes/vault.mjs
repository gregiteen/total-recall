import { Router } from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { requireAuth, requireScope } from '../auth.mjs';
import {
  serverError,
  VAULT_DIR,
  SKILLS_DIR,
  INSTRUCTIONS,
  DERIVED_DIR,
  SESSIONS_DIR,
  resolveVaultFromQuery,
  pathsForVault,
} from './_shared.mjs';
import { compileSurface } from '../../core/surface.mjs';
import { getNodes, invalidate } from '../../core/vault-cache.mjs';
import { loadEmbeddingsIndex, loadSessionEmbeddingsIndex } from '../../core/embeddings.mjs';

const router = Router();

router.post('/api/vault/compile', requireAuth, requireScope('memory:recompile'), async (req, res) => {
  try {
    const start = Date.now();
    const vaultDir = resolveVaultFromQuery(req);
    const paths = pathsForVault(vaultDir);

    await compileSurface({
      vaultDir,
      skillsDir: paths.skillsDir,
      derivedDir: paths.derivedDir,
      instructionsFile: paths.instructionsFile,
      force: true,
    });
    // Incrementally embed any new vault nodes and sessions for THIS brain
    let vaultEmbed = null, sessionEmbed = null;
    try {
      const { buildEmbeddingsIndex, buildSessionEmbeddingsIndex } = await import('../../core/embeddings.mjs');
      invalidate(vaultDir);
      const vaultNodes = getNodes(vaultDir);
      vaultEmbed = await buildEmbeddingsIndex(vaultNodes, paths.derivedDir);
      sessionEmbed = await buildSessionEmbeddingsIndex(paths.sessionsDir, paths.derivedDir);
    } catch { /* embedding service may be unavailable — non-fatal */ }
    res.json({
      compiled: true,
      elapsed_ms: Date.now() - start,
      vault_dir: vaultDir,
      vault_embeddings: vaultEmbed,
      session_embeddings: sessionEmbed,
    });
  } catch (err) {
    serverError(res, err);
  }
});

router.post('/api/vault/compact', requireAuth, requireScope('memory:write'), async (req, res) => {
  try {
    const { compactAppendLogs } = await import('../../core/append-log.mjs');
    const result = compactAppendLogs();
    res.json({ compacted: true, ...result });
  } catch (err) {
    serverError(res, err);
  }
});

router.get('/api/vault/hash', requireAuth, requireScope('memory:read'), (req, res) => {
  try {
    const vaultDir = resolveVaultFromQuery(req);
    const { derivedDir } = pathsForVault(vaultDir);
    const hashFile = path.join(derivedDir, 'vault-hash.txt');
    const hash = fs.existsSync(hashFile) ? fs.readFileSync(hashFile, 'utf8').trim() : null;
    res.json({ vault_hash: hash, vault_dir: vaultDir });
  } catch (err) {
    serverError(res, err);
  }
});

router.get('/api/vault/status', requireAuth, requireScope('memory:read'), async (req, res) => {
  try {
    const vaultDir = resolveVaultFromQuery(req);
    const paths = pathsForVault(vaultDir);
    // Prefer request-scoped paths; fall back to global constants for skills when agent dir is odd
    const skillsDir = paths.skillsDir || SKILLS_DIR;
    const derivedDir = paths.derivedDir || DERIVED_DIR;
    const instructionsFile = paths.instructionsFile || INSTRUCTIONS;
    const sessionsDir = paths.sessionsDir || SESSIONS_DIR;

    const nodeCount = getNodes(vaultDir).length;
    const skillCount  = fs.existsSync(skillsDir)  ? fs.readdirSync(skillsDir, { withFileTypes: true }).filter(d =>
      d.isDirectory() && fs.existsSync(path.join(skillsDir, d.name, 'SKILL.md'))).length : 0;
    const lastCompile = fs.existsSync(instructionsFile)
      ? fs.statSync(instructionsFile).mtime.toISOString()
      : null;
    const derivedFiles = fs.existsSync(derivedDir)
      ? fs.readdirSync(derivedDir).length : 0;

    const vaultEmbedCount   = Object.keys(loadEmbeddingsIndex(derivedDir)).length;
    const sessionEmbedCount = Object.keys(loadSessionEmbeddingsIndex(derivedDir)).length;

    // CLI agent availability (best-effort)
    const { findBinaryInPath } = await import('../../core/runtime.mjs');
    let cliAgents = [];
    for (const bin of ['antigravity', 'gemini', 'claude', 'codex']) {
      if (findBinaryInPath(bin)) cliAgents.push(bin);
    }

    res.json({
      vault_dir:     vaultDir,
      node_count:    nodeCount,
      skill_count:   skillCount,
      derived_files: derivedFiles,
      last_compile:  lastCompile,
      instructions_exists: fs.existsSync(instructionsFile),
      embeddings: {
        vault_nodes:    vaultEmbedCount,
        session_chunks: sessionEmbedCount,
      },
      cli_agents: { available: cliAgents },
    });
  } catch (err) {
    serverError(res, err);
  }
});

export default router;
