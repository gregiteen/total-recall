import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import matter from 'gray-matter';

import { requireAuth, requireScope } from '../auth.mjs';
import {
  badRequest,
  notFound,
  serverError,
  resolveVaultFromQuery,
  CONFIG_DIR
} from './_shared.mjs';
import { getNodes, invalidate } from '../../core/vault-cache.mjs';
import { processOperationAsync } from '../../core/operation-validator.mjs';

const router = express.Router();

function getRegistryTypes(brainDir) {
  const globalRegistryPath = path.join(os.homedir(), '.agent', 'skills', 'total-recall', 'config', 'project-registry.json');
  // Portability is resolved per-type from the registry (core + extensions)
  // Since we just need portability mapping for types, let's load it dynamically.
  // Actually, `@ssss/cli` parses things.
  // For now, let's just return a generic helper.
  return {};
}

// Ensure the path is safe
function isSafePath(p) {
  const normalized = path.normalize(p).replace(/^(\.\.(\/|\\|$))+/, '');
  return normalized === p && !p.startsWith('/') && !p.includes('..');
}

/**
 * GET /api/docs
 * List documents with filtering and pagination.
 */
router.get('/api/docs', requireAuth, requireScope('ssss:read'), (req, res) => {
  try {
    const vaultDir = resolveVaultFromQuery(req);
    if (!fs.existsSync(vaultDir)) {
      return res.json({ total: 0, docs: [] });
    }

    let nodes = getNodes(vaultDir);

    const { type, portability, status, tag, xKind, q, limit, offset } = req.query;

    if (type) nodes = nodes.filter(n => n.type === type);
    if (status) nodes = nodes.filter(n => n.status === status);
    if (xKind) nodes = nodes.filter(n => n.x_kind === xKind);
    if (tag) nodes = nodes.filter(n => n.tags && n.tags.includes(tag));
    
    // Naive resolution for portability if requested
    // (Assuming vault-cache nodes already have a 'portability' property or we extract it)
    if (portability) {
      nodes = nodes.filter(n => {
         // Some frontmatter might define x_portability directly
         if (n.x_portability) return n.x_portability === portability;
         // Hardcoded defaults per SSSS core:
         if (['memory', 'rule', 'workflow', 'assistant', 'page', 'theme'].includes(n.type)) {
            return 'structural' === portability;
         }
         return 'tenant_private' === portability;
      });
    }

    if (q) {
      const qs = q.toLowerCase();
      nodes = nodes.filter(n => 
        (n.title && n.title.toLowerCase().includes(qs)) || 
        (n.slug && n.slug.toLowerCase().includes(qs))
      );
    }

    const total = nodes.length;

    // Sort by updated descending
    nodes.sort((a, b) => new Date(b.updated || 0) - new Date(a.updated || 0));

    const skip = parseInt(offset, 10) || 0;
    const take = parseInt(limit, 10) || 50;
    const page = nodes.slice(skip, skip + take);

    res.json({
      total,
      docs: page.map(n => ({
        path: n._filePath ? path.relative(vaultDir, n._filePath) : `${n.category || 'uncategorized'}/${n.slug}.md`,
        type: n.type || 'memory',
        portability: n.x_portability || (['memory', 'rule', 'workflow', 'assistant', 'page', 'theme'].includes(n.type) ? 'structural' : 'tenant_private'),
        name: n.title || n.slug,
        status: n.status,
        tags: n.tags || [],
        updatedAt: n.updated,
        frontmatter: { ...n, body: undefined, _filePath: undefined }
      }))
    });
  } catch (err) { serverError(res, err); }
});

/**
 * GET /api/docs/read
 * Read a single document by path
 */
router.get('/api/docs/read', requireAuth, requireScope('ssss:read'), (req, res) => {
  try {
    const vaultDir = resolveVaultFromQuery(req);
    const relPath = req.query.path;
    if (!relPath || !isSafePath(relPath)) return badRequest(res, 'Invalid path');

    const absPath = path.join(vaultDir, relPath);
    if (!fs.existsSync(absPath)) return notFound(res, 'Document not found');

    const raw = fs.readFileSync(absPath, 'utf8');
    const parsed = matter(raw);

    res.json({
      path: relPath,
      raw,
      frontmatter: parsed.data,
      body: parsed.content
    });
  } catch (err) { serverError(res, err); }
});

/**
 * POST /api/docs
 * Create a new document
 */
router.post('/api/docs', requireAuth, requireScope('ssss:write'), async (req, res) => {
  try {
    const vaultDir = resolveVaultFromQuery(req);
    const { path: relPath, content } = req.body;
    
    if (!relPath || !isSafePath(relPath)) return badRequest(res, 'Invalid path');
    const absPath = path.join(vaultDir, relPath);
    if (fs.existsSync(absPath)) return res.status(409).json({ error: 'Document already exists' });

    const envelope = {
      type: 'operation',
      idempotency_key: crypto.randomUUID(),
      path: relPath,
      workspace_id: 'default',
      content
    };

    const result = await processOperationAsync(envelope, vaultDir, { agentRole: 'admin' });
    if (!result.success) {
      return res.status(400).json({ error: 'Validation failed', details: result });
    }
    invalidate(vaultDir);
    res.json({ success: true, result });
  } catch (err) { serverError(res, err); }
});

/**
 * PUT /api/docs
 * Update an existing document
 */
router.put('/api/docs', requireAuth, requireScope('ssss:write'), async (req, res) => {
  try {
    const vaultDir = resolveVaultFromQuery(req);
    const { path: relPath, content } = req.body;
    
    if (!relPath || !isSafePath(relPath)) return badRequest(res, 'Invalid path');
    const absPath = path.join(vaultDir, relPath);
    if (!fs.existsSync(absPath)) return notFound(res, 'Document not found');

    const envelope = {
      type: 'operation',
      idempotency_key: crypto.randomUUID(),
      path: relPath,
      workspace_id: 'default',
      content
    };

    const result = await processOperationAsync(envelope, vaultDir, { agentRole: 'admin' });
    if (!result.success) {
      return res.status(400).json({ error: 'Validation failed', details: result });
    }
    invalidate(vaultDir);
    res.json({ success: true, result });
  } catch (err) { serverError(res, err); }
});

/**
 * DELETE /api/docs
 * Delete a document
 */
router.delete('/api/docs', requireAuth, requireScope('ssss:write'), async (req, res) => {
  try {
    const vaultDir = resolveVaultFromQuery(req);
    const relPath = req.query.path;
    
    if (!relPath || !isSafePath(relPath)) return badRequest(res, 'Invalid path');
    const absPath = path.join(vaultDir, relPath);
    if (!fs.existsSync(absPath)) return notFound(res, 'Document not found');

    const envelope = {
      type: 'delete',
      idempotency_key: crypto.randomUUID(),
      path: relPath,
      workspace_id: 'default'
    };

    const result = await processOperationAsync(envelope, vaultDir, { agentRole: 'admin' });
    if (!result.success) {
      return res.status(400).json({ error: 'Validation failed', details: result });
    }
    invalidate(vaultDir);
    res.json({ success: true, result });
  } catch (err) { serverError(res, err); }
});

// Saved Views
const VIEWS_FILE = path.join(os.homedir(), '.agent', 'config', 'saved-views.json');

function getViews() {
  if (!fs.existsSync(VIEWS_FILE)) return [];
  try { return JSON.parse(fs.readFileSync(VIEWS_FILE, 'utf8')); } catch { return []; }
}

function saveViews(views) {
  if (!fs.existsSync(path.dirname(VIEWS_FILE))) fs.mkdirSync(path.dirname(VIEWS_FILE), { recursive: true });
  // Atomic write
  const temp = VIEWS_FILE + '.tmp';
  fs.writeFileSync(temp, JSON.stringify(views, null, 2), 'utf8');
  fs.renameSync(temp, VIEWS_FILE);
}

router.get('/api/views', requireAuth, (req, res) => {
  res.json({ views: getViews() });
});

router.post('/api/views', requireAuth, (req, res) => {
  const views = getViews();
  const newView = {
    id: crypto.randomUUID(),
    name: req.body.name || 'Untitled View',
    brain: req.body.brain || 'global',
    filters: req.body.filters || {},
    sort: req.body.sort || {},
    columns: req.body.columns || [],
    createdAt: new Date().toISOString()
  };
  views.push(newView);
  saveViews(views);
  res.json({ view: newView });
});

router.delete('/api/views/:id', requireAuth, (req, res) => {
  let views = getViews();
  views = views.filter(v => v.id !== req.params.id);
  saveViews(views);
  res.json({ success: true });
});

export { router as docsRouter };
