/**
 * Hermes-Grade Fail-Closed Duplicate Memory Guard
 *
 * Implements pre-write semantic collision checking co-opted from Nous Hermes / Hindsight
 * (_find_related_observations).
 *
 * Prevents agents from polluting the vault with duplicate rules or disguising
 * rule-violation incidents by re-recording existing invariants.
 *
 * Invariant:
 * If an active rule or invariant with high token similarity or vector semantic proximity
 * already exists, the write MUST FAIL CLOSED (Exit Code 1) with ZERO disk bytes written.
 */

import fs from 'node:fs';
import path from 'node:path';
import { getNodes } from './vault-cache.mjs';
import { loadEmbeddingsIndex, cosineSimilarity } from './embeddings.mjs';
import { logger } from './logger.mjs';

const RULE_CATEGORIES = new Set(['invariants', 'anti-patterns', 'preferences', 'rules']);

const STOPWORDS = new Set([
  'a', 'an', 'and', 'are', 'as', 'at', 'be', 'by', 'for', 'from', 'has', 'he',
  'in', 'is', 'it', 'its', 'of', 'on', 'that', 'the', 'to', 'was', 'were',
  'will', 'with', 'before', 'after', 'using', 'used', 'use', 'any', 'all',
  'should', 'must', 'each', 'this', 'these', 'those', 'such', 'than', 'then'
]);

/**
 * Normalize and stem a token to its canonical semantic root.
 */
export function stemToken(word) {
  let w = word.toLowerCase();
  // Strip trailing punctuation
  w = w.replace(/[^a-z0-9_-]/g, '');
  if (w.length <= 2) return w;

  // Synonyms and domain stems
  if (w === 'docs' || w === 'documentation') return 'doc';
  if (w === 'apis' || w === 'api') return 'api';
  if (w === 'models' || w === 'model') return 'model';
  if (w === 'names' || w === 'strings' || w === 'string') return 'name';
  if (w.startsWith('search')) return 'search';
  if (w.startsWith('hardcod')) return 'hardcode';
  if (w.startsWith('pretrain')) return 'pretrain';
  if (w.startsWith('reli') || w.startsWith('rely')) return 'rely';
  if (w.startsWith('specif')) return 'spec';
  if (w.startsWith('push')) return 'push';
  if (w.startsWith('commit')) return 'commit';
  if (w.startsWith('verif')) return 'verify';
  if (w.startsWith('check')) return 'check';

  // Standard suffix stripping
  if (w.endsWith('ing') && w.length > 5) return w.slice(0, -3);
  if (w.endsWith('es') && w.length > 4) return w.slice(0, -2);
  if (w.endsWith('s') && !w.endsWith('ss') && w.length > 3) return w.slice(0, -1);
  if (w.endsWith('ed') && w.length > 4) return w.slice(0, -2);
  if (w.endsWith('ly') && w.length > 4) return w.slice(0, -2);

  return w;
}

/**
 * Tokenize text into stemmed, stopword-filtered semantic tokens.
 */
export function tokenize(text) {
  if (!text || typeof text !== 'string') return new Set();
  const rawWords = text
    .toLowerCase()
    .replace(/[^a-z0-9\s_-]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 1 && !STOPWORDS.has(w));

  const stems = new Set();
  for (const word of rawWords) {
    const s = stemToken(word);
    if (s && !STOPWORDS.has(s)) {
      stems.add(s);
    }
  }
  return stems;
}

/**
 * Compute Jaccard similarity between two token sets.
 */
export function jaccard(setA, setB) {
  if (setA.size === 0 && setB.size === 0) return 1;
  let intersection = 0;
  for (const item of setA) {
    if (setB.has(item)) intersection++;
  }
  const union = setA.size + setB.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

/**
 * Compute containment ratio (how much of candidate's core tokens exist in target).
 */
export function containment(candidateSet, targetSet) {
  if (candidateSet.size === 0) return 0;
  let matches = 0;
  for (const token of candidateSet) {
    if (targetSet.has(token)) matches++;
  }
  return matches / candidateSet.size;
}

/**
 * Find the location of an existing slug in compiled instruction surfaces.
 */
export function findSurfaceLocation(existingSlug, projectRoot = process.cwd()) {
  const homeDir = process.env.HOME || '';
  const candidates = [
    path.join(projectRoot, 'AGENTS.md'),
    path.join(projectRoot, 'INSTRUCTIONS.md'),
    path.join(projectRoot, 'CLAUDE.md'),
    path.join(projectRoot, '.cursorrules'),
    path.join(homeDir, '.agent', 'INSTRUCTIONS.md'),
    path.join(homeDir, '.agent', 'AGENTS.md'),
  ];

  for (const candidatePath of candidates) {
    if (fs.existsSync(candidatePath)) {
      try {
        const content = fs.readFileSync(candidatePath, 'utf8');
        const lines = content.split('\n');
        for (let i = 0; i < lines.length; i++) {
          if (lines[i].includes(existingSlug)) {
            return {
              file: path.basename(candidatePath),
              path: candidatePath,
              line: i + 1,
              snippet: lines[i].trim().slice(0, 100),
            };
          }
        }
      } catch {
        // Ignore read errors
      }
    }
  }
  return null;
}

/**
 * Record a rule violation incident into the persistent incidents log.
 */
export function logIncident(incident, derivedDir) {
  try {
    fs.mkdirSync(derivedDir, { recursive: true });
    const logPath = path.join(derivedDir, 'incidents.jsonl');
    fs.appendFileSync(logPath, JSON.stringify(incident) + '\n', 'utf8');
  } catch (err) {
    logger.warn('duplicate-guard', `Failed to record incident to ${derivedDir}: ${err.message}`);
  }
}

/**
 * Check if a candidate rule/invariant node is a duplicate of an existing active node.
 *
 * @param {object} candidate - The candidate node to be remembered.
 * @param {object} options
 * @param {string} options.vaultDir - Path to current vault directory.
 * @param {string} [options.derivedDir] - Path to memory-derived directory.
 * @param {string} [options.globalVaultDir] - Global vault, as resolved by the caller's brain owner. Also searched when it differs from vaultDir.
 * @param {string} [options.projectRoot] - Repository root directory.
 * @param {number} [options.jaccardThreshold=0.45] - Threshold for token overlap.
 * @param {number} [options.containmentThreshold=0.60] - Threshold for candidate containment.
 * @param {number} [options.cosineThreshold=0.82] - Threshold for embedding cosine similarity.
 * @returns {object} { isDuplicate: boolean, matchedNode?: object, similarity?: number, surfaceLoc?: object }
 */
export function checkDuplicateRule(candidate, options = {}) {
  const {
    vaultDir,
    derivedDir,
    globalVaultDir,
    projectRoot = process.cwd(),
    jaccardThreshold = 0.45,
    containmentThreshold = 0.60,
    cosineThreshold = 0.82,
  } = options;

  if (!candidate || !RULE_CATEGORIES.has(candidate.category)) {
    return { isDuplicate: false };
  }

  // Load existing active nodes from the target vault
  const vaultNodes = getNodes(vaultDir).filter(
    (n) => n.status === 'active' && RULE_CATEGORIES.has(n.category) && n.slug !== candidate.slug
  );

  // If in a project brain, also check global vault to prevent duplicating global invariants
  let allNodes = [...vaultNodes];
  if (globalVaultDir && vaultDir !== globalVaultDir && fs.existsSync(globalVaultDir)) {
    try {
      const globalNodes = getNodes(globalVaultDir).filter(
        (n) => n.status === 'active' && RULE_CATEGORIES.has(n.category) && n.slug !== candidate.slug
      );
      allNodes = [...allNodes, ...globalNodes];
    } catch {
      // Ignore global load errors if any
    }
  }

  if (allNodes.length === 0) {
    return { isDuplicate: false };
  }

  const candidateBody = (candidate.body || '').trim();
  const candidateNorm = candidateBody.toLowerCase().replace(/\s+/g, ' ');
  const candidateTokens = tokenize(
    `${candidate.title || ''} ${candidateBody} ${candidate.subject || ''} ${candidate.predicate || ''} ${candidate.object || ''}`
  );

  // Optional vector index check
  let embeddingsIndex = null;
  if (derivedDir && fs.existsSync(path.join(derivedDir, 'embeddings.db'))) {
    try {
      embeddingsIndex = loadEmbeddingsIndex(derivedDir);
    } catch {
      embeddingsIndex = null;
    }
  }

  for (const existing of allNodes) {
    const existingBody = (existing.body || '').trim();
    const existingNorm = existingBody.toLowerCase().replace(/\s+/g, ' ');

    // 1. Exact or near-exact normalized body match
    if (candidateNorm.length > 10 && (candidateNorm === existingNorm || existingNorm.includes(candidateNorm) || candidateNorm.includes(existingNorm))) {
      const surfaceLoc = findSurfaceLocation(existing.slug, projectRoot);
      return {
        isDuplicate: true,
        matchedNode: existing,
        similarity: 1.0,
        surfaceLoc,
      };
    }

    // 2. Token Jaccard similarity & Containment
    const existingTokens = tokenize(
      `${existing.title || ''} ${existingBody} ${existing.subject || ''} ${existing.predicate || ''} ${existing.object || ''}`
    );
    const tokenSim = jaccard(candidateTokens, existingTokens);
    const containSim = containment(candidateTokens, existingTokens);

    if (tokenSim >= jaccardThreshold || containSim >= containmentThreshold) {
      const surfaceLoc = findSurfaceLocation(existing.slug, projectRoot);
      const effectiveSim = Math.max(tokenSim, containSim);
      return {
        isDuplicate: true,
        matchedNode: existing,
        similarity: Math.round(effectiveSim * 1000) / 1000,
        surfaceLoc,
      };
    }

    // 3. Vector Embedding similarity (if available)
    if (embeddingsIndex && embeddingsIndex[candidate.slug] && embeddingsIndex[existing.slug]) {
      try {
        const vecSim = cosineSimilarity(
          embeddingsIndex[candidate.slug].embedding,
          embeddingsIndex[existing.slug].embedding
        );
        if (vecSim >= cosineThreshold) {
          const surfaceLoc = findSurfaceLocation(existing.slug, projectRoot);
          return {
            isDuplicate: true,
            matchedNode: existing,
            similarity: Math.round(vecSim * 1000) / 1000,
            surfaceLoc,
          };
        }
      } catch {
        // Fall back to token match
      }
    }
  }

  return { isDuplicate: false };
}

/**
 * Enforces that a candidate rule is not a duplicate.
 * Throws an Error and logs an incident if a collision occurs.
 */
export function assertNoDuplicateRule(candidate, options = {}) {
  const check = checkDuplicateRule(candidate, options);
  if (!check.isDuplicate) return;

  const { matchedNode, similarity, surfaceLoc } = check;
  const surfaceStr = surfaceLoc ? `${surfaceLoc.file} at Line ${surfaceLoc.line}` : 'Active Invariant Pool';

  const incident = {
    timestamp: new Date().toISOString(),
    session_id: process.env.TR_SESSION_ID || 'unknown',
    event: 'rule_write_rejected',
    reason: 'An attempt was made to write a rule that already exists in active memory.',
    attempted: {
      category: candidate.category,
      title: candidate.title,
      body: candidate.body,
      priority: candidate.priority || 'normal',
    },
    existing: {
      slug: matchedNode.slug,
      title: matchedNode.title,
      body: matchedNode.body,
      priority: matchedNode.priority || 'normal',
      category: matchedNode.category,
    },
    similarity,
    surface_location: surfaceStr,
  };

  if (options.derivedDir) {
    logIncident(incident, options.derivedDir);
  }

  const message = [
    '',
    '================================================================================',
    '🚨 VIOLATION INCIDENT DETECTED: DUPLICATE RULE REJECTED',
    '--------------------------------------------------------------------------------',
    `Attempted Rule: "${candidate.body}"`,
    `Existing Rule:  [${matchedNode.slug}] "${matchedNode.body}"`,
    `Similarity:     ${Math.round(similarity * 100)}%`,
    `Surface Status: Active (${surfaceStr})`,
    '',
    'ROOT-CAUSE ANALYSIS:',
    'The agent attempted to write a rule that ALREADY exists in the active instruction',
    'surface. This indicates the agent failed to follow an invariant that was already',
    'active in its context.',
    '',
    'Refusing to write duplicate node. Zero disk bytes written.',
    'Fix the agent\'s behavior at the source.',
    '================================================================================',
    '',
  ].join('\n');

  console.error(message);

  const error = new Error(`Rule already exists: [${matchedNode.slug}] "${matchedNode.body}" (${Math.round(similarity * 100)}% match)`);
  error.code = 'ERR_DUPLICATE_RULE';
  error.incident = incident;
  error.matchedNode = matchedNode;
  throw error;
}
