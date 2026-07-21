import express from 'express';
import { getNodes } from '../../core/vault-cache.mjs';
import { logger } from '../../core/logger.mjs';
import { resolveAllVaultsFromQuery, VAULT_DIR } from './_shared.mjs';

import path from 'node:path';

export const rulesRouter = express.Router();

/** Rule categories that surface on the Agent Rules page / instruction compiler. */
const RULE_CATEGORIES = new Set(['invariants', 'preferences', 'anti-patterns', 'corrections']);

function serializeRule(node, scope) {
  const importanceRaw = Number(node.importance);
  const importance = Number.isFinite(importanceRaw)
    ? Math.min(5, Math.max(0, Math.round(importanceRaw)))
    : 0;
  const body =
    typeof node.body === 'string'
      ? node.body
      : typeof node.content === 'string'
        ? node.content
        : '';
  return {
    slug: node.slug,
    category: node.category === 'corrections' ? 'anti-patterns' : node.category,
    title: node.title || node.slug || 'Untitled rule',
    status: node.status || 'active',
    importance,
    body,
    scope,
  };
}

rulesRouter.get('/api/rules', (req, res) => {
  try {
    // Scoped by req.query.brain / x-total-recall-brain header, same as memory/graph —
    // this used to always merge the global vault with getBothBrains()'s cwd-detected
    // project brain, ignoring whichever brain the user had selected in the UI.
    const vaultDirs = resolveAllVaultsFromQuery(req);
    const globalVaultKey = path.resolve(VAULT_DIR);
    const rules = [];
    const seenVaults = new Set();

    for (const vaultDir of vaultDirs) {
      const vaultKey = path.resolve(vaultDir);
      if (seenVaults.has(vaultKey)) continue;
      seenVaults.add(vaultKey);

      let nodes = [];
      try {
        nodes = getNodes(vaultDir) || [];
      } catch (err) {
        logger.warn('rules', 'Failed to load vault nodes', { vaultDir, error: err.message });
        continue;
      }

      const scope = vaultKey === globalVaultKey ? 'global' : 'project';
      for (const n of nodes) {
        if (!RULE_CATEGORIES.has(n.category)) continue;
        // Prefer active rules first in natural order; archived still included for restore UI
        rules.push(serializeRule(n, scope));
      }
    }

    res.json({ rules, count: rules.length });
  } catch (err) {
    logger.error('rules', 'GET /api/rules failed', { error: err.message, stack: err.stack });
    res.status(500).json({ error: 'Failed to load agent rules', message: err.message });
  }
});
