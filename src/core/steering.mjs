/**
 * steering.mjs — SSSS Conflict Detection Engine (Total Recall)
 *
 * Implements the two-layer conflict detection algorithm from the architecture spec:
 *   Layer 1 — O(1) Ontology Check: exact SPO triple match with opposite modality
 *   Layer 2 — Fuzzy Similarity: Jaccard + Trigram cosine + polarity flip
 *
 * When a conflict is detected, the new node is quarantined in the memory-inbox
 * and a ConflictRecord is written. No existing nodes are ever mutated or deleted
 * automatically — human-in-the-loop resolution is required.
 *
 * Zero workspace-specific references.
 */

import fs from 'fs';
import path from 'path';
import { createRequire } from 'module';
import { atomicWrite, findNodeFile, setStatus, setFrontmatterField, loadNodes } from './vault.mjs';
import {
  STOPWORDS,
  CONFLICT_SIMILARITY_THRESHOLD,
  CONFLICT_NP_OVERLAP_THRESHOLD,
  TRIGRAM_DIM,
} from '../constants/schema.js';

const require = createRequire(import.meta.url);
const matter = require('gray-matter');

// ─── TOKENIZATION ────────────────────────────────────────────────────────────────

/**
 * Tokenize text into a Set of words (lowercase, no punctuation, no stopwords).
 * @param {string} text
 * @returns {Set<string>}
 */
function tokenSet(text) {
  if (!text) return new Set();
  const tokens = text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(t => t.length > 1 && !STOPWORDS.has(t));
  return new Set(tokens);
}

// ─── LAYER 1: ONTOLOGY CHECK (O(1)) ─────────────────────────────────────────────

const OPPOSITE_MODALITY = {
  must:       'must_not',
  must_not:   'must',
  should:     'should_not',
  should_not: 'should',
};

/**
 * O(1) ontology conflict check.
 * Returns true if nodeA and nodeB have the same SPO triple but opposite modality.
 *
 * @param {import('../types/memory.js').MemoryNode} nodeA
 * @param {import('../types/memory.js').MemoryNode} nodeB
 * @returns {boolean}
 */
export function ontologyConflict(nodeA, nodeB) {
  if (
    nodeA.subject === nodeB.subject &&
    nodeA.predicate === nodeB.predicate &&
    nodeA.object === nodeB.object
  ) {
    return OPPOSITE_MODALITY[nodeA.modality] === nodeB.modality;
  }
  return false;
}

// ─── LAYER 2: FUZZY SIMILARITY ───────────────────────────────────────────────────

/**
 * Jaccard similarity between two token sets.
 * @param {Set<string>} setA
 * @param {Set<string>} setB
 * @returns {number} 0..1
 */
export function jaccard(setA, setB) {
  if (setA.size === 0 && setB.size === 0) return 1;
  const intersection = [...setA].filter(t => setB.has(t)).length;
  const union = new Set([...setA, ...setB]).size;
  return union === 0 ? 0 : intersection / union;
}

/**
 * Build a sparse trigram hash vector of dimension `dim`, L2-normalized.
 * @param {string} text
 * @param {number} [dim=TRIGRAM_DIM]
 * @returns {Float32Array}
 */
export function trigramVec(text, dim = TRIGRAM_DIM) {
  const vec = new Float32Array(dim);
  const lower = text.toLowerCase().replace(/[^a-z0-9]/g, ' ');
  const padded = `  ${lower}  `;

  for (let i = 0; i < padded.length - 2; i++) {
    const trigram = padded.slice(i, i + 3);
    let hash = 5381;
    for (let j = 0; j < trigram.length; j++) {
      hash = ((hash << 5) + hash) ^ trigram.charCodeAt(j);
    }
    vec[Math.abs(hash) % dim] += 1;
  }

  // L2-normalize
  const norm = Math.sqrt(vec.reduce((s, v) => s + v * v, 0)) || 1;
  for (let i = 0; i < dim; i++) vec[i] /= norm;

  return vec;
}

/**
 * Cosine similarity between two L2-normalized vectors.
 * @param {Float32Array} vecA
 * @param {Float32Array} vecB
 * @returns {number} 0..1
 */
export function cosine(vecA, vecB) {
  let dot = 0;
  for (let i = 0; i < vecA.length; i++) dot += vecA[i] * vecB[i];
  return Math.max(0, Math.min(1, dot)); // clamp to [0,1]
}

/**
 * Check if two nodes have a polarity flip on the same sentiment target.
 * Requires:
 *   1. Opposite sentiment_polarity (must vs must_not, or vice versa)
 *   2. Jaccard overlap of target NPs ≥ CONFLICT_NP_OVERLAP_THRESHOLD
 *
 * @param {import('../types/memory.js').MemoryNode} nodeA
 * @param {import('../types/memory.js').MemoryNode} nodeB
 * @returns {boolean}
 */
export function polarityFlip(nodeA, nodeB) {
  const OPPOSITE_POLARITY = {
    directive_must:     'directive_must_not',
    directive_must_not: 'directive_must',
  };

  const aOpposite = OPPOSITE_POLARITY[nodeA.sentiment_polarity];
  if (!aOpposite || aOpposite !== nodeB.sentiment_polarity) return false;

  const targetA = tokenSet(nodeA.sentiment_target ?? '');
  const targetB = tokenSet(nodeB.sentiment_target ?? '');
  return jaccard(targetA, targetB) >= CONFLICT_NP_OVERLAP_THRESHOLD;
}

// ─── CONFLICT DETECTOR ───────────────────────────────────────────────────────────

/**
 * Detect conflicts between a new node and a list of existing active nodes.
 *
 * Skips:
 *   - Same slug (can't conflict with itself)
 *   - Non-active nodes (deprecated/superseded don't block new nodes)
 *   - Different category (cross-category conflicts not checked)
 *
 * @param {import('../types/memory.js').MemoryNode} newNode
 * @param {import('../types/memory.js').MemoryNode[]} existingNodes
 * @returns {import('../types/memory.js').ConflictRecord[]}
 */
export function detectConflicts(newNode, existingNodes) {
  const conflicts = [];

  const newTokens = tokenSet(`${newNode.title} ${newNode.body ?? ''}`);
  const newVec = trigramVec(`${newNode.title} ${newNode.body ?? ''}`);
  const now = new Date().toISOString();

  for (const existing of existingNodes) {
    // Skip self, non-active, different category
    if (existing.slug === newNode.slug) continue;
    if (existing.status !== 'active') continue;
    if (existing.category !== newNode.category) continue;

    // Layer 1: O(1) ontology check
    if (ontologyConflict(newNode, existing)) {
      conflicts.push({
        conflict_id: `conflict-${now.slice(0, 10)}-${conflicts.length + 1 .toString().padStart(3, '0')}`,
        status: 'pending',
        new_slug: newNode.slug,
        existing_slug: existing.slug,
        similarity: 1.0,
        polarity_flip: true,
        detected_at: now,
        reason: `Ontology conflict: same SPO triple (${newNode.subject}.${newNode.predicate}.${newNode.object}) with opposite modality (${newNode.modality} vs ${existing.modality})`,
        resolution: null,
        resolved_at: null,
      });
      continue; // Ontology conflict is certain — no need for fuzzy check
    }

    // Layer 2: Fuzzy similarity
    const existingTokens = tokenSet(`${existing.title} ${existing.body ?? ''}`);
    const existingVec = trigramVec(`${existing.title} ${existing.body ?? ''}`);

    const jaccardScore = jaccard(newTokens, existingTokens);
    const cosineScore = cosine(newVec, existingVec);
    const combined = 0.5 * jaccardScore + 0.5 * cosineScore;

    const hasFlip = polarityFlip(newNode, existing);

    if (combined >= CONFLICT_SIMILARITY_THRESHOLD && hasFlip) {
      conflicts.push({
        conflict_id: `conflict-${now.slice(0, 10)}-${conflicts.length + 1 .toString().padStart(3, '0')}`,
        status: 'pending',
        new_slug: newNode.slug,
        existing_slug: existing.slug,
        similarity: Math.round(combined * 1000) / 1000,
        polarity_flip: true,
        detected_at: now,
        reason: `Polarity flip on target '${newNode.sentiment_target}' with similarity ${combined.toFixed(3)} ≥ ${CONFLICT_SIMILARITY_THRESHOLD}`,
        resolution: null,
        resolved_at: null,
      });
    }
  }

  return conflicts;
}

// ─── QUARANTINE & PROMOTION ──────────────────────────────────────────────────────

/**
 * Write a ConflictRecord to the conflicts inbox as an SSSS .md file.
 * @param {import('../types/memory.js').ConflictRecord} conflict
 * @param {string} conflictsDir - Path to .agent/memory-inbox/conflicts/
 * @returns {string} Written file path
 */
export function writeConflictFile(conflict, conflictsDir) {
  fs.mkdirSync(conflictsDir, { recursive: true });
  const filePath = path.join(conflictsDir, `${conflict.conflict_id}.md`);
  const content = matter.stringify('', { type: 'conflict', ...conflict });
  atomicWrite(filePath, content);
  return filePath;
}

/**
 * Append a conflict record to the conflict-index.jsonl derived index.
 * @param {import('../types/memory.js').ConflictRecord} conflict
 * @param {string} derivedDir
 */
export function appendConflictIndex(conflict, derivedDir) {
  const indexPath = path.join(derivedDir, 'conflict-index.jsonl');
  const line = JSON.stringify(conflict) + '\n';
  fs.appendFileSync(indexPath, line, 'utf-8');
}

/**
 * Run the full promotion gate for a new node.
 * Checks for conflicts against all existing active vault nodes.
 * If conflicts are found: writes conflict files, sets node to draft, returns {promoted: false}.
 * If no conflicts: returns {promoted: true}.
 *
 * @param {import('../types/memory.js').MemoryNode} newNode
 * @param {import('../types/memory.js').MemoryNode[]} existingNodes
 * @param {string} conflictsDir
 * @param {string} derivedDir
 * @returns {{ promoted: boolean, conflicts: import('../types/memory.js').ConflictRecord[] }}
 */
export function gatePromotion(newNode, existingNodes, conflictsDir, derivedDir) {
  const conflicts = detectConflicts(newNode, existingNodes);

  if (conflicts.length > 0) {
    for (const conflict of conflicts) {
      writeConflictFile(conflict, conflictsDir);
      if (derivedDir) appendConflictIndex(conflict, derivedDir);
    }
    return { promoted: false, conflicts };
  }

  return { promoted: true, conflicts: [] };
}

// ─── CLI RESOLUTION ──────────────────────────────────────────────────────────────

/**
 * Resolve a conflict by keeping the existing rule (deprecating the new node).
 *
 * @param {string} existingSlug - The slug to keep
 * @param {string} newSlug - The slug to deprecate
 * @param {string} vaultDir
 * @param {string} conflictsDir
 * @param {string} conflictId
 */
export function resolveKeepExisting(existingSlug, newSlug, vaultDir, conflictsDir, conflictId) {
  // Deprecate the new (losing) node
  setStatus(vaultDir, newSlug, 'deprecated');

  // Mark conflict as resolved
  const conflictFile = path.join(conflictsDir, `${conflictId}.md`);
  if (fs.existsSync(conflictFile)) {
    setFrontmatterField(conflictsDir, conflictId, 'status', 'resolved');
    setFrontmatterField(conflictsDir, conflictId, 'resolution', 'keep-existing');
    setFrontmatterField(conflictsDir, conflictId, 'resolved_at', new Date().toISOString());
  }
}

/**
 * Resolve a conflict by superseding the existing rule with the new node.
 *
 * @param {string} newSlug - The slug that wins
 * @param {string} existingSlug - The slug that is superseded
 * @param {string} vaultDir
 * @param {string} conflictsDir
 * @param {string} conflictId
 */
export function resolveSupersede(newSlug, existingSlug, vaultDir, conflictsDir, conflictId) {
  // Set existing to superseded, link to new
  setStatus(vaultDir, existingSlug, 'superseded');
  setFrontmatterField(vaultDir, existingSlug, 'superseded_by', newSlug);

  // Activate new node, link to existing
  setStatus(vaultDir, newSlug, 'active');
  setFrontmatterField(vaultDir, newSlug, 'supersedes', [existingSlug]);

  // Mark conflict as resolved
  const conflictFile = path.join(conflictsDir, `${conflictId}.md`);
  if (fs.existsSync(conflictFile)) {
    setFrontmatterField(conflictsDir, conflictId, 'status', 'resolved');
    setFrontmatterField(conflictsDir, conflictId, 'resolution', 'supersede-new');
    setFrontmatterField(conflictsDir, conflictId, 'resolved_at', new Date().toISOString());
  }
}

/**
 * CLI resolver — dispatches to the correct resolution strategy based on args.
 *
 * @param {{ keep?: string, supersede?: string, 'conflict-id'?: string }} args
 * @param {string} vaultDir
 * @param {string} conflictsDir
 */
export function cliResolve(args, vaultDir, conflictsDir) {
  const conflictId = args['conflict-id'];
  if (!conflictId) throw new Error('--conflict-id is required');

  // Load conflict record to get the two slugs
  const conflictFile = path.join(conflictsDir, `${conflictId}.md`);
  if (!fs.existsSync(conflictFile)) {
    throw new Error(`Conflict not found: ${conflictId}`);
  }

  const raw = fs.readFileSync(conflictFile, 'utf-8');
  const { data: conflict } = matter(raw);

  if (args.keep) {
    const keepSlug = args.keep;
    const loseSlug = keepSlug === conflict.existing_slug ? conflict.new_slug : conflict.existing_slug;
    resolveKeepExisting(keepSlug, loseSlug, vaultDir, conflictsDir, conflictId);
    console.log(`✅ Resolved: kept '${keepSlug}', deprecated '${loseSlug}'`);
  } else if (args.supersede) {
    const newSlug = args.supersede;
    const existingSlug = newSlug === conflict.new_slug ? conflict.existing_slug : conflict.new_slug;
    resolveSupersede(newSlug, existingSlug, vaultDir, conflictsDir, conflictId);
    console.log(`✅ Resolved: '${newSlug}' supersedes '${existingSlug}'`);
  } else {
    throw new Error('Either --keep <slug> or --supersede <slug> is required');
  }
}
