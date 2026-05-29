/**
 * youtube-history.mjs — Parse YouTube watch history from Takeout export
 *
 * Reads JSON files from "YouTube and YouTube Music/history/" and converts
 * video watch entries into SSSS-compatible memory nodes, grouping by channel.
 */

import fs from 'node:fs';
import crypto from 'node:crypto';
import { collectFiles } from '../utils/takeout-walker.mjs';

/**
 * Generate a slug-safe string from text.
 *
 * @param {string} text
 * @returns {string}
 */
function slugify(text) {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 50);
}

/**
 * Extract the video title from a Takeout entry.
 * YouTube entries use "Watched <title>" format.
 *
 * @param {string} title
 * @returns {string}
 */
function extractVideoTitle(title) {
  if (!title) return '';
  return title.replace(/^Watched\s+/i, '').trim();
}

/**
 * Extract channel name from a Takeout entry's subtitles array.
 *
 * @param {object} entry — A YouTube history entry.
 * @returns {string}
 */
function extractChannel(entry) {
  if (entry.subtitles && Array.isArray(entry.subtitles)) {
    for (const sub of entry.subtitles) {
      if (sub.name) return sub.name;
    }
  }
  return 'Unknown Channel';
}

/**
 * Extract YouTube video URL from a Takeout entry.
 *
 * @param {object} entry
 * @returns {string|null}
 */
function extractVideoUrl(entry) {
  return entry.titleUrl || null;
}

/**
 * Parse YouTube watch history from the given directory path.
 *
 * Each entry in the JSON has:
 * - title: "Watched <video title>"
 * - titleUrl: YouTube video URL
 * - subtitles: [{ name: "Channel Name", url: "..." }]
 * - time: ISO 8601 timestamp
 * - products: ["YouTube"]
 * - activityControls: [...]
 *
 * @param {string} dirPath — Path to "YouTube and YouTube Music/history/" directory.
 * @param {object} [options]
 * @param {Date} [options.maxAge] — Only include entries newer than this date.
 * @returns {object[]} Array of SSSS-compatible memory node objects.
 */
export function parseYoutubeHistory(dirPath, options = {}) {
  const jsonFiles = collectFiles(dirPath, ['.json']);
  if (jsonFiles.length === 0) return [];

  const allEntries = [];

  for (const file of jsonFiles) {
    try {
      const raw = fs.readFileSync(file, 'utf8');
      const data = JSON.parse(raw);
      const entries = Array.isArray(data) ? data : [];
      allEntries.push(...entries);
    } catch {
      // Skip unparseable files
    }
  }

  // Filter out entries without titles (ads, etc.) and apply max age filter
  const filtered = allEntries.filter(e => {
    if (!e.title) return false;
    // Skip ad-related entries
    if (e.title === 'Visited YouTube' || e.title.startsWith('Searched for')) return false;
    if (options.maxAge && e.time && new Date(e.time) < options.maxAge) return false;
    return true;
  });

  // Sort by time, most recent first
  filtered.sort((a, b) => {
    const ta = a.time ? new Date(a.time).getTime() : 0;
    const tb = b.time ? new Date(b.time).getTime() : 0;
    return tb - ta;
  });

  // Convert each watch entry to an SSSS node
  const nodes = [];
  const seenUrls = new Set();

  for (const entry of filtered) {
    const videoTitle = extractVideoTitle(entry.title);
    if (!videoTitle) continue;

    const url = extractVideoUrl(entry);
    // Deduplicate by URL within this batch
    if (url && seenUrls.has(url)) continue;
    if (url) seenUrls.add(url);

    const channel = extractChannel(entry);
    const ts = entry.time ? new Date(entry.time).toISOString() : new Date().toISOString();
    const suffix = crypto.randomBytes(3).toString('hex');
    const slugBase = slugify(videoTitle) || 'youtube';
    const slug = `youtube-${slugBase}-${suffix}`;

    const channelTag = channel
      ? channel.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
      : '';
    const tags = ['google-takeout', 'youtube-history'];
    if (channelTag) tags.push(channelTag);

    nodes.push({
      type: 'memory',
      slug,
      title: videoTitle,
      category: 'facts',
      body: `Video: ${videoTitle}\nChannel: ${channel}${url ? `\nURL: ${url}` : ''}\nWatched: ${ts}`,
      status: 'active',
      confidence: 0.7,
      importance: 2,
      created: ts,
      updated: ts,
      last_accessed: ts,
      source: {
        type: 'youtube-history',
        session_id: `takeout-youtube-${suffix}`,
        evidence_count: 1,
      },
      supersedes: [],
      superseded_by: null,
      contradicts: [],
      tags,
      related: [],
      routes_to_skills: [],
      sentiment_polarity: 'descriptive',
      sentiment_target: videoTitle.slice(0, 40),
      modality: 'should',
      subject: 'user',
      predicate: 'watched',
      object: videoTitle.slice(0, 120),
      decay: { half_life_days: 60, access_count: 0 },
      schema_version: 2,
      x_temporal_context: ts,
      x_citations: url ? [{
        source: 'youtube',
        title: videoTitle,
        url,
        published: ts,
        relevance: 0.8,
        accessed: ts,
      }] : [],
    });
  }

  return nodes;
}
