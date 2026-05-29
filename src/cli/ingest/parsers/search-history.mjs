/**
 * search-history.mjs — Parse Google Search history from Takeout export
 *
 * Reads JSON files from "My Activity/Search/" and extracts search queries,
 * grouping related searches into SSSS-compatible memory nodes.
 */

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { collectFiles } from '../utils/takeout-walker.mjs';

/**
 * Extract the raw search query from a Takeout search entry title.
 * Takeout entries typically use "Searched for <query>" format.
 *
 * @param {string} title — The raw title string from the JSON entry.
 * @returns {string} The extracted search query.
 */
function extractQuery(title) {
  if (!title) return '';
  return title.replace(/^Searched for\s+/i, '').trim();
}

/**
 * Generate a slug-safe string from a query.
 *
 * @param {string} query
 * @returns {string}
 */
function slugify(query) {
  return query
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 50);
}

/**
 * Parse Google Search history from the given directory path.
 *
 * Reads all JSON files under the search history directory. Each file
 * may contain a top-level array of search entries or a single
 * MyActivity.json with nested structure.
 *
 * Each entry typically has: { title, titleUrl, time }
 *
 * @param {string} dirPath — Path to "My Activity/Search/" directory.
 * @param {object} [options]
 * @param {Date} [options.maxAge] — Only include entries newer than this date.
 * @returns {object[]} Array of SSSS-compatible memory node objects.
 */
export function parseSearchHistory(dirPath, options = {}) {
  const jsonFiles = collectFiles(dirPath, ['.json']);
  if (jsonFiles.length === 0) return [];

  const allEntries = [];

  for (const file of jsonFiles) {
    try {
      const raw = fs.readFileSync(file, 'utf8');
      const data = JSON.parse(raw);

      // Takeout exports search history as a top-level array
      const entries = Array.isArray(data) ? data : [];
      allEntries.push(...entries);
    } catch {
      // Skip unparseable files
    }
  }

  // Filter by max age if specified
  const filtered = options.maxAge
    ? allEntries.filter(e => e.time && new Date(e.time) >= options.maxAge)
    : allEntries;

  // Sort by time, most recent first
  filtered.sort((a, b) => {
    const ta = a.time ? new Date(a.time).getTime() : 0;
    const tb = b.time ? new Date(b.time).getTime() : 0;
    return tb - ta;
  });

  // Convert each search entry into an SSSS node
  const nodes = [];
  const seenQueries = new Set();

  for (const entry of filtered) {
    const query = extractQuery(entry.title);
    if (!query || seenQueries.has(query.toLowerCase())) continue;
    seenQueries.add(query.toLowerCase());

    const ts = entry.time ? new Date(entry.time).toISOString() : new Date().toISOString();
    const suffix = crypto.randomBytes(3).toString('hex');
    const slugBase = slugify(query) || 'search';
    const slug = `search-${slugBase}-${suffix}`;

    nodes.push({
      type: 'memory',
      slug,
      title: query,
      category: 'facts',
      body: `Search query: ${query}${entry.titleUrl ? `\nURL: ${entry.titleUrl}` : ''}`,
      status: 'active',
      confidence: 0.7,
      importance: 2,
      created: ts,
      updated: ts,
      last_accessed: ts,
      source: {
        type: 'google-search-history',
        session_id: `takeout-search-${suffix}`,
        evidence_count: 1,
      },
      supersedes: [],
      superseded_by: null,
      contradicts: [],
      tags: ['google-takeout', 'search-history'],
      related: [],
      routes_to_skills: [],
      sentiment_polarity: 'descriptive',
      sentiment_target: query.slice(0, 40),
      modality: 'should',
      subject: 'user',
      predicate: 'searched_for',
      object: query.slice(0, 120),
      decay: { half_life_days: 60, access_count: 0 },
      schema_version: 2,
      x_temporal_context: ts,
      x_citations: entry.titleUrl ? [{
        source: 'google-search',
        title: query,
        url: entry.titleUrl,
        published: ts,
        relevance: 0.8,
        accessed: ts,
      }] : [],
    });
  }

  return nodes;
}
