import fs from 'fs';
import path from 'path';
import crypto from 'node:crypto';
import { loadNodes } from './vault.mjs';

/**
 * SSSS Drift Detector
 *
 * Implements §10 of the SSSS spec (Derived Artifacts).
 * Detects discrepancies between the canonical Markdown vault and
 * derived disposable projections (e.g., graph-index.jsonl).
 */

/**
 * Compare two simple objects for equality on a specific set of keys.
 */
function propertiesMatch(a, b, keys) {
  for (const key of keys) {
    if (a[key] !== b[key]) return false;
  }
  return true;
}

/**
 * Scan for drift between the vault and the graph index.
 * 
 * @param {string} vaultDir - Path to the memory-vault directory.
 * @param {string} derivedDir - Path to the memory-derived directory.
 * @returns {{ drifted: boolean, missing_in_index: string[], stale_in_index: string[], missing_in_vault: string[] }}
 */
export function detectIndexDrift(vaultDir, derivedDir) {
  const result = {
    drifted: false,
    missing_in_index: [],
    stale_in_index: [],
    missing_in_vault: []
  };

  const graphIndexPath = path.join(derivedDir, 'graph-index.jsonl');
  
  if (!fs.existsSync(graphIndexPath)) {
    // No index means total drift
    result.drifted = true;
    return result;
  }

  // Load canonical nodes
  const nodes = loadNodes(vaultDir);
  const canonicalMap = new Map();
  for (const node of nodes) {
    canonicalMap.set(node.slug, node);
  }

  // Load derived index
  const indexMap = new Map();
  try {
    const lines = fs.readFileSync(graphIndexPath, 'utf8').trim().split('\n');
    for (const line of lines) {
      if (!line) continue;
      const entry = JSON.parse(line);
      indexMap.set(entry.slug, entry);
    }
  } catch (err) {
    // Malformed index is total drift
    result.drifted = true;
    return result;
  }

  const keysToCheck = ['title', 'category', 'status', 'confidence'];

  // Check for missing or stale entries in the index
  for (const [slug, canonicalNode] of canonicalMap.entries()) {
    const indexEntry = indexMap.get(slug);
    if (!indexEntry) {
      result.missing_in_index.push(slug);
      result.drifted = true;
    } else {
      if (!propertiesMatch(canonicalNode, indexEntry, keysToCheck)) {
        result.stale_in_index.push(slug);
        result.drifted = true;
      }
    }
  }

  // Check for ghost entries in the index (exist in index but not in vault)
  for (const slug of indexMap.keys()) {
    if (!canonicalMap.has(slug)) {
      result.missing_in_vault.push(slug);
      result.drifted = true;
    }
  }

  return result;
}

/**
 * Verify event log append-only invariant.
 * Checks that the event log file is well-formed JSONL and strictly temporally ordered.
 */
export function checkEventLogIntegrity(eventLogPath) {
  if (!fs.existsSync(eventLogPath)) {
    return { ok: true, reason: 'Log does not exist' };
  }

  try {
    const lines = fs.readFileSync(eventLogPath, 'utf8').trim().split('\n');
    let lastTs = null;
    let lineNum = 0;
    
    for (const line of lines) {
      lineNum++;
      if (!line) continue;
      const event = JSON.parse(line);
      
      if (!event.ts) {
        return { ok: false, error: `Missing timestamp on line ${lineNum}` };
      }
      
      const currentTs = new Date(event.ts).getTime();
      if (isNaN(currentTs)) {
        return { ok: false, error: `Invalid timestamp '${event.ts}' on line ${lineNum}` };
      }
      
      if (lastTs !== null && currentTs < lastTs) {
        return { ok: false, error: `Temporal violation on line ${lineNum}: ${event.ts} is before previous event.` };
      }
      
      lastTs = currentTs;
    }
    
    return { ok: true, events_checked: lineNum };
  } catch (err) {
    return { ok: false, error: `Parse failure: ${err.message}` };
  }
}
