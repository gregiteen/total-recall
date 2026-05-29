/**
 * dedup.mjs — SHA-256 based deduplication for memory nodes
 *
 * Hashes each node's body content and compares against existing vault
 * nodes to filter out duplicates before writing.
 */

import crypto from 'node:crypto';

/**
 * Compute a SHA-256 hex digest of a string.
 *
 * @param {string} content — The content to hash.
 * @returns {string} Hex-encoded SHA-256 hash.
 */
export function sha256(content) {
  return crypto.createHash('sha256').update(content).digest('hex');
}

/**
 * Build a content fingerprint for a memory node.
 * Uses the body plus key metadata fields so that nodes with
 * identical content but different slugs are still detected as dupes.
 *
 * @param {object} node — An SSSS-compatible memory node object.
 * @returns {string} Hex-encoded SHA-256 hash.
 */
function nodeFingerprint(node) {
  const parts = [
    node.body || '',
    node.title || '',
    node.source?.type || '',
  ];
  return sha256(parts.join('\n'));
}

/**
 * Deduplicate new nodes against existing vault nodes.
 *
 * Hashes each new node's body + metadata and compares against hashes of
 * existing nodes. Returns only nodes that have no matching fingerprint
 * in the existing set.
 *
 * @param {object[]} newNodes — Candidate nodes to ingest.
 * @param {object[]} existingNodes — Already-stored vault nodes.
 * @returns {{ unique: object[], duplicateCount: number }}
 */
export function dedup(newNodes, existingNodes) {
  // Build a set of existing fingerprints
  const existingHashes = new Set();
  for (const node of existingNodes) {
    existingHashes.add(nodeFingerprint(node));
  }

  const unique = [];
  let duplicateCount = 0;

  for (const node of newNodes) {
    const fp = nodeFingerprint(node);
    if (existingHashes.has(fp)) {
      duplicateCount++;
    } else {
      existingHashes.add(fp); // Prevent intra-batch dupes too
      unique.push(node);
    }
  }

  return { unique, duplicateCount };
}
