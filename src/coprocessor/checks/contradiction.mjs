/**
 * contradiction.mjs — Contradiction Check (Co-Processor)
 *
 * Compares claims made by the agent against stored knowledge in the
 * wiki graph and FTS5 index. Detects potential contradictions and
 * generates warning items for ACTIVE CONTEXT injection.
 *
 * Uses keyword extraction + FTS5 search to find potentially
 * conflicting wiki nodes.
 */

import { search as fts5Search } from '../../core/fts5.mjs';
import { extractKeywords } from './relevance.mjs';

// ─── CONTRADICTION INDICATORS ───────────────────────────────────────────────────

const UNCERTAIN_PATTERNS = [
  /\bI\s+think\b/i,
  /\bIIRC\b/i,
  /\bprobably\b/i,
  /\bI\s+believe\b/i,
  /\bif\s+I\s+recall\b/i,
  /\bshould\s+be\b/i,
  /\bmight\s+be\b/i,
  /\bnot\s+(?:sure|certain)\b/i,
];

// ─── DETECT UNCERTAIN CLAIMS ────────────────────────────────────────────────────

/**
 * Check if agent text contains uncertain claims that could be fact-checked.
 *
 * @param {string} text - Agent's response text
 * @returns {Array<{claim: string, pattern: string}>}
 */
export function detectUncertainClaims(text) {
  const claims = [];

  for (const pattern of UNCERTAIN_PATTERNS) {
    const match = text.match(pattern);
    if (match) {
      // Extract the sentence containing the uncertain claim
      const idx = match.index;
      const before = text.lastIndexOf('.', idx);
      const after = text.indexOf('.', idx + match[0].length);
      const sentence = text.slice(
        before !== -1 ? before + 1 : Math.max(0, idx - 80),
        after !== -1 ? after + 1 : Math.min(text.length, idx + 200)
      ).trim();

      if (sentence.length > 15) {
        claims.push({
          claim: sentence.slice(0, 300),
          pattern: pattern.source,
        });
      }
    }
  }

  return claims;
}

// ─── CHECK CONTRADICTIONS ───────────────────────────────────────────────────────

/**
 * Search for stored knowledge that potentially contradicts agent claims.
 *
 * @param {Object} db - Open SQLite database connection
 * @param {string} agentText - Agent's response text
 * @param {Object} [options]
 * @param {number} [options.maxResults=3] - Maximum contradictions to return
 * @returns {Array<{type: string, label: string, text: string, claim: string, wikiNode: string}>}
 */
export function checkContradictions(db, agentText, { maxResults = 3 } = {}) {
  const keywords = extractKeywords(agentText, 6);
  if (keywords.length < 2) return []; // Need meaningful content to check

  const searchTerm = keywords.join(' ');
  const { results, error } = fts5Search(db, searchTerm, { source: 'wiki', limit: 5 });

  if (error || !results || results.length === 0) return [];

  const contradictions = [];

  for (const result of results) {
    // Only flag if the wiki node is an anti-pattern, correction, or has negative sentiment
    const isHighSignal = result.category === 'anti-pattern'
      || result.category === 'preference'
      || (result.snippet && /\b(?:NEVER|CAUTION|WARNING|IMPORTANT)\b/.test(result.snippet));

    if (isHighSignal) {
      const snippet = (result.snippet || result.title || '')
        .replace(/→/g, '**')
        .replace(/←/g, '**')
        .replace(/\n/g, ' ')
        .trim();

      contradictions.push({
        type: 'caution',
        label: 'Potential Contradiction',
        text: `Wiki node "${result.title}" may conflict: ${snippet}`,
        wikiNode: result.source_id,
        score: Math.abs(result.rank || 0),
      });
    }
  }

  return contradictions.slice(0, maxResults);
}
