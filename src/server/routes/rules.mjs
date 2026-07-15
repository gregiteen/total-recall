import express from 'express';
import { getBothBrains } from '../../cli/agent-dir.mjs';
import { getNodes } from '../../core/vault-cache.mjs';

import path from 'node:path';

export const rulesRouter = express.Router();

rulesRouter.get('/api/rules', (req, res) => {
  const { global: globalBrain, project: projectBrain } = getBothBrains();
  
  const rules = [];

  const addRules = (brainDir, scope) => {
    if (!brainDir) return;
    const vaultDir = path.join(brainDir, 'memory-vault');
    const nodes = getNodes(vaultDir);
    const validCategories = new Set(['invariants', 'preferences', 'anti-patterns']);
    
    nodes.filter(n => validCategories.has(n.category)).forEach(n => {
      rules.push({
        ...n,
        scope
      });
    });
  };

  addRules(globalBrain?.brainRoot, 'global');
  addRules(projectBrain?.brainRoot, 'project');

  res.json({ rules });
});
