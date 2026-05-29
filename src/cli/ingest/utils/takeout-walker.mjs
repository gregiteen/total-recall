/**
 * takeout-walker.mjs — Walk a Google Takeout directory and detect available data types
 *
 * Recursively checks for known Takeout subdirectory signatures and returns
 * which data sources are present along with their resolved paths.
 */

import fs from 'node:fs';
import path from 'node:path';

/**
 * Known Takeout data type signatures.
 * Each entry maps a type name to one or more directory path fragments
 * (relative to the Takeout root) that indicate the data is present.
 */
const TAKEOUT_SIGNATURES = [
  {
    type: 'search-history',
    /** Google Search history lives under "My Activity/Search/" */
    paths: ['My Activity/Search'],
  },
  {
    type: 'chrome-bookmarks',
    /** Chrome bookmarks can be in "Chrome/Bookmarks.html" or "Chrome/Bookmarks.json" */
    paths: ['Chrome'],
  },
  {
    type: 'google-keep',
    /** Google Keep notes are exported under "Keep/" */
    paths: ['Keep'],
  },
  {
    type: 'youtube-history',
    /** YouTube watch history under "YouTube and YouTube Music/history/" */
    paths: ['YouTube and YouTube Music/history'],
  },
];

/**
 * Walk a Google Takeout root directory and return which data types are present.
 *
 * The function checks for the existence of known subdirectory signatures
 * inside `rootPath`. Some Takeout exports nest everything under a top-level
 * "Takeout/" directory — we handle that transparently.
 *
 * @param {string} rootPath — Absolute path to the Takeout export root.
 * @returns {{ type: string, path: string }[]} Array of detected data sources.
 */
export function walkTakeoutDir(rootPath) {
  if (!fs.existsSync(rootPath)) {
    throw new Error(`Takeout directory does not exist: ${rootPath}`);
  }

  const stat = fs.statSync(rootPath);
  if (!stat.isDirectory()) {
    throw new Error(`Not a directory: ${rootPath}`);
  }

  // Some exports nest everything under a "Takeout/" subdirectory.
  const nestedTakeout = path.join(rootPath, 'Takeout');
  const effectiveRoot = fs.existsSync(nestedTakeout) && fs.statSync(nestedTakeout).isDirectory()
    ? nestedTakeout
    : rootPath;

  const detected = [];

  for (const sig of TAKEOUT_SIGNATURES) {
    for (const relPath of sig.paths) {
      const fullPath = path.join(effectiveRoot, relPath);
      if (fs.existsSync(fullPath) && fs.statSync(fullPath).isDirectory()) {
        detected.push({ type: sig.type, path: fullPath });
        break; // Only add each type once
      }
    }
  }

  return detected;
}

/**
 * Recursively collect all files matching given extensions within a directory.
 *
 * @param {string} dir — Directory to search.
 * @param {string[]} extensions — File extensions to include (e.g. ['.json', '.html']).
 * @returns {string[]} Array of absolute file paths.
 */
export function collectFiles(dir, extensions) {
  const results = [];
  if (!fs.existsSync(dir)) return results;

  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...collectFiles(fullPath, extensions));
    } else if (extensions.some(ext => entry.name.endsWith(ext))) {
      results.push(fullPath);
    }
  }
  return results;
}
