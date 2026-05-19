import fs from 'fs';
import path from 'path';
import matter from 'gray-matter';
import crypto from 'node:crypto';
import { atomicWrite, walkMd, loadNodes, writeNode } from './vault.mjs';
import { logger } from './logger.mjs';

/**
 * SSSS Patch Conflict Detector
 *
 * Detects two classes of conflict:
 *
 * 1. **Semantic conflicts** — two memory nodes contradict each other
 *    (polarity flip on the same target, high similarity with opposing modality).
 *
 * 2. **Patch conflicts** — a patch operation targets a file that has been
 *    modified since the patch was prepared (optimistic concurrency).
 *
 * Implements §9 of the SSSS spec (Validation & Repair) and the conflict
 * record primitive (§5.1).
 */

// ─── Jaccard Similarity ─────────────────────────────────────────────────────

/**
 * Compute Jaccard similarity between two sets of tokens.
 */
function jaccard(setA, setB) {
  if (setA.size === 0 && setB.size === 0) return 1;
  let intersection = 0;
  for (const item of setA) {
    if (setB.has(item)) intersection++;
  }
  const union = setA.size + setB.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

/**
 * Tokenize a string into a set of lowercase words.
 */
function tokenize(text) {
  if (!text) return new Set();
  return new Set(
    text
      .toLowerCase()
      .replace(/[^a-z0-9\s_-]/g, ' ')
      .split(/\s+/)
      .filter(w => w.length > 1)
  );
}

// ─── Polarity Detection ─────────────────────────────────────────────────────

const POSITIVE_POLARITIES = new Set(['directive_must', 'descriptive', 'preference']);
const NEGATIVE_POLARITIES = new Set(['directive_must_not']);
const POSITIVE_MODALITIES = new Set(['must', 'should']);
const NEGATIVE_MODALITIES = new Set(['must_not', 'should_not']);

/**
 * Determine if two nodes have opposing polarity.
 */
function hasPolarityFlip(nodeA, nodeB) {
  // Check sentiment_polarity
  const polA = POSITIVE_POLARITIES.has(nodeA.sentiment_polarity) ? 'positive' : 'negative';
  const polB = POSITIVE_POLARITIES.has(nodeB.sentiment_polarity) ? 'positive' : 'negative';
  if (polA !== polB) return true;

  // Check modality
  const modA = POSITIVE_MODALITIES.has(nodeA.modality) ? 'positive' : 'negative';
  const modB = POSITIVE_MODALITIES.has(nodeB.modality) ? 'positive' : 'negative';
  if (modA !== modB) return true;

  return false;
}

// ─── Semantic Conflict Detection ────────────────────────────────────────────

/**
 * Default thresholds for conflict detection.
 */
const DEFAULT_THRESHOLDS = {
  /** Minimum Jaccard similarity to consider nodes related. */
  similarityThreshold: 0.35,
  /** Minimum similarity WITH polarity flip to flag a conflict. */
  conflictThreshold: 0.78,
  /** Maximum number of conflicts to return per scan. */
  maxConflicts: 50,
};

/**
 * Detect semantic conflicts between a candidate node and existing vault nodes.
 *
 * @param {object} candidate - The new/updated memory node (parsed frontmatter).
 * @param {object[]} existingNodes - Array of existing memory nodes.
 * @param {object} [thresholds] - Override default thresholds.
 * @returns {object[]} Array of conflict records enriched with provenance metadata.
 */
export function detectSemanticConflicts(candidate, existingNodes, thresholds = {}) {
  const t = { ...DEFAULT_THRESHOLDS, ...thresholds };
  const conflicts = [];

  if (candidate.type !== 'memory') return conflicts;

  const candidateTokens = tokenize(
    [candidate.title, candidate.subject, candidate.predicate, candidate.object,
     candidate.sentiment_target, ...(candidate.tags || [])].join(' ')
  );

  for (const existing of existingNodes) {
    if (existing.type !== 'memory') continue;
    if (existing.slug === candidate.slug) continue;
    if (existing.status !== 'active') continue;

    const existingTokens = tokenize(
      [existing.title, existing.subject, existing.predicate, existing.object,
       existing.sentiment_target, ...(existing.tags || [])].join(' ')
    );

    const similarity = jaccard(candidateTokens, existingTokens);

    if (similarity < t.similarityThreshold) continue;

    const polarityFlip = hasPolarityFlip(candidate, existing);

    if (polarityFlip && similarity >= t.conflictThreshold) {
      conflicts.push({
        type: 'conflict',
        conflict_id: `conflict-${new Date().toISOString().split('T')[0]}-${crypto.randomBytes(3).toString('hex')}`,
        status: 'pending',
        new_slug: candidate.slug,
        existing_slug: existing.slug,
        similarity: Math.round(similarity * 1000) / 1000,
        polarity_flip: true,
        detected_at: new Date().toISOString(),
        reason: `Polarity flip on overlapping semantic target with similarity ${similarity.toFixed(3)} ≥ ${t.conflictThreshold}`,
        resolution: null,
        resolved_at: null,
        // Provenance metadata for auto-resolution
        _new_node: candidate,
        _existing_node: existing,
      });

      if (conflicts.length >= t.maxConflicts) break;
    }
  }

  return conflicts;
}

/**
 * Run a full vault scan for semantic conflicts.
 *
 * Compares every active node against every other active node.
 * Use sparingly — O(n²) complexity.
 *
 * @param {string} vaultDir - Path to the memory vault directory.
 * @param {object} [thresholds] - Override default thresholds.
 * @returns {object[]} Array of conflict records (deduplicated by pair).
 */
export function scanVaultForConflicts(vaultDir, thresholds = {}) {
  const nodes = loadNodes(vaultDir).filter(n => n.status === 'active');
  const seen = new Set();
  const conflicts = [];

  for (const candidate of nodes) {
    const others = nodes.filter(n => n.slug !== candidate.slug);
    const found = detectSemanticConflicts(candidate, others, thresholds);

    for (const conflict of found) {
      // Deduplicate: sort the pair so we don't report A↔B and B↔A
      const pairKey = [conflict.new_slug, conflict.existing_slug].sort().join('::');
      if (!seen.has(pairKey)) {
        seen.add(pairKey);
        conflicts.push(conflict);
      }
    }
  }

  return conflicts;
}

// ─── Patch Conflict Detection ───────────────────────────────────────────────

/**
 * Detect if a patch operation conflicts with the current file state.
 *
 * This implements optimistic concurrency: the caller supplies the
 * expected content hash of the file they read before preparing the patch.
 * If the current file has a different hash, someone else modified it.
 *
 * @param {string} vaultRoot - Absolute path to the vault.
 * @param {string} vfsPath - The VFS path being patched.
 * @param {string} expectedHash - SHA-256 hash of the file content the patch was based on.
 * @returns {{ conflicted: boolean, currentHash?: string, error?: string }}
 */
export function detectPatchConflict(vaultRoot, vfsPath, expectedHash) {
  const cleaned = vfsPath.replace(/^\/+/, '');
  const absPath = path.resolve(vaultRoot, cleaned);

  if (!absPath.startsWith(path.resolve(vaultRoot))) {
    return { conflicted: true, error: 'Path traversal detected.' };
  }

  if (!fs.existsSync(absPath)) {
    return { conflicted: false }; // New file — no conflict possible
  }

  const content = fs.readFileSync(absPath, 'utf8');
  const currentHash = crypto.createHash('sha256').update(content).digest('hex');

  if (currentHash !== expectedHash) {
    return {
      conflicted: true,
      currentHash,
      error: `File '${vfsPath}' was modified since patch was prepared. Expected hash: ${expectedHash.slice(0, 12)}…, current: ${currentHash.slice(0, 12)}…`,
    };
  }

  return { conflicted: false, currentHash };
}

/**
 * Compute the content hash of a VFS file for use with detectPatchConflict.
 */
export function computeFileHash(vaultRoot, vfsPath) {
  const cleaned = vfsPath.replace(/^\/+/, '');
  const absPath = path.resolve(vaultRoot, cleaned);
  if (!fs.existsSync(absPath)) return null;
  const content = fs.readFileSync(absPath, 'utf8');
  return crypto.createHash('sha256').update(content).digest('hex');
}

// ─── Auto-Resolution Engine ─────────────────────────────────────────────────

/**
 * Determine the source authority of a memory node.
 * Returns 'user' for direct user/chat-created nodes, 'machine' for
 * optimizer/dream-cycle generated nodes, 'unknown' otherwise.
 */
function sourceAuthority(node) {
  const src = node.source?.type;
  if (!src) return 'unknown';
  const userSources = new Set(['chat', 'user', 'correction', 'mcp-client', 'steering']);
  const machineSources = new Set(['dream-cycle', 'optimizer', 'kernel', 'auto-distill']);
  if (userSources.has(src)) return 'user';
  if (machineSources.has(src)) return 'machine';
  return 'unknown';
}

/**
 * Check whether a node is a protected invariant (priority: absolute or immutable).
 */
function isProtectedInvariant(node) {
  return node.priority === 'absolute' || node.immutable === true;
}

/**
 * Attempt to automatically resolve a conflict using tiered heuristics.
 *
 * Resolution tiers (checked in order):
 *
 * 1. **Protected invariant clash** — Both nodes are `priority: absolute` or
 *    `immutable: true`. Cannot auto-resolve; requires human review.
 *
 * 2. **User supersedes machine** — The newer node is from the user, the older
 *    is machine-generated. Auto-supersede (user intent wins).
 *
 * 3. **Machine vs user** — The newer node is machine-generated, the older is
 *    from the user. Auto-keep (user intent wins over machine inference).
 *
 * 4. **Recency with clear provenance** — Both nodes are from the same source
 *    authority. The newer one supersedes the older one (latest preference wins).
 *
 * 5. **Borderline similarity** — Similarity is between conflictThreshold and
 *    0.90. Accept both, but reduce confidence on the older node.
 *
 * @param {object} conflict - The conflict record with _new_node and _existing_node.
 * @returns {{ resolved: boolean, action: string, reason: string }}
 */
export function autoResolveConflict(conflict) {
  const newNode = conflict._new_node;
  const existingNode = conflict._existing_node;

  if (!newNode || !existingNode) {
    return { resolved: false, action: 'quarantine', reason: 'Missing node provenance metadata.' };
  }

  const newAuth = sourceAuthority(newNode);
  const existingAuth = sourceAuthority(existingNode);
  const newIsProtected = isProtectedInvariant(newNode);
  const existingIsProtected = isProtectedInvariant(existingNode);

  // Tier 1: Both are protected invariants — require human review
  if (newIsProtected && existingIsProtected) {
    return {
      resolved: false,
      action: 'quarantine',
      reason: 'Both nodes are protected invariants (priority: absolute / immutable). Human review required.',
    };
  }

  // Tier 2: Protected invariant vs non-protected — the invariant always wins
  if (existingIsProtected && !newIsProtected) {
    return {
      resolved: true,
      action: 'keep',
      winner: existingNode.slug,
      loser: newNode.slug,
      reason: `Existing node '${existingNode.slug}' is a protected invariant. New node auto-rejected.`,
    };
  }
  if (newIsProtected && !existingIsProtected) {
    return {
      resolved: true,
      action: 'supersede',
      winner: newNode.slug,
      loser: existingNode.slug,
      reason: `New node '${newNode.slug}' is a protected invariant. Existing node auto-superseded.`,
    };
  }

  // Tier 3: User vs machine — user intent always wins
  if (newAuth === 'user' && existingAuth === 'machine') {
    return {
      resolved: true,
      action: 'supersede',
      winner: newNode.slug,
      loser: existingNode.slug,
      reason: `User-created node supersedes machine-generated node '${existingNode.slug}'.`,
    };
  }
  if (newAuth === 'machine' && existingAuth === 'user') {
    return {
      resolved: true,
      action: 'keep',
      winner: existingNode.slug,
      loser: newNode.slug,
      reason: `Machine-generated node rejected in favor of user-created node '${existingNode.slug}'.`,
    };
  }

  // Tier 4: Same authority — latest preference wins (recency)
  const newDate = new Date(newNode.updated || newNode.created || 0).getTime();
  const existingDate = new Date(existingNode.updated || existingNode.created || 0).getTime();

  if (newDate > existingDate) {
    return {
      resolved: true,
      action: 'supersede',
      winner: newNode.slug,
      loser: existingNode.slug,
      reason: `Same source authority ('${newAuth}'). Newer node wins by recency.`,
    };
  }
  if (existingDate > newDate) {
    return {
      resolved: true,
      action: 'keep',
      winner: existingNode.slug,
      loser: newNode.slug,
      reason: `Same source authority ('${existingAuth}'). Existing node is more recent.`,
    };
  }

  // Tier 5: Identical timestamps or truly ambiguous — quarantine
  return {
    resolved: false,
    action: 'quarantine',
    reason: 'Could not determine a clear winner. Identical provenance and timestamps.',
  };
}

/**
 * Apply the resolution result to the vault and conflict record.
 *
 * When auto-resolved:
 * - The losing node is marked `status: superseded` and gets a `superseded_by` pointer.
 * - The winning node gets a `supersedes` entry pointing to the loser.
 * - The conflict record is marked `status: auto-resolved`.
 *
 * @param {object} conflict - The conflict record.
 * @param {object} resolution - The result from autoResolveConflict().
 * @param {string} vaultDir - Path to the memory vault.
 * @returns {object} Updated conflict record.
 */
export function applyAutoResolution(conflict, resolution, vaultDir) {
  if (!resolution.resolved) return conflict;

  const winner = resolution.winner;
  const loser = resolution.loser;

  // Update the losing node in the vault
  if (vaultDir && conflict._existing_node && conflict._new_node) {
    const loserNode = resolution.action === 'keep' ? conflict._new_node : conflict._existing_node;
    const winnerNode = resolution.action === 'keep' ? conflict._existing_node : conflict._new_node;

    // Mark the loser as superseded
    loserNode.status = 'superseded';
    loserNode.superseded_by = winner;
    loserNode.updated = new Date().toISOString();

    // Add the loser to the winner's supersedes list
    if (!winnerNode.supersedes) winnerNode.supersedes = [];
    if (!winnerNode.supersedes.includes(loser)) {
      winnerNode.supersedes.push(loser);
    }
    winnerNode.updated = new Date().toISOString();

    try {
      writeNode(loserNode, vaultDir);
      writeNode(winnerNode, vaultDir);
    } catch (err) {
      logger.error('conflict-detector', `Failed to apply auto-resolution: ${err.message}`);
    }
  }

  // Update the conflict record itself
  conflict.status = 'auto-resolved';
  conflict.resolution = `${resolution.action}: ${winner}`;
  conflict.resolution_reason = resolution.reason;
  conflict.resolved_at = new Date().toISOString();

  return conflict;
}

/**
 * Detect conflicts and attempt auto-resolution. Only quarantine what
 * cannot be resolved automatically.
 *
 * This is the primary entry point for conflict handling.
 *
 * @param {object} candidate - The new memory node.
 * @param {object[]} existingNodes - Existing vault nodes.
 * @param {object} options - { vaultDir, inboxDir, thresholds }
 * @returns {{ autoResolved: object[], quarantined: object[] }}
 */
export function detectAndResolve(candidate, existingNodes, options = {}) {
  const { vaultDir, inboxDir, thresholds } = options;
  const conflicts = detectSemanticConflicts(candidate, existingNodes, thresholds);

  const autoResolved = [];
  const quarantined = [];

  for (const conflict of conflicts) {
    const resolution = autoResolveConflict(conflict);

    if (resolution.resolved) {
      const resolved = applyAutoResolution(conflict, resolution, vaultDir);
      autoResolved.push(resolved);
      logger.info('conflict-detector', `Auto-resolved ${conflict.conflict_id}: ${resolution.reason}`);
    } else {
      quarantined.push(conflict);
      logger.info('conflict-detector', `Quarantined ${conflict.conflict_id}: ${resolution.reason}`);
    }
  }

  // Only write quarantined conflicts to the inbox for human review
  if (inboxDir && quarantined.length > 0) {
    writeConflicts(quarantined, inboxDir);
  }

  // Write auto-resolved records as well (for audit trail)
  if (inboxDir && autoResolved.length > 0) {
    writeConflicts(autoResolved, inboxDir);
  }

  return { autoResolved, quarantined };
}

// ─── Conflict Persistence ───────────────────────────────────────────────────

/**
 * Write conflict records to the inbox conflicts directory.
 *
 * @param {object[]} conflicts - Array of conflict records.
 * @param {string} inboxDir - Path to the memory-inbox directory.
 */
export function writeConflicts(conflicts, inboxDir) {
  const conflictsDir = path.join(inboxDir, 'conflicts');
  if (!fs.existsSync(conflictsDir)) {
    fs.mkdirSync(conflictsDir, { recursive: true });
  }

  for (const conflict of conflicts) {
    const filePath = path.join(conflictsDir, `${conflict.conflict_id}.md`);
    // Strip internal provenance refs before persisting
    const { _new_node, _existing_node, ...frontmatter } = conflict;
    const body = `Conflict detected between \`${conflict.new_slug}\` and \`${conflict.existing_slug}\`.\n\nReason: ${conflict.reason}`;
    const raw = matter.stringify(body, frontmatter);
    atomicWrite(filePath, raw);
    logger.info('conflict-detector', `Conflict written: ${conflict.conflict_id}`);
  }
}

/**
 * Resolve a conflict by choosing which slug wins.
 *
 * @param {string} conflictId - The conflict_id to resolve.
 * @param {string} inboxDir - Path to the memory-inbox directory.
 * @param {'keep' | 'supersede'} action - Whether to keep the existing or let new supersede.
 * @param {string} winnerSlug - The slug that wins.
 * @returns {{ resolved: boolean, error?: string }}
 */
export function resolveConflict(conflictId, inboxDir, action, winnerSlug) {
  const conflictPath = path.join(inboxDir, 'conflicts', `${conflictId}.md`);
  if (!fs.existsSync(conflictPath)) {
    return { resolved: false, error: `Conflict '${conflictId}' not found.` };
  }

  try {
    const raw = fs.readFileSync(conflictPath, 'utf8');
    const { data, content } = matter(raw);

    data.status = 'resolved';
    data.resolved_at = new Date().toISOString();
    data.resolution = `${action}: ${winnerSlug}`;

    const updated = matter.stringify(content, data);
    atomicWrite(conflictPath, updated);

    return { resolved: true };
  } catch (err) {
    return { resolved: false, error: err.message };
  }
}
