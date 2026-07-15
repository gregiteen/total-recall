import fs from 'node:fs';
import path from 'node:path';
import { getNodes } from './vault-cache.mjs';

/**
 * Fast, synchronous frontmatter search.
 * Falls back to semantic search if it can't find enough results.
 * 
 * @param {string} query 
 * @param {object} opts 
 * @returns {Array} List of matched nodes (with bodies stubbed or loaded as needed)
 */
export function fastSearch(query, {
  derivedDir,
  vaultDir,
  top_k = 5,
  category = null,
  tags = null,
  modality = null,
  importance = null,
  priority = null
} = {}) {
  const layersPath = path.join(derivedDir, 'memory-layers.jsonl');
  if (!fs.existsSync(layersPath)) return [];

  const content = fs.readFileSync(layersPath, 'utf8');
  const lines = content.split('\n').filter(Boolean);
  const qLower = String(query).toLowerCase();

  const results = [];

  for (const line of lines) {
    try {
      const node = JSON.parse(line);

      // Apply exact filters
      if (category && node.category !== category) continue;
      if (modality && node.modality !== modality) continue;
      if (priority && node.priority !== priority) continue;
      if (importance && (node.importance || 3) < parseInt(importance, 10)) continue;
      if (tags && tags.length > 0) {
        if (!node.tags || !tags.some(t => node.tags.includes(t))) continue;
      }

      // Fast text matching
      let score = 0;
      const slug = String(node.slug || '').toLowerCase();
      const title = String(node.title || '').toLowerCase();
      const nodeTags = Array.isArray(node.tags) ? node.tags.map(t => String(t).toLowerCase()) : [];

      if (slug === qLower || title === qLower) score = 1.0;
      else if (slug.includes(qLower) || title.includes(qLower)) score = 0.8;
      else if (nodeTags.some(t => t.includes(qLower))) score = 0.7;

      if (score > 0) {
        results.push({ ...node, score, type: 'vault' });
      }
    } catch {
      // Ignore parse errors on individual lines
    }
  }

  results.sort((a, b) => b.score - a.score);
  const topResults = results.slice(0, top_k);

  // Re-hydrate full node body for the UI/CLI from vault cache
  if (topResults.length > 0 && vaultDir) {
    try {
      const allNodes = getNodes(vaultDir);
      for (const res of topResults) {
        const fullNode = allNodes.find(n => n.slug === res.slug);
        if (fullNode) {
          res.body = fullNode.body;
          res.related = fullNode.related;
        }
      }
    } catch {
      // Ignore
    }
  }

  return topResults;
}
