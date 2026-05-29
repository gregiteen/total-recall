/**
 * google-keep.mjs — Parse Google Keep notes from Takeout export
 *
 * Reads JSON files from the "Keep/" directory and converts each note
 * into an SSSS-compatible memory node. Notes are categorized as 'lore'
 * since they represent the user's own words and thoughts.
 */

import fs from 'node:fs';
import crypto from 'node:crypto';
import { collectFiles } from '../utils/takeout-walker.mjs';

/**
 * Generate a slug-safe string from a title.
 *
 * @param {string} title
 * @returns {string}
 */
function slugify(title) {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 50);
}

/**
 * Convert a Google Keep microsecond timestamp to ISO 8601.
 *
 * @param {number} usec — Timestamp in microseconds since epoch.
 * @returns {string} ISO 8601 datetime string.
 */
function usecToIso(usec) {
  if (!usec || typeof usec !== 'number') return new Date().toISOString();
  return new Date(usec / 1000).toISOString();
}

/**
 * Parse Google Keep notes from the given directory path.
 *
 * Each Keep JSON file represents a single note with fields:
 * - title: Note title
 * - textContent: Note body text
 * - labels: Array of { name: string } label objects
 * - color: Note color
 * - createdTimestampUsec: Creation time in microseconds
 * - userEditedTimestampUsec: Last edit time in microseconds
 * - isTrashed / isArchived: Status flags
 * - listContent: Array of { text, isChecked } for list notes
 *
 * @param {string} dirPath — Path to "Keep/" directory.
 * @param {object} [options]
 * @param {Date} [options.maxAge] — Only include notes newer than this date.
 * @returns {object[]} Array of SSSS-compatible memory node objects.
 */
export function parseGoogleKeep(dirPath, options = {}) {
  const jsonFiles = collectFiles(dirPath, ['.json']);
  if (jsonFiles.length === 0) return [];

  const nodes = [];

  for (const file of jsonFiles) {
    let note;
    try {
      const raw = fs.readFileSync(file, 'utf8');
      note = JSON.parse(raw);
    } catch {
      continue; // Skip unparseable files
    }

    // Skip trashed and archived notes
    if (note.isTrashed || note.isArchived) continue;

    // Build body text from either textContent or listContent
    let bodyText = note.textContent || '';
    if (!bodyText && note.listContent && Array.isArray(note.listContent)) {
      bodyText = note.listContent
        .map(item => `${item.isChecked ? '☑' : '☐'} ${item.text || ''}`)
        .join('\n');
    }

    // Skip empty notes
    if (!bodyText.trim() && !note.title) continue;

    const createdTs = usecToIso(note.createdTimestampUsec);
    const updatedTs = usecToIso(note.userEditedTimestampUsec || note.createdTimestampUsec);

    // Filter by max age
    if (options.maxAge && new Date(createdTs) < options.maxAge) continue;

    const title = note.title || bodyText.slice(0, 80).replace(/\n/g, ' ');
    const suffix = crypto.randomBytes(3).toString('hex');
    const slugBase = slugify(title) || 'keep-note';
    const slug = `keep-${slugBase}-${suffix}`;

    // Extract labels as tags
    const labels = (note.labels || [])
      .map(l => l.name)
      .filter(Boolean)
      .map(l => l.toLowerCase().replace(/[^a-z0-9]+/g, '-'));
    const tags = ['google-takeout', 'google-keep', ...labels];

    nodes.push({
      type: 'memory',
      slug,
      title,
      category: 'lore',
      body: bodyText.trim(),
      status: 'active',
      confidence: 0.9,
      importance: 3,
      created: createdTs,
      updated: updatedTs,
      last_accessed: updatedTs,
      source: {
        type: 'google-keep',
        session_id: `takeout-keep-${suffix}`,
        evidence_count: 1,
      },
      supersedes: [],
      superseded_by: null,
      contradicts: [],
      tags,
      related: [],
      routes_to_skills: [],
      sentiment_polarity: 'descriptive',
      sentiment_target: title.slice(0, 40),
      modality: 'should',
      subject: 'user',
      predicate: 'noted',
      object: title.slice(0, 120),
      decay: { half_life_days: 120, access_count: 0 },
      schema_version: 2,
      x_temporal_context: createdTs,
      x_citations: [{
        source: 'google-keep',
        title,
        url: 'keep://note',
        published: createdTs,
        relevance: 1.0,
        accessed: updatedTs,
      }],
    });
  }

  return nodes;
}
