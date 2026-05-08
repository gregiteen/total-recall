/**
 * graph.mjs — Instruction Graph Engine (Total Recall Phase 19)
 *
 * Handles graph building, community detection, node synthesis,
 * subgraph traversal, and conflict detection.
 */

import { spawnSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { slugify, parseFrontmatter, walkMarkdown } from './utils.mjs';
import { getAdapter } from '../agents/adapters/index.mjs';

// ─── GRAPH BUILDING ────────────────────────────────────────────────────────────

/**
 * Rebuilds the instruction graph from wiki nodes.
 * 
 * @param {object} db - SQLite database handle.
 * @param {object} paths - Resolved paths.
 * @param {object} config - Total Recall config.
 */
export async function rebuildGraph(db, paths, config, { deterministic = false } = {}) {
  console.log('🏗️  Rebuilding Instruction Graph...');
  
  // 1. Clear existing graph data
  db.exec('DELETE FROM graph_nodes');
  db.exec('DELETE FROM graph_metadata');
  
  const wikiFiles = walkMarkdown(paths.wikiDir);
  const clusters = detectClusters(wikiFiles);
  
  let nodeCount = 0;
  let llmFailed = false;

  for (const [clusterId, files] of Object.entries(clusters)) {
    let node = null;
    
    // Try LLM synthesis first, fall back to deterministic extraction
    if (!deterministic && !llmFailed) {
      try {
        node = await synthesizeNode(clusterId, files, config);
      } catch (err) {
        console.warn(`  \u26a0\ufe0f LLM synthesis failed: ${err.message}. Switching to deterministic mode.`);
        llmFailed = true;
      }
    }
    
    if (!node) {
      node = synthesizeNodeDeterministic(clusterId, files);
    }
    
    if (node) {
      insertGraphNode(db, node);
      nodeCount++;
    }
  }
  
  // 2. Infer edges between synthesized nodes
  const edges = await inferEdges(db, config);
  for (const edge of edges) {
    insertGraphEdge(db, edge);
  }
  
  // 3. Update metadata
  db.prepare('INSERT INTO graph_metadata (key, value) VALUES (?, ?)').run('last_rebuild', new Date().toISOString());
  db.prepare('INSERT INTO graph_metadata (key, value) VALUES (?, ?)').run('node_count', nodeCount.toString());
  
  return { nodeCount, edgeCount: edges.length };
}

/**
 * Groups wiki files into clusters based on directory and filename.
 */
function detectClusters(files) {
  const clusters = {};
  for (const file of files) {
    const dir = path.dirname(file);
    const category = path.basename(dir);
    // Simple heuristic: cluster by category + first 5 chars of slug
    const slug = slugify(path.basename(file));
    const clusterId = `${category}:${slug.slice(0, 5)}`;
    
    if (!clusters[clusterId]) clusters[clusterId] = [];
    clusters[clusterId].push(file);
  }
  return clusters;
}

/**
 * Distills a cluster of .md files into a single graph node using an LLM.
 */
async function synthesizeNode(clusterId, files, config) {
  const contents = files.map(f => {
    const raw = fs.readFileSync(f, 'utf-8');
    const { meta, body } = parseFrontmatter(raw);
    return `File: ${path.basename(f)}\nType: ${meta.type}\nContent: ${body}`;
  }).join('\n\n---\n\n');

  const prompt = `You are the Instruction Graph Synthesizer. Distill these rules into ONE coherent graph node.

## INPUT RULES
${contents}

## TASK
Create a single synthesized instruction node that covers all these rules.
Determine the most appropriate subgraph: 'qa-mode' (for questions), 'exec-mode' (for directives), or 'shared' (always).

## OUTPUT FORMAT (JSON ONLY)
{
  "slug": "unique-kebab-case-slug",
  "meaning": "The distilled instruction text",
  "condition": { "mode": ["answer", "execute", "discuss", "emergency"], "keywords": [] },
  "action_type": "inject",
  "priority": 5,
  "node_type": "conditional",
  "subgraph": "shared|qa-mode|exec-mode"
}`;

  const result = callAgentSync(config.agents.archivist, prompt);
  try {
    const jsonMatch = result.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const node = JSON.parse(jsonMatch[0]);
      node.weight = files.length;
      node.source_files = JSON.stringify(files.map(f => path.basename(f)));
      return node;
    }
  } catch (e) {
    console.error(`Failed to parse synthesized node for ${clusterId}:`, e.message);
  }
  return null;
}

/**
 * Deterministic fallback: extracts graph nodes directly from YAML frontmatter
 * and alert blocks without requiring an LLM call.
 */
function synthesizeNodeDeterministic(clusterId, files) {
  // Read the first (or only) file in the cluster
  const fp = files[0];
  const raw = fs.readFileSync(fp, 'utf-8');
  const { meta, body } = parseFrontmatter(raw);
  const slug = slugify(path.basename(fp));

  // Extract meaning from alert block or title
  const alertMatch = body.match(/>\s*\[!(CAUTION|TIP|IMPORTANT|NOTE)\]\s*\n((?:>\s*.+\n?)+)/);
  let meaning;
  if (alertMatch) {
    meaning = alertMatch[2]
      .split('\n')
      .map(l => l.replace(/^>\s*/, '').trim())
      .filter(l => l.length > 0)
      .join(' ');
  } else {
    const titleMatch = body.match(/^#\s+(.+)/m);
    meaning = titleMatch ? titleMatch[1].trim() : body.slice(0, 200).trim();
  }

  if (!meaning || meaning.length < 5) return null;

  // Derive action_type and node_type from frontmatter
  const type = meta.type || 'concept';
  const sentiment = meta.sentiment || 'neutral';
  const action_type = (type === 'anti-pattern' || sentiment === 'negative') ? 'suppress' : 'inject';
  const intensity = meta.sentiment_intensity || 5;
  const node_type = intensity >= 8 ? 'absolute-invariant' : 'conditional';

  return {
    slug,
    meaning,
    condition: JSON.stringify({}),
    action_type,
    weight: files.length,
    priority: intensity,
    node_type,
    subgraph: 'shared',
    source_files: JSON.stringify(files.map(f => path.basename(f))),
  };
}

// ─── SUBGRAPH TRAVERSAL ────────────────────────────────────────────────────────

/**
 * Traverses the graph to find rules relevant to the current mode.
 */
export function traverseSubgraph(db, mode, { budget = 2000 } = {}) {
  // 1. Get absolute invariants and nodes matching the current mode
  const nodes = db.prepare(`
    SELECT * FROM graph_nodes 
    WHERE node_type = 'absolute-invariant' 
       OR subgraph = 'shared'
       OR subgraph = ?
    ORDER BY priority DESC, weight DESC
  `).all(mode);

  const selected = [];
  let currentTokens = 0;

  for (const node of nodes) {
    // Basic token estimation: 4 chars per token
    const estimatedTokens = (node.meaning.length + node.slug.length) / 4;
    if (currentTokens + estimatedTokens > budget) break;
    
    selected.push(node);
    currentTokens += estimatedTokens;
  }

  return selected;
}

// ─── CONFLICT DETECTION ─────────────────────────────────────────────────────────

/**
 * Identifies conflicting rules in a set of nodes.
 */
export function detectConflicts(db, nodeSlugs) {
  if (nodeSlugs.length === 0) return [];

  const placeholders = nodeSlugs.map(() => '?').join(',');
  const query = `
    SELECT * FROM wiki_edges 
    WHERE edge_type = 'conflicts-with'
      AND source_slug IN (${placeholders})
      AND target_slug IN (${placeholders})
  `;

  return db.prepare(query).all(...nodeSlugs, ...nodeSlugs);
}

// ─── HELPERS ────────────────────────────────────────────────────────────────────

function insertGraphNode(db, node) {
  const stmt = db.prepare(`
    INSERT INTO graph_nodes (slug, meaning, condition, action_type, weight, priority, node_type, subgraph, source_files)
    VALUES (@slug, @meaning, @condition, @action_type, @weight, @priority, @node_type, @subgraph, @source_files)
    ON CONFLICT(slug) DO UPDATE SET
      meaning = excluded.meaning,
      weight = excluded.weight,
      updated_at = datetime('now')
  `);
  
  stmt.run({
    slug: node.slug,
    meaning: node.meaning,
    condition: JSON.stringify(node.condition || {}),
    action_type: node.action_type || 'inject',
    weight: node.weight || 1,
    priority: node.priority || 5,
    node_type: node.node_type || 'conditional',
    subgraph: node.subgraph || 'shared',
    source_files: node.source_files || '[]'
  });
}

function insertGraphEdge(db, edge) {
  db.prepare(`
    INSERT OR IGNORE INTO wiki_edges (source_slug, target_slug, edge_type)
    VALUES (?, ?, ?)
  `).run(edge.source, edge.target, edge.type);
}

export async function inferEdges(db, config) {
  const nodes = db.prepare('SELECT slug, meaning, action_type FROM graph_nodes').all();
  const edges = [];

  // Extract significant keywords (>4 chars) from each node's meaning
  const nodeKeywords = nodes.map(node => {
    const words = new Set(
      node.meaning.toLowerCase()
        .split(/\s+/)
        .filter(w => w.length > 4)
        .map(w => w.replace(/[^a-z]/g, ''))
        .filter(w => w.length > 4)
    );
    return { slug: node.slug, words, action_type: node.action_type };
  });

  for (let i = 0; i < nodeKeywords.length; i++) {
    for (let j = i + 1; j < nodeKeywords.length; j++) {
      const a = nodeKeywords[i];
      const b = nodeKeywords[j];
      const intersection = [...a.words].filter(w => b.words.has(w));
      const union = new Set([...a.words, ...b.words]);

      if (union.size === 0) continue;
      const jaccard = intersection.length / union.size;

      if (jaccard >= 0.15) {
        // Determine edge type based on action_type compatibility
        const edgeType = (a.action_type !== b.action_type) ? 'conflicts-with' : 'related-to';
        edges.push({ source: a.slug, target: b.slug, type: edgeType });
      }
    }
  }

  return edges;
}

/**
 * Synchronous LLM call via CLI agent.
 */
function callAgentSync(agentConfig, prompt) {
  const adapter = getAdapter(agentConfig.binary);
  const args = adapter.buildArgs(prompt, agentConfig.model);
  
  const result = spawnSync(adapter.bin, args, {
    encoding: 'utf-8',
    env: { ...process.env, TERM: 'xterm-256color' },
    timeout: 60000
  });
  
  if (result.status !== 0) {
    console.error(`Agent ${agentConfig.binary} failed:`, result.stderr);
    return '';
  }
  
  return result.stdout;
}
