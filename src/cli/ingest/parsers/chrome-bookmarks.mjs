/**
 * chrome-bookmarks.mjs — Parse Chrome bookmarks from Takeout export
 *
 * Reads Chrome bookmarks from the Takeout "Chrome/" directory.
 * Supports both JSON format (Chrome/Bookmarks) and HTML format
 * (Chrome/Bookmarks.html) exported by Google Takeout.
 */

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { collectFiles } from '../utils/takeout-walker.mjs';

/**
 * Extract bookmarks from Chrome's JSON bookmark format.
 * The structure nests bookmarks under roots.bookmark_bar / roots.other / roots.synced.
 *
 * @param {object} jsonData — Parsed JSON bookmark file.
 * @returns {{ name: string, url: string, folder: string }[]}
 */
function extractFromJson(jsonData) {
  const bookmarks = [];

  function walk(node, folderPath) {
    if (!node) return;

    if (node.type === 'url' && node.url) {
      bookmarks.push({
        name: node.name || 'Untitled',
        url: node.url,
        folder: folderPath || 'Other',
      });
    }

    if (node.children && Array.isArray(node.children)) {
      const currentFolder = node.name || folderPath;
      for (const child of node.children) {
        walk(child, currentFolder);
      }
    }
  }

  // Chrome bookmarks JSON has a "roots" key with bookmark_bar, other, synced
  const roots = jsonData.roots || jsonData;
  if (roots.bookmark_bar) walk(roots.bookmark_bar, 'Bookmarks Bar');
  if (roots.other) walk(roots.other, 'Other Bookmarks');
  if (roots.synced) walk(roots.synced, 'Mobile Bookmarks');

  // Fallback: if none of the above, try treating the root as a node
  if (bookmarks.length === 0) {
    walk(roots, 'Bookmarks');
  }

  return bookmarks;
}

/**
 * Extract bookmarks from Chrome's HTML export format.
 * Parses <DT><A HREF="url">name</A> patterns and tracks folder hierarchy.
 *
 * @param {string} htmlContent — Raw HTML string.
 * @returns {{ name: string, url: string, folder: string }[]}
 */
function extractFromHtml(htmlContent) {
  const bookmarks = [];
  const folderStack = ['Bookmarks'];

  const lines = htmlContent.split('\n');
  for (const line of lines) {
    const trimmed = line.trim();

    // Detect folder headers: <DT><H3 ...>Folder Name</H3>
    const folderMatch = trimmed.match(/<H3[^>]*>([^<]+)<\/H3>/i);
    if (folderMatch) {
      folderStack.push(folderMatch[1]);
      continue;
    }

    // Detect end of folder list
    if (trimmed === '</DL><p>' || trimmed === '</DL>') {
      if (folderStack.length > 1) folderStack.pop();
      continue;
    }

    // Detect bookmark links: <DT><A HREF="url" ...>name</A>
    const linkMatch = trimmed.match(/<A\s+HREF="([^"]+)"[^>]*>([^<]*)<\/A>/i);
    if (linkMatch) {
      bookmarks.push({
        name: linkMatch[2] || 'Untitled',
        url: linkMatch[1],
        folder: folderStack[folderStack.length - 1] || 'Bookmarks',
      });
    }
  }

  return bookmarks;
}

/**
 * Generate a slug-safe string from a bookmark name.
 *
 * @param {string} name
 * @returns {string}
 */
function slugify(name) {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 50);
}

/**
 * Extract domain from a URL for tagging.
 *
 * @param {string} url
 * @returns {string}
 */
function extractDomain(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return 'unknown';
  }
}

/**
 * Parse Chrome bookmarks from the given directory path.
 *
 * @param {string} dirPath — Path to "Chrome/" directory.
 * @param {object} [options]
 * @returns {object[]} Array of SSSS-compatible memory node objects.
 */
export function parseChromeBookmarks(dirPath, options = {}) {
  let rawBookmarks = [];

  // Try JSON first
  const jsonFiles = collectFiles(dirPath, ['.json']);
  for (const file of jsonFiles) {
    if (path.basename(file).toLowerCase().includes('bookmark')) {
      try {
        const raw = fs.readFileSync(file, 'utf8');
        const data = JSON.parse(raw);
        rawBookmarks.push(...extractFromJson(data));
      } catch {
        // Skip unparseable files
      }
    }
  }

  // Try HTML if no JSON results
  if (rawBookmarks.length === 0) {
    const htmlFiles = collectFiles(dirPath, ['.html']);
    for (const file of htmlFiles) {
      if (path.basename(file).toLowerCase().includes('bookmark')) {
        try {
          const raw = fs.readFileSync(file, 'utf8');
          rawBookmarks.push(...extractFromHtml(raw));
        } catch {
          // Skip unparseable files
        }
      }
    }
  }

  // Convert to SSSS nodes
  const now = new Date().toISOString();
  const nodes = [];
  const seenUrls = new Set();

  for (const bm of rawBookmarks) {
    if (!bm.url || seenUrls.has(bm.url)) continue;
    seenUrls.add(bm.url);

    // Skip internal Chrome URLs
    if (bm.url.startsWith('chrome://') || bm.url.startsWith('chrome-extension://')) continue;

    const suffix = crypto.randomBytes(3).toString('hex');
    const slugBase = slugify(bm.name) || 'bookmark';
    const slug = `bookmark-${slugBase}-${suffix}`;
    const domain = extractDomain(bm.url);
    const folderTag = bm.folder
      ? bm.folder.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
      : '';

    const tags = ['google-takeout', 'chrome-bookmarks'];
    if (folderTag) tags.push(folderTag);

    nodes.push({
      type: 'memory',
      slug,
      title: bm.name,
      category: 'facts',
      body: `Bookmark: ${bm.name}\nURL: ${bm.url}\nFolder: ${bm.folder}\nDomain: ${domain}`,
      status: 'active',
      confidence: 0.9,
      importance: 2,
      created: now,
      updated: now,
      last_accessed: now,
      source: {
        type: 'chrome-bookmarks',
        session_id: `takeout-bookmark-${suffix}`,
        evidence_count: 1,
      },
      supersedes: [],
      superseded_by: null,
      contradicts: [],
      tags,
      related: [],
      routes_to_skills: [],
      sentiment_polarity: 'descriptive',
      sentiment_target: bm.name.slice(0, 40),
      modality: 'should',
      subject: 'user',
      predicate: 'bookmarked',
      object: bm.name.slice(0, 120),
      decay: { half_life_days: 90, access_count: 0 },
      schema_version: 2,
      x_temporal_context: now,
      x_citations: [{
        source: 'chrome-bookmarks',
        title: bm.name,
        url: bm.url,
        published: now,
        relevance: 1.0,
        accessed: now,
      }],
      x_browser_context: {
        url: bm.url,
        domain,
        title: bm.name,
      },
    });
  }

  return nodes;
}
