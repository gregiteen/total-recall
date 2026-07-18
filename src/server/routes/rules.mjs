import express from 'express';
import { getBothBrains } from '../../cli/agent-dir.mjs';
import { getNodes } from '../../core/vault-cache.mjs';
import { logger } from '../../core/logger.mjs';

import path from 'node:path';

export const rulesRouter = express.Router();

/** Rule categories that surface on the Agent Rules page / instruction compiler. */
const RULE_CATEGORIES = new Set(['invariants', 'preferences', 'anti-patterns', 'corrections']);

/**
 * Resolve the vault root for a brain layer.
 * getBothBrains() returns `brainDir` (not `brainRoot`).
 * Project layer also carries `agentDir` — fall back to skills/total-recall under it.
 */
function resolveBrainDir(layer) {
  if (!layer) return null;
  if (typeof layer.brainDir === 'string' && layer.brainDir) return layer.brainDir;
  if (typeof layer.brainRoot === 'string' && layer.brainRoot) return layer.brainRoot; // legacy alias
  if (typeof layer.agentDir === 'string' && layer.agentDir) {
    return path.join(layer.agentDir, 'skills', 'total-recall');
  }
  return null;
}

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
    const { global: globalBrain, project: projectBrain } = getBothBrains();
    const rules = [];
    const seenVaults = new Set();

    const addRules = (brainDir, scope) => {
      if (!brainDir) return;
      const vaultDir = path.join(brainDir, 'memory-vault');
      const vaultKey = path.resolve(vaultDir);
      // Avoid double-listing when project brainDir incorrectly points at global.
      if (seenVaults.has(vaultKey)) return;
      seenVaults.add(vaultKey);

      let nodes = [];
      try {
        nodes = getNodes(vaultDir) || [];
      } catch (err) {
        logger.warn('rules', 'Failed to load vault nodes', { vaultDir, error: err.message });
        return;
      }

      for (const n of nodes) {
        if (!RULE_CATEGORIES.has(n.category)) continue;
        // Prefer active rules first in natural order; archived still included for restore UI
        rules.push(serializeRule(n, scope));
      }
    };

    addRules(resolveBrainDir(globalBrain), 'global');
    addRules(resolveBrainDir(projectBrain), 'project');

    res.json({ rules, count: rules.length });
  } catch (err) {
    logger.error('rules', 'GET /api/rules failed', { error: err.message, stack: err.stack });
    res.status(500).json({ error: 'Failed to load agent rules', message: err.message });
  }
});
