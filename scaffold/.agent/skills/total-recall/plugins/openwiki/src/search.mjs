/**
 * OpenWiki Evidence Search & Query Engine.
 *
 * Searches knowledge hubs across local workspace, all registered project vaults,
 * or remote mesh nodes. Extracts evidence passages and linked concepts.
 */
import fs from 'node:fs';
import path from 'node:path';
import { discoverAllHubs, execOnMeshNode } from './mesh-vaults.mjs';

/**
 * Searches for query terms across markdown files.
 */
export async function searchWikiHubs(query, {
  allVaults = false,
  node = null,
  limit = 20,
  cwd = process.cwd(),
} = {}) {
  if (!query || typeof query !== 'string' || !query.trim()) {
    throw new Error('Search query must be a non-empty string');
  }

  // If remote mesh node specified, dispatch via mesh
  if (node && node !== 'local' && node !== 'self') {
    const escapedQuery = query.replace(/"/g, '\\"');
    const meshRes = execOnMeshNode(
      node,
      `total-recall openwiki search "${escapedQuery}" ${allVaults ? '--all-vaults' : ''} --json`
    );
    if (meshRes.ok) {
      try {
        return JSON.parse(meshRes.stdout);
      } catch {
        throw new Error(`Invalid JSON from mesh node ${node}: ${meshRes.stdout}`);
      }
    } else {
      throw new Error(`Mesh search failed on node ${node}: ${meshRes.stderr || meshRes.error}`);
    }
  }

  const hubsResult = await discoverAllHubs({ allVaults, cwd });
  const rawTerms = query.toLowerCase().split(/\s+/).filter(Boolean);
  const terms = rawTerms.map((t) => t.replace(/[^\w-]/g, ''));

  const matches = [];

  for (const hub of hubsResult.hubs) {
    let content;
    try {
      content = fs.readFileSync(hub.path, 'utf8');
    } catch {
      continue;
    }

    const lines = content.split('\n');
    let currentHeading = hub.title;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const headingMatch = line.match(/^#{1,6}\s+(.+)$/);
      if (headingMatch) {
        currentHeading = headingMatch[1].trim();
      }

      const lowerLine = line.toLowerCase();
      let termHits = 0;
      for (const term of terms) {
        if (lowerLine.includes(term)) termHits++;
      }

      if (termHits > 0) {
        // Build surrounding snippet (1 line before, matched line, 1 line after)
        const start = Math.max(0, i - 1);
        const end = Math.min(lines.length, i + 2);
        const snippetLines = lines.slice(start, end).map((l) => l.trim()).filter(Boolean);
        const snippet = snippetLines.join(' ');

        // Score: exact full phrase match bonus, heading bonus, multiple term bonus
        let score = termHits * 10;
        if (lowerLine.includes(query.toLowerCase())) score += 30;
        if (headingMatch) score += 20;

        matches.push({
          title: hub.title,
          section: currentHeading,
          fileName: hub.fileName,
          repoName: hub.repoName,
          path: hub.path,
          line: i + 1,
          snippet: snippet.length > 280 ? snippet.slice(0, 277) + '...' : snippet,
          score,
        });

        // Skip forward so overlapping lines don't spam identical snippets
        i += 1;
      }
    }
  }

  // Sort descending by relevance score
  matches.sort((a, b) => b.score - a.score);
  const truncated = matches.slice(0, limit);

  return {
    ok: true,
    query,
    scope: hubsResult.scope,
    totalHubsScanned: hubsResult.count,
    count: truncated.length,
    totalHits: matches.length,
    results: truncated,
  };
}
