/**
 * Graph, conflicts, and SSSS resource routes.
 *
 * GET  /api/graph                    - memory graph nodes + skill routes
 * GET  /api/conflicts                - list semantic conflicts (disk + dynamic)
 * POST /api/conflicts/resolve        - resolve a conflict
 * GET  /api/ssss                     - SSSS resource index
 * GET  /api/ssss/instructions        - serve INSTRUCTIONS.md (or named surface)
 * GET  /api/ssss/skill/ssss          - serve the SSSS skill doc
 * GET  /api/ssss/spec                - serve the SSSS spec/reference doc
 * GET  /api/ssss/references          - list all SSSS references
 * GET  /api/ssss/references/:name    - serve a named SSSS reference file
 *
 * Extracted from rest.mjs as part of the per-resource router refactor.
 */

import { Router } from 'express';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import matter from 'gray-matter';
import { requireAuth, requireScope } from '../auth.mjs';
import { getNodes, invalidate } from '../../core/vault-cache.mjs';
import {
  VAULT_DIR,
  BRAIN_DIR,
  DERIVED_DIR,
  SKILLS_DIR,
  INSTRUCTIONS,
  ROOT,
  badRequest,
  serverError,
  resolveVaultFromQuery,
  pathsForVault,
} from './_shared.mjs';

const router = Router();

// ─── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Feature flag file locations:
 * - Production SSSS layout: <vault>/preferences/dashboard-enhanced.md
 * - Legacy/test layout: <vault>/../preferences/dashboard-enhanced.md
 */
function isDashboardEnhanced(vaultDir = VAULT_DIR) {
  return (
    fs.existsSync(path.join(vaultDir, 'preferences', 'dashboard-enhanced.md')) ||
    fs.existsSync(path.join(vaultDir, '..', 'preferences', 'dashboard-enhanced.md'))
  );
}

function sha256(content) {
  return crypto.createHash('sha256').update(content).digest('hex');
}

function readTextResource(filePath, name) {
  if (!fs.existsSync(filePath)) return null;
  const content = fs.readFileSync(filePath, 'utf8');
  const stat = fs.statSync(filePath);
  return {
    name,
    content,
    sha256: sha256(content),
    bytes: stat.size,
    modified: stat.mtime.toISOString()
  };
}

function sendTextResource(res, filePath, name) {
  const resource = readTextResource(filePath, name);
  if (!resource) {
    return res.status(404).json({ error: `${name} is not available` });
  }
  return res.json(resource);
}

function baseUrl(req) {
  return `${req.protocol}://${req.get('host')}`;
}

function absoluteUrl(req, routePath) {
  return new URL(routePath, baseUrl(req)).toString();
}

function ssssReferenceDir() {
  const candidates = [
    path.join(SKILLS_DIR, 'total-recall', 'references'),
    path.join(SKILLS_DIR, 'total-recall', 'modules', 'ssss', 'references'),
    path.join(SKILLS_DIR, 'okf', 'references'),
  ];
  return candidates.find((p) => fs.existsSync(p)) || candidates[0];
}

function ssssSkillDocPath() {
  const candidates = [
    path.join(SKILLS_DIR, 'total-recall', 'references', 'ssss-reference.md'),
    path.join(SKILLS_DIR, 'total-recall', 'SKILL.md'),
    path.join(SKILLS_DIR, 'total-recall', 'modules', 'ssss', 'MODULE.md'),
    path.join(SKILLS_DIR, 'okf', 'SKILL.md'),
  ];
  return candidates.find((p) => fs.existsSync(p)) || candidates[0];
}

function listSsssReferences(req) {
  const refsDir = ssssReferenceDir();
  if (!fs.existsSync(refsDir)) return [];
  return fs.readdirSync(refsDir)
    .filter(file => file.endsWith('.md'))
    .sort()
    .map((file) => {
      const name = file.replace(/\.md$/, '');
      const resource = readTextResource(path.join(refsDir, file), name);
      return {
        name,
        url: absoluteUrl(req, `/api/ssss/references/${name}`),
        sha256: resource?.sha256 || null,
        bytes: resource?.bytes || 0,
        modified: resource?.modified || null
      };
    });
}

function safeReferencePath(name) {
  if (!/^[a-zA-Z0-9_-]+$/.test(String(name || ''))) return null;
  return path.join(ssssReferenceDir(), `${name}.md`);
}

// ─── Routes ────────────────────────────────────────────────────────────────────

/**
 * GET /api/graph
 * Returns graph nodes and skill routes from derived JSONL files.
 * Requires dashboard-enhanced feature flag.
 */
router.get('/api/graph', requireAuth, requireScope('ssss:read'), (req, res) => {
  const vaultDir = resolveVaultFromQuery(req);
  if (!isDashboardEnhanced(vaultDir)) {
    return res.status(404).json({ error: 'dashboard-enhanced feature flag not enabled' });
  }
  try {
    const { derivedDir } = pathsForVault(vaultDir);
    // Prefer brain-local derived; fall back to shared DERIVED_DIR (tests/mocks)
    const derived = fs.existsSync(derivedDir) ? derivedDir : DERIVED_DIR;
    const graphFile = path.join(derived, 'graph-index.jsonl');
    const routesFile = path.join(derived, 'skill-routes.jsonl');
    const nodes = fs.existsSync(graphFile)
      ? fs.readFileSync(graphFile, 'utf8').split('\n').filter(Boolean).map(l => JSON.parse(l))
      : [];
    const routes = fs.existsSync(routesFile)
      ? fs.readFileSync(routesFile, 'utf8').split('\n').filter(Boolean).map(l => JSON.parse(l))
      : [];
    res.json({ nodes, routes, vault_dir: vaultDir });
  } catch (err) { serverError(res, err); }
});

/**
 * GET /api/conflicts
 * Lists both disk-persisted and dynamically-detected semantic conflicts.
 * Requires dashboard-enhanced feature flag.
 */
router.get('/api/conflicts', requireAuth, requireScope('ssss:read'), async (req, res) => {
  const vaultDir = resolveVaultFromQuery(req);
  if (!isDashboardEnhanced(vaultDir)) {
    return res.status(404).json({ error: 'dashboard-enhanced feature flag not enabled' });
  }
  try {
    const paths = pathsForVault(vaultDir);
    const conflictsDir = path.join(paths.brainDir, 'memory-inbox', 'conflicts');
    const conflicts = [];

    if (fs.existsSync(conflictsDir)) {
      const files = fs.readdirSync(conflictsDir).filter(f => f.endsWith('.md'));
      for (const file of files) {
        try {
          const raw = fs.readFileSync(path.join(conflictsDir, file), 'utf8');
          const parsed = matter(raw);
          conflicts.push({ ...parsed.data, body: parsed.content });
        } catch (e) {
          // ignore malformed
        }
      }
    }

    // Dynamic scan for the requested brain (not always global)
    const { detectSemanticConflicts } = await import('../../core/conflict-detector.mjs');
    const list = getNodes(vaultDir);
    const dynamicConflicts = [];
    for (let i = 0; i < list.length; i++) {
      const found = detectSemanticConflicts(list[i], list.slice(0, i));
      dynamicConflicts.push(...found);
    }

    // Merge without duplicates
    const merged = [...conflicts];
    for (const dc of dynamicConflicts) {
      const exists = merged.some(c =>
        (c.new_slug === dc.new_slug && c.existing_slug === dc.existing_slug) ||
        (c.new_slug === dc.existing_slug && c.existing_slug === dc.new_slug)
      );
      if (!exists) {
        merged.push(dc);
      }
    }

    res.json({ conflicts: merged });
  } catch (err) {
    serverError(res, err);
  }
});

/**
 * POST /api/conflicts/resolve
 * Body: { conflict_id, action: 'keep' | 'supersede', winner_slug }
 */
router.post('/api/conflicts/resolve', requireAuth, requireScope('memory:write'), async (req, res) => {
  try {
    const { conflict_id, action, winner_slug } = req.body || {};
    if (!conflict_id || !action || !winner_slug) {
      return badRequest(res, 'Required fields: conflict_id, action, winner_slug');
    }
    if (action !== 'keep' && action !== 'supersede') {
      return badRequest(res, "action must be either 'keep' or 'supersede'");
    }

    const vaultDir = resolveVaultFromQuery(req);
    const paths = pathsForVault(vaultDir);
    const inboxDir = path.join(paths.brainDir, 'memory-inbox');
    const { resolveConflict } = await import('../../core/conflict-detector.mjs');
    const result = resolveConflict(conflict_id, inboxDir, action, winner_slug);
    if (!result.resolved) {
      return badRequest(res, result.error || 'Failed to resolve conflict');
    }

    invalidate(vaultDir);
    res.json({ success: true, conflict_id, vault_dir: vaultDir });
  } catch (err) {
    serverError(res, err);
  }
});

/**
 * GET /api/ssss
 * Returns the SSSS resource index (metadata only — no file content).
 */
router.get('/api/ssss', requireAuth, requireScope('ssss:read'), (req, res) => {
  const resources = {
    instructions: {
      name: 'instructions',
      url: absoluteUrl(req, '/api/ssss/instructions'),
      ...(() => {
        const r = readTextResource(INSTRUCTIONS, 'instructions');
        return r ? { sha256: r.sha256, bytes: r.bytes, modified: r.modified } : { sha256: null, bytes: 0, modified: null };
      })()
    },
    skill: {
      name: 'ssss-skill',
      url: absoluteUrl(req, '/api/ssss/skill/ssss'),
      ...(() => {
        const r = readTextResource(ssssSkillDocPath(), 'ssss-skill');
        return r ? { sha256: r.sha256, bytes: r.bytes, modified: r.modified } : { sha256: null, bytes: 0, modified: null };
      })()
    },
    spec: {
      name: 'ssss-spec',
      url: absoluteUrl(req, '/api/ssss/spec'),
      ...(() => {
        const refs = ssssReferenceDir();
        const specPath = ['ssss-reference.md', 'ssss-spec.md']
          .map((n) => path.join(refs, n))
          .find((p) => fs.existsSync(p));
        const r = specPath ? readTextResource(specPath, 'ssss-spec') : null;
        return r ? { sha256: r.sha256, bytes: r.bytes, modified: r.modified } : { sha256: null, bytes: 0, modified: null };
      })()
    },
    references: listSsssReferences(req)
  };

  res.json({
    name: 'ssss',
    schema_version: 2,
    resources
  });
});

/**
 * GET /api/ssss/instructions
 * Serves INSTRUCTIONS.md, or a named surface file via ?surface=<name>.
 */
router.get('/api/ssss/instructions', requireAuth, requireScope('ssss:read', 'instructions:read'), (req, res) => {
  const surface = req.query.surface;
  if (surface) {
    if (surface === 'INSTRUCTIONS.md') {
      return sendTextResource(res, INSTRUCTIONS, 'instructions');
    }
    const safeSurface = path.basename(surface);
    const surfacePath = path.join(ROOT, safeSurface);
    return sendTextResource(res, surfacePath, safeSurface);
  }
  return sendTextResource(res, INSTRUCTIONS, 'instructions');
});

/**
 * GET /api/ssss/skill/ssss
 * Serves the SSSS skill documentation.
 */
router.get('/api/ssss/skill/ssss', requireAuth, requireScope('ssss:read'), (_req, res) => {
  return sendTextResource(res, ssssSkillDocPath(), 'ssss-skill');
});

/**
 * GET /api/ssss/spec
 * Serves the SSSS specification/reference document.
 */
router.get('/api/ssss/spec', requireAuth, requireScope('ssss:read'), (_req, res) => {
  const refs = ssssReferenceDir();
  const specPath = ['ssss-reference.md', 'ssss-spec.md']
    .map((n) => path.join(refs, n))
    .find((p) => fs.existsSync(p));
  return sendTextResource(res, specPath || path.join(refs, 'ssss-reference.md'), 'ssss-spec');
});

/**
 * GET /api/ssss/references
 * Lists all SSSS reference files with metadata.
 */
router.get('/api/ssss/references', requireAuth, requireScope('ssss:read'), (req, res) => {
  res.json({ references: listSsssReferences(req) });
});

/**
 * GET /api/ssss/references/:name
 * Serves a single SSSS reference file by name.
 */
router.get('/api/ssss/references/:name', requireAuth, requireScope('ssss:read'), (req, res) => {
  const filePath = safeReferencePath(req.params.name);
  if (!filePath) return res.status(400).json({ error: 'Invalid reference name' });
  return sendTextResource(res, filePath, req.params.name);
});

export default router;
