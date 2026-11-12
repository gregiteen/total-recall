/**
 * OpenWiki Evidence Search & Query Engine.
 *
 * Searches knowledge hubs across local workspace, all registered project vaults,
 * or remote mesh nodes. Extracts evidence passages and linked concepts.
 */
import fs from 'node:fs';
import path from 'node:path';
import { discoverAllHubs, execOnMeshNode } from './mesh-vaults.mjs';

const TASK_STOP_WORDS = new Set('the and for from with this that task implement should into through using before after all can how what does'.split(' '));
export function wikiTaskTerms(text) {
  const words = String(text).replace(/([a-z\d])([A-Z])/g, '$1 $2').toLowerCase().match(/[\p{L}\p{N}]{3,}/gu) || [];
  return [...new Set(words.filter(word => !TASK_STOP_WORDS.has(word)))];
}

export function wikiBodyStart(lines) {
  if (lines[0]?.trim() !== '---') return 0;
  const end = lines.findIndex((line, index) => index > 0 && /^(---|\.\.\.)\s*$/.test(line));
  return end < 0 ? 0 : end + 1;
}

/**
 * Searches for query terms across markdown files.
 */
export async function searchWikiHubs(query, {
  allVaults = false,
  node = null,
  limit = 20,
  cwd = process.cwd(),
  exactTerms = false,
} = {}) {
  if (!query || typeof query !== 'string' || !query.trim()) {
    throw new Error('Search query must be a non-empty string');
  }

  // If remote mesh node specified, dispatch via mesh
  if (node && node !== 'local' && node !== 'self') {
    const meshRes = execOnMeshNode(node, [
      'search', query, ...(allVaults ? ['--all-vaults'] : []), '--limit', String(limit), '--json',
    ]);
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

  const hubsResult = await discoverAllHubs({ allVaults, cwd, nested: exactTerms });
  const rawTerms = query.toLowerCase().split(/\s+/).filter(Boolean);
  const terms = exactTerms ? wikiTaskTerms(query) : rawTerms.map(term => term.replace(/[^\w-]/g, '')).filter(Boolean);

  const matches = [];

  for (const hub of hubsResult.hubs) {
    let content;
    try {
      content = fs.readFileSync(hub.path, 'utf8');
    } catch {
      continue;
    }

    const lines = content.split('\n');
    const firstLine = exactTerms ? wikiBodyStart(lines) : 0;
    let currentHeading = hub.title;

    for (let i = firstLine; i < lines.length; i++) {
      const line = lines[i];
      if (exactTerms && line.trimStart().startsWith('<!--')) continue;
      const headingMatch = line.match(/^#{1,6}\s+(.+)$/);
      if (headingMatch) {
        currentHeading = headingMatch[1].trim();
      }

      const lowerLine = line.toLowerCase();
      const anchorTerms = exactTerms ? new Set(wikiTaskTerms(line)) : null;
      let termHits = 0;
      for (const term of terms) {
        if (anchorTerms ? anchorTerms.has(term) : lowerLine.includes(term)) termHits++;
      }

      if (termHits > 0) {
        // Build surrounding snippet (1 line before, matched line, 1 line after)
        const start = Math.max(firstLine, i - 1);
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

        // General search suppresses overlapping snippets. Task retrieval needs
        // each anchor so a stronger adjacent match can supply its source links.
        if (!exactTerms) i += 1;
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
