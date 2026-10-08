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
import path from 'node:path';
import { createMemoryNode } from '../../core/vault.mjs';
import { writeNodeValidatedAsync } from '../../core/validated-write.mjs';
import { getNodes, invalidate } from '../../core/vault-cache.mjs';
import { semanticSearch } from '../../core/search.mjs';
import { requireAuth, requireScope } from '../auth.mjs';
import { compileSurface } from '../../core/surface.mjs';
import { deleteVfsDocument } from '../../core/ssss-operation-service.mjs';
import {
  VAULT_DIR,
  notFound,
  badRequest,
  serverError,
  sanitizeNode,
  resolveVaultFromQuery,
  resolveAllVaultsFromQuery,
  pathsForVault,
} from './_shared.mjs';

const router = express.Router();

/** Serialize selected-vault projection updates and await them before returning. */
const maintenanceByVault = new Map();
export function stopMemoryMaintenance() {
  return Promise.allSettled([...maintenanceByVault.values()]);
}

function nodes(vaultDir = VAULT_DIR) { return getNodes(vaultDir); }

async function triggerMutation(_node, vaultDir = VAULT_DIR) {
  const paths = pathsForVault(vaultDir);
  const previous = maintenanceByVault.get(vaultDir) || Promise.resolve();
  const job = previous.catch(() => {}).then(() => compileSurface({
    vaultDir, skillsDir: paths.skillsDir, derivedDir: paths.derivedDir,
    instructionsFile: paths.instructionsFile, semantic: false,
  }));
  maintenanceByVault.set(vaultDir, job);
  try { await job; }
  finally { if (maintenanceByVault.get(vaultDir) === job) maintenanceByVault.delete(vaultDir); }
}

// SSSS v2 frontmatter fields we pass through verbatim from request bodies.
const PASSTHROUGH_FIELDS = [
  'priority',
  'modality',
  'confidence',
  'importance',
  'status',
  'related',
  'sources',
  'supersedes',
  'superseded_by',
  'contradicts',
  'project',
];

function stripInternalFields(result) {
  const clean = {};
  for (const [key, value] of Object.entries(result)) {
    if (!key.startsWith('_')) clean[key] = value;
  }
  if (clean.type !== 'session' && clean.content === undefined && typeof clean.body === 'string') {
    clean.content = clean.body;
  }
  return clean;
}

router.get('/api/memory', requireAuth, requireScope('memory:read'), (req, res) => {
  try {
    const vaultDirs = resolveAllVaultsFromQuery(req, { strict: true });
    let list = [];

    // Track unique slugs so we don't count shadowing duplicates twice
    const seenSlugs = new Set();

    // Iterate backwards so most specific (last in list) is seen first
    for (let i = vaultDirs.length - 1; i >= 0; i--) {
      const vaultList = nodes(vaultDirs[i]);
      for (const n of vaultList) {
        if (!seenSlugs.has(n.slug)) {
          seenSlugs.add(n.slug);
          list.push(n);
        }
      }
    }
    const { q, category, tag, tags, status, sort, limit = '200', offset = '0' } = req.query;

    if (q) {
      const query = String(q).toLowerCase();
      list = list.filter(n =>
        [n.slug, n.title, n.category, (n.tags || []).join(' '), n.body]
          .join(' ').toLowerCase().includes(query)
      );
    }
    if (category) list = list.filter(n => n.category === category);
    if (status) list = list.filter(n => n.status === status);
    // Accept tag= or tags= (comma-separated). OpenWiki UI uses tags=openwiki.
    const tagFilter = tag || tags;
    if (tagFilter) {
      const wanted = String(tagFilter)
        .split(',')
        .map((t) => t.trim().toLowerCase())
        .filter(Boolean);
      if (wanted.length) {
        list = list.filter((n) => {
          const nodeTags = (n.tags || []).map((t) => String(t).toLowerCase());
          return wanted.every((t) => nodeTags.includes(t));
        });
      }
    }

    // sort=recent (newest created first) / sort=updated (newest update first), so a
    // paged client sees the latest nodes instead of vault walk order. `recent` keys
    // on creation because dream consolidation re-stamps `updated` on old nodes.
    if (sort === 'recent' || sort === 'updated') {
      const field = sort === 'recent' ? 'created' : 'updated';
      const ts = (n) => Date.parse(n[field] || n.created || '') || 0;
      list.sort((a, b) => ts(b) - ts(a));
    }

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
    const vaultDirs = resolveAllVaultsFromQuery(req, { strict: true });
    const byCategory = {};
    let total = 0;

    // Track unique slugs so we don't count shadowing duplicates twice
    const seenSlugs = new Set();

    // Iterate backwards so most specific (last in list) is seen first
    for (let i = vaultDirs.length - 1; i >= 0; i--) {
      const list = nodes(vaultDirs[i]);
      for (const n of list) {
        if (!seenSlugs.has(n.slug)) {
          seenSlugs.add(n.slug);
          byCategory[n.category] = (byCategory[n.category] || 0) + 1;
          total++;
        }
      }
    }

    res.json({ total, by_category: byCategory });
  } catch (err) {
    serverError(res, err);
  }
});

/**
 * Slug reads use the same selected brains as list and mutation operations.
 * A miss cannot broaden the request into unrelated registered brains.
 */
function vaultDirsForSlugLookup(req) {
  return resolveAllVaultsFromQuery(req, { strict: true });
}

router.get('/api/memory/:slug', requireAuth, requireScope('memory:read'), (req, res) => {
  try {
    const vaultDirs = vaultDirsForSlugLookup(req);

    for (const vaultDir of vaultDirs) {
      const node = nodes(vaultDir).find(n => n.slug === req.params.slug);
      if (node) {
        return res.json(sanitizeNode(node));
      }
    }

    return notFound(res, `Memory node not found: ${req.params.slug}`);
  } catch (err) {
    serverError(res, err);
  }
});

router.post('/api/memory', requireAuth, requireScope('memory:write'), async (req, res) => {
  try {
    const vaultDir = resolveVaultFromQuery(req, { strict: true });
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
    
    const rawBrainId = req.query?.brain || req.body?.brainId || req.headers?.['x-total-recall-brain'];
    if (rawBrainId && rawBrainId.startsWith('project:')) {
      node.project = rawBrainId.slice('project:'.length);
    }

    const vaultResult = await writeNodeValidatedAsync(node, vaultDir);
    if (!vaultResult.success) {
      return res.status(422).json({
        error: 'Validation failed',
        validation: vaultResult.validation,
        repair: vaultResult.repair,
      });
    }
    invalidate(vaultDir);
    await triggerMutation(node, vaultDir);
    res.status(201).json(sanitizeNode(node));
  } catch (err) {
    serverError(res, err);
  }
});

router.put('/api/memory/:slug', requireAuth, requireScope('memory:write'), async (req, res) => {
  try {
    const vaultDir = resolveVaultFromQuery(req, { strict: true });
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

    const vaultResult = await writeNodeValidatedAsync(node, vaultDir);
    if (!vaultResult.success) {
      return res.status(422).json({
        error: 'Validation failed',
        validation: vaultResult.validation,
        repair: vaultResult.repair,
      });
    }
    invalidate(vaultDir);
    await triggerMutation(node, vaultDir);
    res.json(sanitizeNode(node));
  } catch (err) {
    serverError(res, err);
  }
});

router.patch('/api/memory/:slug', requireAuth, requireScope('memory:write'), async (req, res) => {
  try {
    const vaultDirs = resolveAllVaultsFromQuery(req, { strict: true });
    let existing;
    let targetVaultDir = vaultDirs[vaultDirs.length - 1]; // Default to most specific

    for (const vaultDir of vaultDirs) {
      existing = nodes(vaultDir).find(n => n.slug === req.params.slug);
      if (existing) {
        targetVaultDir = vaultDir;
        break;
      }
    }

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
    updated.created = existing.created;

    for (const key of PASSTHROUGH_FIELDS) {
      if (existing[key] !== undefined) updated[key] = existing[key];
    }
    for (const key of PASSTHROUGH_FIELDS) {
      if (req.body[key] !== undefined) updated[key] = req.body[key];
    }

    const vaultResult = await writeNodeValidatedAsync(updated, targetVaultDir);
    if (!vaultResult.success) {
      return res.status(422).json({
        error: 'Validation failed',
        validation: vaultResult.validation,
        repair: vaultResult.repair,
      });
    }
    invalidate(targetVaultDir);
    await triggerMutation(updated, targetVaultDir);
    res.json(sanitizeNode(updated));
  } catch (err) {
    serverError(res, err);
  }
});

router.delete('/api/memory/:slug', requireAuth, requireScope('memory:write'), async (req, res) => {
  try {
    const vaultDirs = resolveAllVaultsFromQuery(req, { strict: true });
    let node;
    let targetVaultDir;

    for (const vaultDir of vaultDirs) {
      node = nodes(vaultDir).find(n => n.slug === req.params.slug);
      if (node) {
        targetVaultDir = vaultDir;
        break;
      }
    }

    if (!node) return notFound(res, `Memory node not found: ${req.params.slug}`);

    await deleteVfsDocument(path.relative(targetVaultDir, node._filePath).split(path.sep).join('/'), {
      vaultRoot: targetVaultDir, actorRole: 'system', intent: `Delete memory ${req.params.slug}`,
    });
    invalidate(targetVaultDir);
    await triggerMutation(null, targetVaultDir);

    res.json({ deleted: true, slug: req.params.slug });
  } catch (err) {
    serverError(res, err);
  }
});

/**
 * POST /api/memory/search/semantic
 * Body: { query: string, top_k?: number, brainId?: string }
 * Query/header: brain (same as other memory routes) — project:name, global, or multi.
 * Returns top-k vault nodes ranked by vector similarity to the query.
 */
router.post('/api/memory/search/semantic', requireAuth, requireScope('memory:read'), async (req, res) => {
  try {
    const { query, top_k, include_sessions = true } = req.body || {};
    if (!query) return badRequest(res, 'query is required');

    const k = Math.min(Number(top_k) || 5, 20);
    const vaultDirs = resolveAllVaultsFromQuery(req, { strict: true });
    const merged = [];
    let anyIndex = false;

    for (const vaultDir of vaultDirs) {
      const { derivedDir } = pathsForVault(vaultDir);
      try {
        const part = await semanticSearch(query, {
          vaultDir,
          derivedDir,
          top_k: k,
          // Sessions only on the primary (first) vault to avoid cross-brain noise
          includeSessions: include_sessions && vaultDir === vaultDirs[0],
        });
        if (part.length > 0) anyIndex = true;
        for (const r of part) {
          merged.push({ ...r, _brainVault: vaultDir });
        }
      } catch {
        // per-vault search failure is non-fatal when multi-brain
      }
    }

    merged.sort((a, b) => (b.score || 0) - (a.score || 0));
    // Never expose absolute vault paths (_filePath, _brainVault, …) over the API;
    // mirror sanitizeNode's `content` so clients read one field for the text.
    const results = merged.slice(0, k).map(stripInternalFields);

    if (!anyIndex || results.length === 0) {
      return res.status(503).json({
        error: 'Embeddings index is empty. Run POST /api/vault/compile to build it.',
      });
    }
    res.json({ query, top_k: k, results });
  } catch (err) {
    serverError(res, err);
  }
});

export { router as memoryRouter };
