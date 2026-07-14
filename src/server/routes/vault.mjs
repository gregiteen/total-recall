import { Router } from 'express';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { requireAuth, requireScope } from '../auth.mjs';
import { serverError, ROOT, BRAIN_DIR, VAULT_DIR, SKILLS_DIR, INSTRUCTIONS, DERIVED_DIR, SESSIONS_DIR } from './_shared.mjs';
import { logger } from '../../core/logger.mjs';
import { compileSurface } from '../../core/surface.mjs';
import { getNodes, invalidate } from '../../core/vault-cache.mjs';
import { loadEmbeddingsIndex, loadSessionEmbeddingsIndex } from '../../core/embeddings.mjs';

const router = Router();

router.post('/api/vault/compile', requireAuth, requireScope('memory:recompile'), async (req, res) => {
  try {
    const start = Date.now();
    await compileSurface({
      vaultDir:        VAULT_DIR,
      skillsDir:       SKILLS_DIR,
      derivedDir:      DERIVED_DIR,
      instructionsFile: INSTRUCTIONS,
    });
    // Incrementally embed any new vault nodes and sessions
    let vaultEmbed = null, sessionEmbed = null;
    try {
      const { buildEmbeddingsIndex, buildSessionEmbeddingsIndex } = await import('../../core/embeddings.mjs');
      invalidate();
      const vaultNodes = getNodes(VAULT_DIR);
      vaultEmbed = await buildEmbeddingsIndex(vaultNodes, DERIVED_DIR);
      sessionEmbed = await buildSessionEmbeddingsIndex(SESSIONS_DIR, DERIVED_DIR);
    } catch { /* embedding service may be unavailable — non-fatal */ }
    res.json({ compiled: true, elapsed_ms: Date.now() - start, vault_embeddings: vaultEmbed, session_embeddings: sessionEmbed });
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
    const hashFile = path.join(DERIVED_DIR, 'vault-hash.txt');
    const hash = fs.existsSync(hashFile) ? fs.readFileSync(hashFile, 'utf8').trim() : null;
    res.json({ vault_hash: hash });
  } catch (err) {
    serverError(res, err);
  }
});

router.get('/api/vault/status', requireAuth, requireScope('memory:read'), async (req, res) => {
  try {
    // Use vault-cache instead of scanning every .md file from disk
    const nodeCount = getNodes(VAULT_DIR).length;
    const skillCount  = fs.existsSync(SKILLS_DIR)  ? fs.readdirSync(SKILLS_DIR, { withFileTypes: true }).filter(d =>
      d.isDirectory() && fs.existsSync(path.join(SKILLS_DIR, d.name, 'SKILL.md'))).length : 0;
    const lastCompile = fs.existsSync(INSTRUCTIONS)
      ? fs.statSync(INSTRUCTIONS).mtime.toISOString()
      : null;
    const derivedFiles = fs.existsSync(DERIVED_DIR)
      ? fs.readdirSync(DERIVED_DIR).length : 0;

    // Use mtime-cached loaders instead of raw readFile + JSON.parse
    const vaultEmbedCount   = Object.keys(loadEmbeddingsIndex(DERIVED_DIR)).length;
    const sessionEmbedCount = Object.keys(loadSessionEmbeddingsIndex(DERIVED_DIR)).length;

    // CLI agent availability (best-effort)
    const { findBinaryInPath } = await import('../../core/runtime.mjs');
    let cliAgents = [];
    for (const bin of ['antigravity', 'gemini', 'claude', 'codex']) {
      if (findBinaryInPath(bin)) cliAgents.push(bin);
    }

    res.json({
      vault_dir:     VAULT_DIR,
      node_count:    nodeCount,
      skill_count:   skillCount,
      derived_files: derivedFiles,
      last_compile:  lastCompile,
      instructions_exists: fs.existsSync(INSTRUCTIONS),
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
