/**
 * OpenWiki Knowledge Topology & Graph Extractor.
 *
 * Extracts nodes, edges, cross-document links, and architectural relationships
 * across local workspace, all vaults, or remote mesh nodes. Formats to JSON, Mermaid, or DOT.
 */
import fs from 'node:fs';
import { discoverAllHubs, execOnMeshNode } from './mesh-vaults.mjs';
import { extractMarkdownLinks, indexHubsForResolution, resolveLinkTarget } from './markdown-links.mjs';

/**
 * Builds knowledge graph from markdown hubs.
 */
export async function buildKnowledgeGraph({
  allVaults = false,
  node = null,
  format = 'json',
  cwd = process.cwd(),
  nested = true,
} = {}) {
  // If remote mesh node specified, dispatch via mesh
  if (node && node !== 'local' && node !== 'self') {
    const meshRes = execOnMeshNode(node, [
      'graph', ...(allVaults ? ['--all-vaults'] : []), '--format', format, '--json',
    ]);
    if (meshRes.ok) {
      try {
        return JSON.parse(meshRes.stdout);
      } catch {
        throw new Error(`Invalid JSON from mesh node ${node}: ${meshRes.stdout}`);
      }
    } else {
      throw new Error(`Mesh graph failed on node ${node}: ${meshRes.stderr || meshRes.error}`);
    }
  }

  const hubsResult = await discoverAllHubs({ allVaults, cwd, nested });
  const nodes = [];
  const edges = [];
  const nodeById = new Map();
  const nodeByPath = new Map();

  // Create nodes
  for (const hub of hubsResult.hubs) {
    const nodeId = `${hub.repoName}:${hub.fileName.replace(/\.md$/, '')}`;
    const nodeObj = {
      id: nodeId,
      label: hub.title || hub.fileName,
      fileName: hub.fileName,
      repoName: hub.repoName,
      path: hub.path,
      lines: hub.lines,
      size_bytes: hub.size_bytes,
      inDegree: 0,
      outDegree: 0,
    };
    nodes.push(nodeObj);
    nodeById.set(nodeId, nodeObj);
    nodeByPath.set(hub.path, nodeObj);
  }

  const index = indexHubsForResolution(hubsResult.hubs);

  // Extract edges
  for (const hub of hubsResult.hubs) {
    let content;
    try {
      content = fs.readFileSync(hub.path, 'utf8');
    } catch {
      continue;
    }

    const sourceId = `${hub.repoName}:${hub.fileName.replace(/\.md$/, '')}`;
    const sourceNode = nodeById.get(sourceId);
    const { markdownLinks, wikilinks } = extractMarkdownLinks(content);

    for (const link of markdownLinks) {
      if (!link.target.endsWith('.md')) continue;
      const resolved = resolveLinkTarget(hub, link.target, index, { isWikilink: false });
      const targetNode = resolved.hub ? nodeByPath.get(resolved.hub.path) : null;
      if (targetNode && targetNode.id !== sourceId) {
        edges.push({
          from: sourceId,
          to: targetNode.id,
          label: link.text.length > 30 ? link.text.slice(0, 27) + '...' : link.text,
          type: 'markdown-link',
        });
        if (sourceNode) sourceNode.outDegree++;
        targetNode.inDegree++;
      }
    }

    for (const link of wikilinks) {
      const resolved = resolveLinkTarget(hub, link.target, index, { isWikilink: true });
      const targetNode = resolved.hub ? nodeByPath.get(resolved.hub.path) : null;
      if (targetNode && targetNode.id !== sourceId) {
        edges.push({
          from: sourceId,
          to: targetNode.id,
          label: link.anchor.length > 30 ? link.anchor.slice(0, 27) + '...' : link.anchor,
          type: 'wikilink',
        });
        if (sourceNode) sourceNode.outDegree++;
        targetNode.inDegree++;
      }
    }
  }

  // Deduplicate edges
  const edgeKeySet = new Set();
  const dedupedEdges = [];
  for (const edge of edges) {
    const key = `${edge.from}->${edge.to}`;
    if (!edgeKeySet.has(key)) {
      edgeKeySet.add(key);
      dedupedEdges.push(edge);
    }
  }

  // Identify orphans (disconnected nodes)
  const orphans = nodes.filter((n) => n.inDegree === 0 && n.outDegree === 0).map((n) => n.id);

  const payload = {
    ok: true,
    scope: hubsResult.scope,
    counts: {
      nodes: nodes.length,
      edges: dedupedEdges.length,
      orphans: orphans.length,
    },
    nodes,
    edges: dedupedEdges,
    orphans,
  };

  if (format === 'mermaid') {
    payload.mermaid = generateMermaidDiagram(nodes, dedupedEdges);
  } else if (format === 'dot') {
    payload.dot = generateDotDiagram(nodes, dedupedEdges);
  }

  return payload;
}

function sanitizeId(id) {
  return id.replace(/[^a-zA-Z0-9_]/g, '_');
}

export function generateMermaidDiagram(nodes, edges) {
  const lines = ['flowchart TD'];
  for (const node of nodes) {
    const cleanId = sanitizeId(node.id);
    const cleanLabel = (node.label || node.fileName).replace(/["[\]()]/g, '');
    lines.push(`  ${cleanId}["${cleanLabel}"]`);
  }
  for (const edge of edges) {
    const fromId = sanitizeId(edge.from);
    const toId = sanitizeId(edge.to);
    if (edge.label && edge.label !== edge.to) {
      const cleanEdgeLabel = edge.label.replace(/["[\]()]/g, '');
      lines.push(`  ${fromId} -->|"${cleanEdgeLabel}"| ${toId}`);
    } else {
      lines.push(`  ${fromId} --> ${toId}`);
    }
  }
  return lines.join('\n');
}

export function generateDotDiagram(nodes, edges) {
  const lines = ['digraph OpenWikiGraph {', '  rankdir=LR;', '  node [shape=box, style=rounded, fontname="Helvetica"];'];
  for (const node of nodes) {
    const cleanId = sanitizeId(node.id);
    const cleanLabel = (node.label || node.fileName).replace(/"/g, '\\"');
    lines.push(`  ${cleanId} [label="${cleanLabel}"];`);
  }
  for (const edge of edges) {
    const fromId = sanitizeId(edge.from);
    const toId = sanitizeId(edge.to);
    lines.push(`  ${fromId} -> ${toId};`);
  }
  lines.push('}');
  return lines.join('\n');
}
