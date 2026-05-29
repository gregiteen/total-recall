/**
 * /api/share routes
 *
 * POST /api/share — Universal share-to-brain endpoint.
 * Accepts content from Chrome extension, CLI, or any external client
 * and routes it to the correct action (remember or research).
 */

import express from 'express';
import crypto from 'node:crypto';
import { createMemoryNode, writeNode } from '../../core/vault.mjs';
import { invalidate } from '../../core/vault-cache.mjs';
import { addToQueue } from '../../core/research-queue.mjs';
import { requireAuth, requireScope } from '../auth.mjs';
import {
  VAULT_DIR,
  badRequest,
  serverError,
  resolveVaultFromQuery,
} from './_shared.mjs';

const router = express.Router();

/**
 * Resolve the effective action from the auto-routing heuristic.
 *
 * - Has URL + no excerpt        → 'research'
 * - Has excerpt < 500 chars     → 'remember', category = 'facts'
 * - Has excerpt >= 500 chars    → 'remember', category = 'concepts'
 * - Has URL + excerpt           → 'remember' with URL as citation
 */
function resolveAction({ url, excerpt, action }) {
  if (action && action !== 'auto') {
    // Explicit action — determine category based on excerpt length
    if (action === 'remember') {
      const category = excerpt && excerpt.length >= 500 ? 'concepts' : 'facts';
      return { action: 'remember', category };
    }
    return { action, category: null };
  }

  // Auto-routing heuristic
  if (url && !excerpt) {
    return { action: 'research', category: null };
  }
  if (excerpt && excerpt.length >= 500) {
    return { action: 'remember', category: 'concepts' };
  }
  if (excerpt) {
    return { action: 'remember', category: 'facts' };
  }
  // URL + excerpt (caught by excerpt checks above) or fallback
  if (url) {
    return { action: 'research', category: null };
  }
  return { action: 'remember', category: 'facts' };
}

/**
 * POST /api/share
 * Body: { url, title, excerpt, source, action, brainId, tags }
 */
router.post('/api/share', requireAuth, requireScope('memory:write'), (req, res) => {
  try {
    const { url, title, excerpt, source, action: rawAction, tags } = req.body || {};

    // Validate: at least a URL or excerpt is required
    if (!url && !excerpt) {
      return badRequest(res, 'At least one of url or excerpt is required');
    }

    const { action, category } = resolveAction({ url, excerpt, action: rawAction });

    if (action === 'research') {
      // Queue a research project
      const topic = title || url || 'Untitled research';
      const item = addToQueue({
        topic,
        priority: 'medium',
        notes: excerpt || '',
      });

      return res.status(201).json({
        action_taken: 'research',
        id: item.id,
        slug: null,
        message: `Queued research: "${topic}"`,
      });
    }

    // action === 'remember'
    const vaultDir = resolveVaultFromQuery(req);
    const slugBase = category || 'facts';
    const slug = `${slugBase}-${crypto.randomBytes(4).toString('hex')}`;
    const nodeTitle = title || (excerpt ? excerpt.slice(0, 80) : url || 'Untitled share');

    const node = createMemoryNode({
      slug,
      title: nodeTitle,
      category: category || 'facts',
      content: excerpt || url || '',
    });

    // Override source type from request
    node.source.type = source || 'api';

    // Set tags if provided
    if (tags) {
      node.tags = Array.isArray(tags) ? tags : String(tags).split(',').map(t => t.trim());
    }

    // Add URL as citation if provided
    if (url) {
      node.x_citations = [{
        url,
        title: title || url,
        source: 'share-to-brain',
        published: node.created,
        relevance: 1.0,
        accessed: node.created,
      }];
    }

    writeNode(node, vaultDir);
    invalidate();

    return res.status(201).json({
      action_taken: 'remember',
      id: node.slug,
      slug: `${category || 'facts'}/${node.slug}.md`,
      message: `Saved as ${category || 'facts'}: ${category || 'facts'}/${node.slug}.md`,
    });
  } catch (err) {
    serverError(res, err);
  }
});

export { router as shareRouter };
