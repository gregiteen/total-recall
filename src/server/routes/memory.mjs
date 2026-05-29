/**
 * /api/memory/* routes
 *
 * - GET    /api/memory                list (q, category, tag, limit, offset)
 * - GET    /api/memory/stats          counts by category
 * - GET    /api/memory/:slug          read
 * - POST   /api/memory                create
 * - PUT    /api/memory/:slug          full replace
 * - PATCH  /api/memory/:slug          partial update
 * - DELETE /api/memory/:slug          delete
 */

import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { writeNode, createMemoryNode, walkMd } from '../../core/vault.mjs';
import { getNodes, invalidate } from '../../core/vault-cache.mjs';
import { requireAuth, requireScope } from '../auth.mjs';
import { compileSurface } from '../../core/surface.mjs';
import { buildEmbeddingsIndex, buildSessionEmbeddingsIndex } from '../../core/embeddings.mjs';
import { detectAndResolve } from '../../core/conflict-detector.mjs';
import {
  BRAIN_DIR,
  VAULT_DIR,
  SKILLS_DIR,
  DERIVED_DIR,
  SESSIONS_DIR,
  INSTRUCTIONS,
  notFound,
  badRequest,
  serverError,
  sanitizeNode,
  resolveVaultFromQuery,
} from './_shared.mjs';

const router = express.Router();

function nodes(vaultDir = VAULT_DIR) {
  return getNodes(vaultDir);
}

/**
 * Trigger background SSSS semantic conflict resolution, surface compile, and embedding build.
 * Auto-mutates the brain in real time when any fact is written, updated, or deleted!
 */
async function triggerMutation(node, vaultDir = VAULT_DIR) {
  try {
    // 1. Semantic conflict detection & auto-resolution (Sovereign OS Intelligence)
    try {
      const existing = nodes(vaultDir);
      if (node && node.type === 'memory') {
        detectAndResolve(node, existing, {
          vaultDir,
          inboxDir: path.join(BRAIN_DIR, 'memory-inbox'),
        });
      }
    } catch (conflictErr) {
      // Non-fatal fallback
    }

    // 2. Recompile instructions surface
    await compileSurface({
      vaultDir,
      skillsDir:       SKILLS_DIR,
      derivedDir:      DERIVED_DIR,
      instructionsFile: INSTRUCTIONS,
    });

    // 3. Rebuild dense embeddings index incrementally in background
    try {
      const vaultNodes = nodes(vaultDir);
      await buildEmbeddingsIndex(vaultNodes, DERIVED_DIR);
      await buildSessionEmbeddingsIndex(SESSIONS_DIR, DERIVED_DIR);
    } catch (embedErr) {
      // Ollama/embeddings offline non-fatal
    }
  } catch (err) {
    // Non-fatal background log
  }
}


// SSSS v2 frontmatter fields we pass through verbatim from request bodies.
const PASSTHROUGH_FIELDS = ['priority', 'modality', 'confidence', 'importance', 'status', 'related', 'sources'];

router.get('/api/memory', requireAuth, requireScope('memory:read'), (req, res) => {
  try {
    const vaultDir = resolveVaultFromQuery(req);
    let list = nodes(vaultDir);

    const { q, category, tag, limit = '200', offset = '0' } = req.query;

    if (q) {
      const query = String(q).toLowerCase();
      list = list.filter(n =>
        [n.slug, n.title, n.category, (n.tags || []).join(' '), n.body]
          .join(' ').toLowerCase().includes(query)
      );
    }
    if (category) list = list.filter(n => n.category === category);
    if (tag) list = list.filter(n => (n.tags || []).includes(tag));

    const total = list.length;
    const off   = Math.max(0, parseInt(offset, 10) || 0);
    const lim   = Math.min(500, Math.max(1, parseInt(limit, 10) || 200));
    const page  = list.slice(off, off + lim).map(sanitizeNode);

    res.json({ total, offset: off, limit: lim, nodes: page });
  } catch (err) {
    serverError(res, err);
  }
});

router.get('/api/memory/stats', requireAuth, requireScope('memory:read'), (req, res) => {
  try {
    const vaultDir = resolveVaultFromQuery(req);
    const list = nodes(vaultDir);
    const byCategory = {};
    for (const n of list) {
      byCategory[n.category] = (byCategory[n.category] || 0) + 1;
    }
    res.json({ total: list.length, by_category: byCategory });
  } catch (err) {
    serverError(res, err);
  }
});

router.get('/api/memory/:slug', requireAuth, requireScope('memory:read'), (req, res) => {
  try {
    const vaultDir = resolveVaultFromQuery(req);
    const node = nodes(vaultDir).find(n => n.slug === req.params.slug);
    if (!node) return notFound(res, `Memory node not found: ${req.params.slug}`);
    res.json(sanitizeNode(node));
  } catch (err) {
    serverError(res, err);
  }
});

router.post('/api/memory', requireAuth, requireScope('memory:write'), (req, res) => {
  try {
    const vaultDir = resolveVaultFromQuery(req);
    const { slug, title, category, content, body, tags } = req.body || {};
    const actualContent = content || body;
    if (!slug || !title || !category || !actualContent) {
      return badRequest(res, 'Required fields: slug, title, category, content (or body)');
    }
    if (nodes(vaultDir).find(n => n.slug === slug)) {
      return res.status(409).json({ error: `Node already exists: ${slug}. Use PUT to update.` });
    }
    const node = createMemoryNode({ slug, title, category, content: actualContent });
    if (tags && Array.isArray(tags)) node.tags = tags;

    for (const key of PASSTHROUGH_FIELDS) {
      if (req.body[key] !== undefined) node[key] = req.body[key];
    }

    writeNode(node, vaultDir);
    invalidate();
    triggerMutation(node, vaultDir);
    res.status(201).json(sanitizeNode(node));
  } catch (err) {
    serverError(res, err);
  }
});

router.put('/api/memory/:slug', requireAuth, requireScope('memory:write'), (req, res) => {
  try {
    const vaultDir = resolveVaultFromQuery(req);
    const { title, category, content, body, tags } = req.body || {};
    const actualContent = content || body;
    if (!title || !category || !actualContent) {
      return badRequest(res, 'Required fields: title, category, content (or body)');
    }
    const node = createMemoryNode({ slug: req.params.slug, title, category, content: actualContent });
    if (tags && Array.isArray(tags)) node.tags = tags;

    for (const key of PASSTHROUGH_FIELDS) {
      if (req.body[key] !== undefined) node[key] = req.body[key];
    }

    writeNode(node, vaultDir);
    invalidate();
    triggerMutation(node, vaultDir);
    res.json(sanitizeNode(node));
  } catch (err) {
    serverError(res, err);
  }
});

router.patch('/api/memory/:slug', requireAuth, requireScope('memory:write'), (req, res) => {
  try {
    const vaultDir = resolveVaultFromQuery(req);
    const existing = nodes(vaultDir).find(n => n.slug === req.params.slug);
    if (!existing) return notFound(res, `Memory node not found: ${req.params.slug}`);

    const { title, category, content, body, tags } = req.body || {};
    const actualContent = content || body || existing.body;
    const updated = createMemoryNode({
      slug:     existing.slug,
      title:    title    ?? existing.title,
      category: category ?? existing.category,
      content:  actualContent,
    });
    updated.tags = tags ?? existing.tags ?? [];
    updated.created_at = existing.created_at;

    for (const key of PASSTHROUGH_FIELDS) {
      if (existing[key] !== undefined) updated[key] = existing[key];
    }
    for (const key of PASSTHROUGH_FIELDS) {
      if (req.body[key] !== undefined) updated[key] = req.body[key];
    }

    writeNode(updated, vaultDir);
    invalidate();
    triggerMutation(updated, vaultDir);
    res.json(sanitizeNode(updated));
  } catch (err) {
    serverError(res, err);
  }
});

router.delete('/api/memory/:slug', requireAuth, requireScope('memory:write'), (req, res) => {
  try {
    const vaultDir = resolveVaultFromQuery(req);
    const list = nodes(vaultDir);
    const node = list.find(n => n.slug === req.params.slug);
    if (!node) return notFound(res, `Memory node not found: ${req.params.slug}`);

    if (node._filePath && fs.existsSync(node._filePath)) {
      fs.unlinkSync(node._filePath);
    } else {
      for (const file of walkMd(vaultDir)) {
        const raw = fs.readFileSync(file, 'utf8');
        if (raw.includes(`slug: ${req.params.slug}`)) {
          fs.unlinkSync(file);
          break;
        }
      }
    }
    invalidate();
    triggerMutation(null, vaultDir);
    res.json({ deleted: true, slug: req.params.slug });
  } catch (err) {
    serverError(res, err);
  }
});

export { router as memoryRouter };
