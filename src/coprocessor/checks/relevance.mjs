/**
 * relevance.mjs — Relevance Check (Co-Processor)
 *
 * Extracts the current conversation topic and searches the knowledge
 * graph for relevant memories. Results are formatted for injection
 * into the ACTIVE CONTEXT section of the system prompt.
 *
 * Uses keyword extraction + FTS5 BM25 search — no LLM needed.
 */

import { search as fts5Search } from '../../core/fts5.mjs';

// ─── STOP WORDS ─────────────────────────────────────────────────────────────────

const STOP_WORDS = new Set([
  'the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
  'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could',
  'should', 'may', 'might', 'shall', 'can', 'this', 'that', 'these',
  'those', 'i', 'you', 'he', 'she', 'it', 'we', 'they', 'me', 'him',
  'her', 'us', 'them', 'my', 'your', 'his', 'its', 'our', 'their',
  'what', 'which', 'who', 'whom', 'when', 'where', 'why', 'how',
  'not', 'no', 'nor', 'but', 'and', 'or', 'if', 'then', 'else',
  'for', 'of', 'to', 'in', 'on', 'at', 'by', 'with', 'from', 'up',
  'about', 'into', 'through', 'during', 'before', 'after', 'above',
  'below', 'between', 'out', 'off', 'over', 'under', 'again', 'further',
  'just', 'also', 'so', 'than', 'too', 'very', 'all', 'each', 'every',
  'both', 'few', 'more', 'most', 'other', 'some', 'such', 'only', 'own',
  'same', 'here', 'there', 'now', 'well', 'please', 'yes', 'okay',
  'let', 'make', 'need', 'want', 'get', 'got', 'going', 'think',
  'know', 'see', 'look', 'use', 'like', 'right', 'sure', 'yeah',
]);

// ─── EXTRACT KEYWORDS ───────────────────────────────────────────────────────────

/**
 * Extract meaningful keywords from text for FTS5 search.
 *
 * @param {string} text - Raw conversation text
 * @param {number} [maxKeywords=8] - Maximum keywords to extract
 * @returns {string[]} Array of keywords sorted by relevance
 */
export function extractKeywords(text, maxKeywords = 8) {
  // Tokenize: split on non-alphanumeric, filter stop words and short tokens
  const words = text
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length > 2 && !STOP_WORDS.has(w));

  // Count frequency — more frequent = more relevant
  const freq = {};
  for (const word of words) {
    freq[word] = (freq[word] || 0) + 1;
  }

  // Sort by frequency descending, take top N
  return Object.entries(freq)
    .sort((a, b) => b[1] - a[1])
    .slice(0, maxKeywords)
    .map(([word]) => word);
}

// ─── FIND RELEVANT MEMORIES ─────────────────────────────────────────────────────

/**
 * Search the knowledge base for memories relevant to the current conversation.
 *
 * @param {Object} db - Open SQLite database connection
 * @param {string} text - Combined recent conversation text
 * @param {Object} [options]
 * @param {number} [options.maxResults=5] - Maximum results to return
 * @param {string} [options.preferSource] - Prefer wiki or learning results
 * @returns {Array<{type: string, label: string, text: string, source: string, score: number}>}
 */
export function findRelevantMemories(db, text, { maxResults = 5, preferSource = 'wiki' } = {}) {
  const keywords = extractKeywords(text);
  if (keywords.length === 0) return [];

  const searchTerm = keywords.join(' ');
  const { results, error } = fts5Search(db, searchTerm, { limit: maxResults * 2 });

  if (error || !results || results.length === 0) return [];

  // Prioritize wiki nodes over raw learnings (more structured)
  const sorted = results.sort((a, b) => {
    if (a.source === preferSource && b.source !== preferSource) return -1;
    if (b.source === preferSource && a.source !== preferSource) return 1;
    return a.rank - b.rank; // Lower rank = better match in FTS5
  });

  return sorted.slice(0, maxResults).map(r => {
    // Determine alert type based on category
    const type = r.category === 'anti-pattern' ? 'caution'
      : r.category === 'pattern' || r.category === 'preference' ? 'tip'
      : r.category === 'concept' ? 'important'
      : 'note';

    // Clean up snippet
    const snippet = (r.snippet || r.title || '')
      .replace(/→/g, '**')
      .replace(/←/g, '**')
      .replace(/\n/g, ' ')
      .trim();

    return {
      type,
      label: 'Relevant Memory',
      text: snippet || r.title,
      source: r.source,
      sourceId: r.source_id,
      score: Math.abs(r.rank || 0),
    };
  });
}
