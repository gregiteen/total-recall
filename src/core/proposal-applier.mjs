import fs from 'fs';
import path from 'path';
import matter from 'gray-matter';
import { loadNodes, writeNode, atomicWrite } from './vault.mjs';
import { updateNodeInPlace } from './validated-write.mjs';
import { proposalKey } from './optimizer.mjs';
import { logger } from './logger.mjs';

/**
 * Proposal Applier — the consumer side of the optimizer.
 *
 * Before this module existed, proposals were write-only: the dream cycle filed
 * them, a 3-day pruner deleted them, and nothing in between ever read one. The
 * gate "accepted" 100% of what it saw, so `accepted` carried no information and
 * no proposal ever reached a terminal state.
 *
 * This module supplies the missing half:
 *   - a real status machine (draft → accepted → applied | rejected | superseded)
 *   - handlers that actually perform the proposed work
 *   - a byte-exact undo snapshot taken before any mutation
 *   - an append-only audit trail of every apply and revert
 *
 * Only mechanically-verifiable work is auto-appliable. Anything requiring
 * judgement stays `draft` and waits for a human via `total-recall proposals`.
 */

// Terminal states never re-open. `superseded` exists for a proposal whose target
// changed underneath it — it was neither done nor refused.
export const PROPOSAL_STATUSES = ['draft', 'accepted', 'applied', 'rejected', 'superseded'];
const TERMINAL_STATUSES = new Set(['applied', 'rejected', 'superseded']);

/**
 * Topics the daemon may apply without a human in the loop.
 *
 * The bar for membership is *mechanical verifiability*: the handler must be able
 * to prove the precondition itself (e.g. two nodes really do share a
 * predicate:object signature) rather than trusting the proposal's prose. A topic
 * whose correctness depends on reading intent belongs in manual review.
 *
 * EMPTY FOR 3.21.0 — deliberately. `memory-cleanup` meets the bar on paper and
 * its handler is fully implemented, but within minutes of first running against
 * a real vault the daemon auto-applied two merges built on an over-broad
 * grouping key (see MAX_AUTO_MERGE_SET). The undo snapshots recovered them, and
 * the key, the size cap, and the similarity floor are all fixed — but those
 * guards have now seen exactly one real vault. Let them observe live data for a
 * release or two before handing the daemon write access to memory unattended.
 *
 * Nothing else changes: the gate still accepts, `proposals list` still shows
 * `memory-cleanup` as ready, and `proposals apply` runs the same handler through
 * the same checks. The only difference is that a human presses the button.
 *
 * To re-enable: put 'memory-cleanup' back in this set. That is the whole change.
 */
export const AUTO_APPLICABLE_TOPICS = new Set([]);

/**
 * Nodes this module refuses to archive under any proposal.
 *
 * Invariants and absolute-priority rules are the one class of memory where a
 * wrong merge is unrecoverable in practice — the user notices only when the
 * agent stops obeying a rule, long after the undo snapshot is gone. Cheap to
 * exclude, expensive to get wrong.
 */
/**
 * Largest duplicate set the daemon will merge unattended.
 *
 * A genuine accidental duplicate is a pair, occasionally a triple. A set of
 * fifteen is the signature of an over-broad grouping key, not of fifteen people
 * writing the same fact — and that is exactly what happened: every
 * `research-project-*` node shares `tracked_research_project:knowledge_vault`,
 * so a predicate:object key grouped 15 distinct projects into one "duplicate"
 * set. Large sets now stop for a human even when everything else checks out.
 */
export const MAX_AUTO_MERGE_SET = 5;

/** Minimum token overlap for two nodes to count as stating the same thing. */
const MIN_CONTENT_SIMILARITY = 0.6;

function tokenize(node) {
  return new Set(
    `${node.title || ''} ${node.body || ''}`
      .toLowerCase()
      .match(/[a-z0-9]+/g) || [],
  );
}

/** Jaccard overlap — cheap, deterministic, and needs no embedding provider. */
function similarity(a, b) {
  if (a.size === 0 && b.size === 0) return 1;
  let shared = 0;
  for (const t of a) if (b.has(t)) shared++;
  return shared / (a.size + b.size - shared);
}

/**
 * @returns {string|null} a description of the first too-dissimilar pair, or null
 *   if every node in the set corresponds closely enough to be a duplicate.
 */
export function findDissimilarPair(nodes) {
  const tokens = nodes.map(tokenize);
  for (let i = 0; i < nodes.length; i++) {
    for (let j = i + 1; j < nodes.length; j++) {
      const score = similarity(tokens[i], tokens[j]);
      if (score < MIN_CONTENT_SIMILARITY) {
        return `${nodes[i].slug} vs ${nodes[j].slug}: ${score.toFixed(2)} similarity`;
      }
    }
  }
  return null;
}

function isProtectedNode(node) {
  return node.priority === 'absolute'
    || node.importance >= 5
    || node.category === 'invariants';
}

function proposalsDir(vaultDir) {
  return path.join(vaultDir, 'proposals');
}

function undoDir(vaultDir) {
  // Dot-prefixed so walkMd() skips it — an undo snapshot is not vault content
  // and must never be loaded as a node or embedded.
  return path.join(vaultDir, '.undo');
}

function auditPath(vaultDir) {
  return path.join(vaultDir, '.events', 'proposals.jsonl');
}

/**
 * Append one audit record. Best-effort: a failed audit write must not roll back
 * work that already succeeded on disk, but it must be visible in the log.
 */
export function appendProposalAudit(vaultDir, record) {
  const file = auditPath(vaultDir);
  try {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.appendFileSync(file, JSON.stringify({ ts: new Date().toISOString(), ...record }) + '\n');
  } catch (err) {
    logger.error('proposal-applier', `Audit append failed: ${err.message}`, { file });
  }
}

/**
 * Read every proposal on disk.
 * @param {string} vaultDir
 * @param {object} [opts]
 * @param {string|string[]} [opts.status] filter to these statuses
 * @param {string} [opts.topic] filter to one proposal topic
 */
export function listProposals(vaultDir, opts = {}) {
  const dir = proposalsDir(vaultDir);
  if (!fs.existsSync(dir)) return [];

  const wanted = opts.status
    ? new Set(Array.isArray(opts.status) ? opts.status : [opts.status])
    : null;

  const out = [];
  let files;
  try {
    files = fs.readdirSync(dir).filter(f => f.endsWith('.md'));
  } catch (err) {
    logger.error('proposal-applier', `Cannot read proposals dir: ${err.message}`, { dir });
    return [];
  }

  for (const file of files) {
    const full = path.join(dir, file);
    try {
      const { data, content } = matter(fs.readFileSync(full, 'utf8'));
      // On disk the topic lives in proposal_topic; `category` is the vault
      // folder. Surface a single `topic` field so callers never have to know.
      const topic = data.proposal_topic
        || (data.category && data.category !== 'proposals' ? data.category : null)
        || 'unknown';
      if (wanted && !wanted.has(data.status)) continue;
      if (opts.topic && topic !== opts.topic) continue;
      out.push({ ...data, topic, body: content.trim(), _filePath: full });
    } catch (err) {
      logger.debug('proposal-applier: skipping unparseable proposal', { file, err: err.message });
    }
  }
  return out.sort((a, b) => String(b.proposed_at || '').localeCompare(String(a.proposed_at || '')));
}

export function getProposal(vaultDir, id) {
  return listProposals(vaultDir).find(p => p.proposal_id === id || p.slug === id) || null;
}

/**
 * Move a proposal to a new status, preserving every other frontmatter field.
 *
 * Goes through the contract first so a transition also repairs frontmatter that
 * predates the current schema. It falls back to a direct write when validation
 * fails, because a status change must never be blocked by an unrelated schema
 * change months later — that would strand the proposal in a state no command
 * can clear, which is the failure this function was originally written to
 * avoid. The fallback is logged so the invalid node still gets surfaced.
 */
export async function setProposalStatus(vaultDir, id, status, extra = {}) {
  if (!PROPOSAL_STATUSES.includes(status)) {
    throw new Error(`Invalid proposal status: ${status}`);
  }
  const proposal = getProposal(vaultDir, id);
  if (!proposal) throw new Error(`Proposal not found: ${id}`);

  const raw = fs.readFileSync(proposal._filePath, 'utf8');
  const { data, content } = matter(raw);
  const next = { ...data, ...extra, status, status_changed_at: new Date().toISOString() };

  const result = await updateNodeInPlace(proposal._filePath, (nodeData) => {
    Object.assign(nodeData, next);
  }, { vaultDir });

  if (!result.success) {
    logger.warn('proposal-applier',
      `Proposal ${id} failed contract validation; writing status transition directly`, {
        errors: result.validation?.errors || [result.error],
      });
    // ssss-raw-write: deliberate fallback — see setProposalStatus doc comment.
    atomicWrite(proposal._filePath, matter.stringify(content, next));
  }

  return { ...next, _filePath: proposal._filePath };
}

// ─── Undo snapshots ─────────────────────────────────────────────────────────

/**
 * Capture the exact bytes of every file a handler is about to touch.
 *
 * Records absent files explicitly (`existed: false`) so revert deletes what the
 * apply created instead of leaving an orphan behind.
 */
function writeUndoSnapshot(vaultDir, proposalId, filePaths) {
  const files = filePaths.map((fp) => (
    fs.existsSync(fp)
      ? { path: fp, existed: true, content: fs.readFileSync(fp, 'utf8') }
      : { path: fp, existed: false, content: null }
  ));
  const dir = undoDir(vaultDir);
  fs.mkdirSync(dir, { recursive: true });
  const snapshotPath = path.join(dir, `${proposalId}.json`);
  atomicWrite(snapshotPath, JSON.stringify({ proposal_id: proposalId, captured_at: new Date().toISOString(), files }, null, 2));
  return snapshotPath;
}

/**
 * Restore a proposal's snapshot and return the proposal to `accepted`.
 * @returns {{ reverted: number, deleted: number }}
 */
export async function revertProposal(vaultDir, id) {
  const snapshotPath = path.join(undoDir(vaultDir), `${id}.json`);
  if (!fs.existsSync(snapshotPath)) {
    throw new Error(`No undo snapshot for proposal ${id} — cannot revert.`);
  }
  const snapshot = JSON.parse(fs.readFileSync(snapshotPath, 'utf8'));

  let reverted = 0;
  let deleted = 0;
  for (const file of snapshot.files) {
    if (file.existed) {
      fs.mkdirSync(path.dirname(file.path), { recursive: true });
      atomicWrite(file.path, file.content);
      reverted++;
    } else if (fs.existsSync(file.path)) {
      fs.unlinkSync(file.path);
      deleted++;
    }
  }

  // Return to `draft`, NOT `accepted`. `accepted` is the daemon's work queue, so
  // reverting into it means the next dream cycle re-applies the very thing that
  // was just undone — an undo/redo loop with no human in it. A revert is a
  // human saying "not this"; it must land somewhere only a human can move it out of.
  await setProposalStatus(vaultDir, id, 'draft', {
    reverted_at: new Date().toISOString(),
    review_reason: 'Previously applied and reverted; re-apply only after confirming the merge is correct.',
  });
  fs.unlinkSync(snapshotPath);
  appendProposalAudit(vaultDir, { action: 'revert', proposal_id: id, reverted, deleted });
  logger.info('proposal-applier', `Reverted proposal ${id} (${reverted} restored, ${deleted} removed).`);
  return { reverted, deleted };
}

// ─── Handlers ───────────────────────────────────────────────────────────────

/**
 * memory-cleanup: collapse nodes sharing an identical predicate:object signature.
 *
 * Non-destructive by construction — the duplicates are archived and stamped with
 * `superseded_by`, never deleted. The canonical node is the one carrying the most
 * evidence, so the merge keeps the strongest copy rather than an arbitrary one.
 *
 * Re-verifies the duplicate signature from live vault state instead of trusting
 * the proposal's rationale: a proposal filed days ago may describe nodes that
 * have since diverged, and applying it then would archive two *different* facts.
 */
async function applyMemoryCleanup(vaultDir, proposal, { dryRun }) {
  const slugs = String(proposal.target_path || '')
    .split(',')
    .map(s => s.trim())
    .filter(Boolean);

  if (slugs.length < 2) {
    return { ok: false, reason: `Expected ≥2 target slugs, got ${slugs.length}.` };
  }

  const bySlug = new Map(loadNodes(vaultDir).map(n => [n.slug, n]));
  const targets = slugs.map(s => bySlug.get(s)).filter(Boolean);

  if (targets.length < 2) {
    return { ok: false, reason: `Only ${targets.length} of ${slugs.length} target nodes still exist.`, supersede: true };
  }
  const active = targets.filter(n => n.status === 'active');
  if (active.length < 2) {
    return { ok: false, reason: `Only ${active.length} target nodes are still active.`, supersede: true };
  }

  // Re-verify the precondition against live state, not the proposal's prose.
  // The FULL triple, including subject — see MAX_AUTO_MERGE_SET below for why.
  const signatures = new Set(active.map(n => `${n.subject}:${n.predicate}:${n.object}`));
  if (signatures.size !== 1) {
    return { ok: false, reason: `Targets no longer share one subject:predicate:object signature (${signatures.size} distinct).`, supersede: true };
  }

  if (active.length > MAX_AUTO_MERGE_SET) {
    return {
      ok: false,
      reason: `${active.length} targets exceeds the auto-merge cap of ${MAX_AUTO_MERGE_SET}; review manually.`,
    };
  }

  // A matching triple says the nodes are *about* the same thing; it does not say
  // they state the same thing. Require the text to actually correspond before
  // discarding one as redundant.
  const dissimilar = findDissimilarPair(active);
  if (dissimilar) {
    return {
      ok: false,
      reason: `Targets share a signature but their content differs (${dissimilar}); not a duplicate set.`,
    };
  }

  const protectedNodes = active.filter(isProtectedNode);
  if (protectedNodes.length > 0) {
    return {
      ok: false,
      reason: `Refusing to merge protected nodes: ${protectedNodes.map(n => n.slug).join(', ')}.`,
    };
  }

  // Canonical = most evidence, then highest confidence, then oldest.
  const [canonical, ...duplicates] = [...active].sort((a, b) => (
    (b.evidence_count || 0) - (a.evidence_count || 0)
    || (b.confidence || 0) - (a.confidence || 0)
    || String(a.created || '').localeCompare(String(b.created || ''))
  ));

  if (dryRun) {
    return {
      ok: true,
      dryRun: true,
      canonical: canonical.slug,
      merged: duplicates.map(n => n.slug),
    };
  }

  writeUndoSnapshot(vaultDir, proposal.proposal_id, duplicates.map(n => n._filePath));

  for (const dup of duplicates) {
    const { _filePath, _filepath, body, ...frontmatter } = dup;
    await writeNode({
      ...frontmatter,
      body,
      // `superseded` — not `archived`. MemoryNodeSchema allows only
      // active|superseded|deprecated|draft, and `superseded` + `superseded_by`
      // are the schema's own vocabulary for exactly this relationship.
      status: 'superseded',
      superseded_by: canonical.slug,
      x_superseded_by_proposal: proposal.proposal_id,
      updated: new Date().toISOString(),
    }, vaultDir);
  }

  return { ok: true, canonical: canonical.slug, merged: duplicates.map(n => n.slug) };
}

const HANDLERS = {
  'memory-cleanup': applyMemoryCleanup,
};

export function hasHandler(topic) {
  return Object.prototype.hasOwnProperty.call(HANDLERS, topic);
}

// ─── Apply ──────────────────────────────────────────────────────────────────

/**
 * Execute one proposal.
 *
 * @param {string} vaultDir
 * @param {string} id proposal_id
 * @param {object} [opts]
 * @param {boolean} [opts.dryRun] compute the change without writing
 * @param {string}  [opts.actor] who triggered this (audit only)
 * @returns {Promise<object>} result with `ok`
 */
export async function applyProposal(vaultDir, id, opts = {}) {
  const { dryRun = false, actor = 'cli' } = opts;
  const proposal = getProposal(vaultDir, id);
  if (!proposal) throw new Error(`Proposal not found: ${id}`);

  if (TERMINAL_STATUSES.has(proposal.status)) {
    return { ok: false, reason: `Proposal is already ${proposal.status}.` };
  }
  const handler = HANDLERS[proposal.topic];
  if (!handler) {
    return { ok: false, reason: `No handler for topic "${proposal.topic}" — this proposal must be actioned manually.` };
  }

  let result;
  try {
    result = await handler(vaultDir, proposal, { dryRun });
  } catch (err) {
    // A thrown handler is a bug, not a rejection: leave the proposal open so the
    // failure is visible and retryable rather than silently marked done.
    logger.error('proposal-applier', `Handler threw for ${id}: ${err.message}`);
    appendProposalAudit(vaultDir, { action: 'apply_error', proposal_id: id, topic: proposal.topic, actor, error: err.message });
    return { ok: false, reason: `Handler error: ${err.message}` };
  }

  if (dryRun) return { ...result, dryRun: true };

  if (result.ok) {
    await setProposalStatus(vaultDir, id, 'applied', { applied_at: new Date().toISOString(), applied_by: actor });
  } else if (result.supersede) {
    // The world moved on — the proposal was never wrong, it is just no longer
    // actionable. Marking it `rejected` would misreport the gate's accuracy.
    await setProposalStatus(vaultDir, id, 'superseded', { superseded_reason: result.reason });
  }

  appendProposalAudit(vaultDir, {
    action: result.ok ? 'apply' : 'apply_failed',
    proposal_id: id,
    topic: proposal.topic,
    actor,
    detail: result,
  });
  return result;
}

/**
 * Apply every accepted, auto-applicable proposal. Called once per dream cycle.
 *
 * Bounded per run so a vault that accumulated a backlog cannot turn one cycle
 * into an hours-long mutation storm.
 */
export async function applyAcceptedProposals(vaultDir, { limit = 25, actor = 'daemon' } = {}) {
  const queue = listProposals(vaultDir, { status: 'accepted' })
    .filter(p => AUTO_APPLICABLE_TOPICS.has(p.topic) && hasHandler(p.topic))
    .slice(0, limit);

  const results = { applied: 0, superseded: 0, failed: 0, skipped: 0 };
  for (const proposal of queue) {
    const result = await applyProposal(vaultDir, proposal.proposal_id, { actor });
    if (result.ok) results.applied++;
    else if (result.supersede) results.superseded++;
    else results.failed++;
  }

  // Report what we deliberately left behind. A silent cap reads as "queue empty".
  const totalEligible = listProposals(vaultDir, { status: 'accepted' })
    .filter(p => AUTO_APPLICABLE_TOPICS.has(p.topic)).length;
  if (totalEligible > 0) {
    results.skipped = totalEligible;
    logger.info('proposal-applier', `${totalEligible} auto-applicable proposals remain after this run's limit of ${limit}.`);
  }

  return results;
}

/**
 * Proposals whose key no longer matches anything the generators would produce.
 * Exposed for the CLI so a user can see what is stale before pruning.
 */
export function staleProposalKeys(vaultDir, currentProposals) {
  const live = new Set(currentProposals.map(proposalKey));
  return listProposals(vaultDir, { status: ['draft', 'accepted'] })
    .filter(p => !live.has(proposalKey(p)))
    .map(p => p.proposal_id);
}
