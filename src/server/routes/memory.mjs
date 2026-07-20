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
import { createMemoryNode, walkMd } from '../../core/vault.mjs';
import { writeNodeValidatedAsync } from '../../core/validated-write.mjs';
import { getNodes, invalidate } from '../../core/vault-cache.mjs';
import { semanticSearch } from '../../core/search.mjs';
import { requireAuth, requireScope } from '../auth.mjs';
import { compileSurface } from '../../core/surface.mjs';
import { buildEmbeddingsIndex, buildSessionEmbeddingsIndex } from '../../core/embeddings.mjs';
import { detectAndResolve } from '../../core/conflict-detector.mjs';
import { listQueue, updateQueueItem } from '../../core/research-queue.mjs';
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
  resolveAllVaultsFromQuery,
} from './_shared.mjs';

const router = express.Router();

/* ── OPT-6: debounce recompilation across rapid consecutive writes ── */
let recompileTimer = null;
const RECOMPILE_DEBOUNCE_MS = 2000; // 2-second quiet period
/** @type {Map<string, ReturnType<typeof setTimeout>>} */
const recompileTimersByVault = new Map();

function nodes(vaultDir = VAULT_DIR) {
  return getNodes(vaultDir);
}

/**
 * Derive brain-local paths from a vault directory so project brains
 * recompile their own derived indexes / surfaces — not the global ones.
 * vaultDir is always `…/<brain>/memory-vault`.
 */
function pathsForVault(vaultDir) {
  const brainDir = path.dirname(vaultDir);
  // brainDir = …/.agent/skills/total-recall → agentDir = …/.agent
  const skillsParent = path.dirname(brainDir); // …/skills
  const agentDir = path.dirname(skillsParent); // …/.agent
  return {
    brainDir,
    derivedDir: path.join(brainDir, 'memory-derived'),
    skillsDir: path.join(agentDir, 'skills'),
    instructionsFile: path.join(agentDir, 'INSTRUCTIONS.md'),
    sessionsDir: path.join(brainDir, 'sessions'),
    inboxDir: path.join(brainDir, 'memory-inbox'),
  };
}

/**
 * Trigger background SSSS semantic conflict resolution, surface compile, and embedding build.
 * Auto-mutates the brain in real time when any fact is written, updated, or deleted!
 */
async function triggerMutation(node, vaultDir = VAULT_DIR) {
  const paths = pathsForVault(vaultDir);

  // 1. Semantic conflict detection runs IMMEDIATELY (lightweight, per-node)
  try {
    const existing = nodes(vaultDir);
    if (node && node.type === 'memory') {
      detectAndResolve(node, existing, {
        vaultDir,
        inboxDir: paths.inboxDir,
      });
    }
  } catch (conflictErr) {
    // Non-fatal fallback
  }

  // 2+3. Debounce the EXPENSIVE recompile + embeddings rebuild per vault.
  //       Rapid consecutive writes accumulate; only ONE compile fires
  //       after a quiet period. Vault-cache is already invalidated
  //       immediately at each call-site via invalidate().
  const prev = recompileTimersByVault.get(vaultDir);
  if (prev) clearTimeout(prev);
  // Keep legacy single-timer field in sync for default vault (tests/introspection)
  if (vaultDir === VAULT_DIR && recompileTimer) clearTimeout(recompileTimer);

  const timer = setTimeout(async () => {
    recompileTimersByVault.delete(vaultDir);
    if (vaultDir === VAULT_DIR) recompileTimer = null;
    try {
      // Recompile instructions surface for THIS vault's brain
      await compileSurface({
        vaultDir,
        skillsDir: paths.skillsDir,
        derivedDir: paths.derivedDir,
        instructionsFile: paths.instructionsFile,
      });

      // Rebuild dense embeddings index for THIS vault
      try {
        const vaultNodes = nodes(vaultDir);
        await buildEmbeddingsIndex(vaultNodes, paths.derivedDir);
        await buildSessionEmbeddingsIndex(paths.sessionsDir, paths.derivedDir);
      } catch (embedErr) {
        // local_llm/embeddings offline non-fatal
      }
    } catch (err) {
      // Non-fatal background log
    }
  }, RECOMPILE_DEBOUNCE_MS);

  recompileTimersByVault.set(vaultDir, timer);
  if (vaultDir === VAULT_DIR) recompileTimer = timer;
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

router.get('/api/memory', requireAuth, requireScope('memory:read'), (req, res) => {
  try {
    const vaultDirs = resolveAllVaultsFromQuery(req);
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
    const { q, category, tag, tags, status, limit = '200', offset = '0' } = req.query;

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
    const vaultDirs = resolveAllVaultsFromQuery(req);
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
 * Expand vault search: query brain(s) first, then global, then every registered
 * project brain. Fixes dashboard 404s when the list came from a project vault
 * but GET omitted ?brain=.
 */
function vaultDirsForSlugLookup(req) {
  const dirs = [...resolveAllVaultsFromQuery(req)];
  const seen = new Set(dirs);

  const push = (dir) => {
    if (dir && !seen.has(dir) && fs.existsSync(dir)) {
      seen.add(dir);
      dirs.push(dir);
    }
  };

  push(VAULT_DIR);

  try {
    const home = process.env.HOME || process.env.USERPROFILE || '';
    const registryPath = path.join(home, '.agent', 'skills', 'total-recall', 'config', 'project-registry.json');
    if (fs.existsSync(registryPath)) {
      const registry = JSON.parse(fs.readFileSync(registryPath, 'utf8'));
      if (Array.isArray(registry)) {
        for (const project of registry) {
          if (project?.brainDir) {
            push(path.join(project.brainDir, 'memory-vault'));
          }
        }
      }
    }
  } catch {
    // non-fatal
  }

  return dirs;
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
    triggerMutation(node, vaultDir);
    res.status(201).json(sanitizeNode(node));
  } catch (err) {
    serverError(res, err);
  }
});

router.put('/api/memory/:slug', requireAuth, requireScope('memory:write'), async (req, res) => {
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

    const vaultResult = await writeNodeValidatedAsync(node, vaultDir);
    if (!vaultResult.success) {
      return res.status(422).json({
        error: 'Validation failed',
        validation: vaultResult.validation,
        repair: vaultResult.repair,
      });
    }
    invalidate(targetVaultDir);
    triggerMutation(node, targetVaultDir);
    res.json(sanitizeNode(node));
  } catch (err) {
    serverError(res, err);
  }
});

router.patch('/api/memory/:slug', requireAuth, requireScope('memory:write'), async (req, res) => {
  try {
    const vaultDirs = resolveAllVaultsFromQuery(req);
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
    triggerMutation(updated, targetVaultDir);
    res.json(sanitizeNode(updated));
  } catch (err) {
    serverError(res, err);
  }
});

router.delete('/api/memory/:slug', requireAuth, requireScope('memory:write'), (req, res) => {
  try {
    const vaultDirs = resolveAllVaultsFromQuery(req);
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

    if (node._filePath && fs.existsSync(node._filePath)) {
      fs.unlinkSync(node._filePath);
    } else {
      for (const file of walkMd(targetVaultDir)) {
        const raw = fs.readFileSync(file, 'utf8');
        if (raw.includes(`slug: ${req.params.slug}`)) {
          fs.unlinkSync(file);
          break;
        }
      }
    }
    invalidate(targetVaultDir);
    triggerMutation(null, targetVaultDir);

    // Keep interface and queue in sync: clear this node_slug from any research agenda items
    const queue = listQueue({});
    for (const item of queue.items) {
      if (item.node_slug === req.params.slug) {
        updateQueueItem(item.id, { node_slug: null });
      }
    }

    res.json({ deleted: true, slug: req.params.slug });
  } catch (err) {
    serverError(res, err);
  }
});

/**
 * POST /api/memory/search/semantic
 * Body: { query: string, top_k?: number }
 * Returns top-k vault nodes ranked by vector similarity to the query.
 */
router.post('/api/memory/search/semantic', requireAuth, requireScope('memory:read'), async (req, res) => {
  try {
    const { query, top_k, include_sessions = true } = req.body || {};
    if (!query) return badRequest(res, 'query is required');
    const results = await semanticSearch(query, { vaultDir: VAULT_DIR, derivedDir: DERIVED_DIR, top_k, includeSessions: include_sessions });
    if (results.length === 0) return res.status(503).json({ error: 'Embeddings index is empty. Run POST /api/vault/compile to build it.' });
    res.json({ query, top_k: Math.min(Number(top_k) || 5, 20), results });
  } catch (err) {
    serverError(res, err);
  }
});

export { router as memoryRouter };
