import fs from 'fs';
import path from 'path';
import natural from 'natural';
import { atomicWrite } from './vault.mjs';

const JACCARD_THRESHOLD = 0.75;

/**
 * Jaccard similarity for two sets of tokens.
 */
function jaccard(setA, setB) {
  const intersection = new Set([...setA].filter(x => setB.has(x)));
  const union = new Set([...setA, ...setB]);
  if (union.size === 0) return 0;
  return intersection.size / union.size;
}

/**
 * Layer 1: Ontology SPO collision check.
 * Checks if Subject, Predicate, and Object match but modality/sentiment flip.
 */
export function checkLayer1(candidate, existing) {
  if (
    candidate.subject === existing.subject &&
    candidate.predicate === existing.predicate &&
    candidate.object === existing.object
  ) {
    const polarityFlip = candidate.sentiment_polarity !== existing.sentiment_polarity ||
                         candidate.modality !== existing.modality;
    if (polarityFlip) {
      return {
        collision: true,
        reason: `Layer 1: Polarity flip on SPO (${candidate.subject} -> ${candidate.predicate} -> ${candidate.object})`
      };
    }
  }
  return { collision: false };
}

/**
 * Layer 2: Jaccard + Cosine collision check on node body.
 */
export function checkLayer2(candidate, existing) {
  const tokenizer = new natural.WordTokenizer();
  const tokensA = new Set(tokenizer.tokenize((candidate.body || '').toLowerCase()));
  const tokensB = new Set(tokenizer.tokenize((existing.body || '').toLowerCase()));
  
  const score = jaccard(tokensA, tokensB);
  
  if (score >= JACCARD_THRESHOLD) {
    const polarityFlip = candidate.sentiment_polarity !== existing.sentiment_polarity;
    if (polarityFlip) {
      return {
        collision: true,
        similarity: score,
        reason: `Layer 2: Jaccard similarity ${score.toFixed(2)} >= ${JACCARD_THRESHOLD} with polarity flip`
      };
    }
  }
  return { collision: false };
}

/**
 * Run all collision checks for a candidate against the vault.
 */
export function detectConflicts(candidate, existingNodes) {
  const conflicts = [];
  
  for (const existing of existingNodes) {
    if (existing.status !== 'active') continue;
    
    const l1 = checkLayer1(candidate, existing);
    if (l1.collision) {
      conflicts.push({
        type: 'conflict',
        conflict_id: `conflict-${Date.now()}-${Math.floor(Math.random()*1000)}`,
        status: 'pending',
        new_slug: candidate.slug,
        existing_slug: existing.slug,
        similarity: 1.0,
        polarity_flip: true,
        detected_at: new Date().toISOString(),
        reason: l1.reason,
        resolution: null,
        resolved_at: null
      });
      continue;
    }
    
    const l2 = checkLayer2(candidate, existing);
    if (l2.collision) {
      conflicts.push({
        type: 'conflict',
        conflict_id: `conflict-${Date.now()}-${Math.floor(Math.random()*1000)}`,
        status: 'pending',
        new_slug: candidate.slug,
        existing_slug: existing.slug,
        similarity: l2.similarity,
        polarity_flip: true,
        detected_at: new Date().toISOString(),
        reason: l2.reason,
        resolution: null,
        resolved_at: null
      });
    }
  }
  
  return conflicts;
}

/**
 * Write conflict record to the memory-inbox/conflicts/ quarantine directory.
 */
export function quarantineConflict(conflict, conflictsDir) {
  if (!fs.existsSync(conflictsDir)) {
    fs.mkdirSync(conflictsDir, { recursive: true });
  }
  const filePath = path.join(conflictsDir, `${conflict.conflict_id}.json`);
  atomicWrite(filePath, JSON.stringify(conflict, null, 2));
}

/**
 * Resolve a conflict.
 */
export function resolveConflict(conflictId, resolution, conflictsDir) {
  const filePath = path.join(conflictsDir, `${conflictId}.json`);
  if (!fs.existsSync(filePath)) throw new Error('Conflict not found');
  
  const conflict = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  conflict.status = 'resolved';
  conflict.resolution = resolution;
  conflict.resolved_at = new Date().toISOString();
  
  atomicWrite(filePath, JSON.stringify(conflict, null, 2));
  return conflict;
}
