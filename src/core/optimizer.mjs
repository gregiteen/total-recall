import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import matter from 'gray-matter';
import { writeNode } from './vault.mjs';
import { getNodes } from './vault-cache.mjs';
import { logger } from './logger.mjs';
import { brainDir } from './config.mjs';

/**
 * Total Recall Optimizer
 * Instead of mutating memory directly, the optimizer generates Proposals.
 * Proposals must pass a local evaluation gate before being accepted.
 */

/**
 * Stable identity for a proposal: its topic plus what it points at.
 *
 * A proposal's slug is random (`prop_<hex>`), so two proposals asking for the
 * exact same work never collide on disk — they just both get written. That is
 * how the global vault reached 16,309 proposals covering only 594 distinct
 * targets: every dream cycle re-filed the same tickets with new names.
 *
 * On read a proposal carries `category: 'proposals'` (the vault folder) with the
 * topic moved to `proposal_topic`; in memory, pre-write, the topic is still in
 * `category`. Normalize both shapes so a freshly generated proposal compares
 * equal to its own persisted copy.
 */
export function proposalKey(proposal = {}) {
  const topic = proposal.proposal_topic
    || (proposal.category && proposal.category !== 'proposals' ? proposal.category : null)
    || 'unknown';
  return `${topic}::${proposal.target_path || ''}`;
}

/**
 * Statuses that suppress re-filing an identical proposal.
 *
 * Everything except `superseded`. The generators are pure functions of vault
 * state, so a proposal the gate rejected yesterday is regenerated — and rejected
 * again — every single cycle. Treating `rejected` as "done, may re-file" leaked 5
 * new files per cycle indefinitely; a decision has to be remembered to be worth
 * making. `applied` suppresses for the same reason.
 *
 * `superseded` is the sole exception, and deliberately so: it means the world
 * changed underneath the proposal, so the same request may legitimately become
 * valid again. Note the key includes the target set, so a genuinely different
 * duplicate group produces a different key and files normally regardless.
 */
const SUPPRESSING_PROPOSAL_STATUSES = new Set(['draft', 'accepted', 'applied', 'rejected']);

/**
 * Keys of proposals already on disk whose existence should stop an identical one
 * being filed again — see {@link SUPPRESSING_PROPOSAL_STATUSES}.
 */
export function loadOpenProposalKeys(vaultDir) {
  const keys = new Set();
  // Read proposals/ off disk directly. getNodes() deliberately returns ONLY
  // type:memory nodes — proposals are invisible to it — so a getNodes()-based
  // check silently sees zero existing proposals and suppresses nothing.
  const proposalsDir = path.join(vaultDir, 'proposals');
  if (!fs.existsSync(proposalsDir)) return keys;

  let files;
  try {
    files = fs.readdirSync(proposalsDir).filter(f => f.endsWith('.md'));
  } catch (err) {
    // Fail loud-ish: an unreadable dir means we cannot dedupe, and writing
    // duplicates is exactly the runaway this guard exists to stop.
    logger.error('optimizer', `Cannot read proposals dir; duplicate suppression disabled: ${err.message}`, { proposalsDir });
    return keys;
  }

  for (const file of files) {
    try {
      const { data } = matter(fs.readFileSync(path.join(proposalsDir, file), 'utf8'));
      if (!SUPPRESSING_PROPOSAL_STATUSES.has(data.status)) continue;
      keys.add(proposalKey(data));
    } catch (err) {
      logger.debug('optimizer: skipping unparseable proposal', { file, err: err.message });
    }
  }
  return keys;
}

/**
 * Drop proposals that duplicate an open one on disk, or each other.
 * @returns {{ kept: object[], suppressed: number }}
 */
export function dedupeProposals(proposals, vaultDir) {
  const seen = loadOpenProposalKeys(vaultDir);
  const kept = [];
  let suppressed = 0;
  for (const p of proposals) {
    const key = proposalKey(p);
    if (seen.has(key)) {
      suppressed++;
      continue;
    }
    seen.add(key);
    kept.push(p);
  }
  return { kept, suppressed };
}

export function createProposal(category, summary, targetPath = null, rationale = '') {
  const proposalId = `prop_${crypto.randomBytes(6).toString('hex')}`;
  return {
    type: 'proposal',
    proposal_id: proposalId,
    slug: proposalId,
    // Vault folder for proposal documents (distinct from proposal.category topic)
    // prepareNodeForContract falls back to category=proposals when absent; set explicitly.
    // Note: SSSS field `category` here is the proposal topic (memory-cleanup, etc.).
    title: summary || proposalId,
    description: rationale || summary || 'Optimizer proposal',
    timestamp: new Date().toISOString(),
    category,
    status: 'draft',
    target_path: targetPath,
    summary,
    rationale,
    proposed_by: 'kernel_optimizer_v1',
    proposed_at: new Date().toISOString(),
  };
}

/**
 * Scans the vault for duplicate or contradictory memories and generates a cleanup proposal.
 */
export async function generateMemoryCleanupProposals(vaultDir) {
  const nodes = getNodes(vaultDir);
  const proposals = [];
  
  // Simple heuristic: find nodes with the same predicate and object but different subjects, or duplicate subjects.
  // In a real system, we would use local LLM / embeddings to find semantic duplicates.
  const conceptMap = new Map();
  
  for (const node of nodes) {
    if (node.type !== 'memory') continue;
    // Key on the FULL triple. Keying on predicate:object alone treats every node
    // sharing a type marker as a duplicate set: 15 distinct research projects all
    // carry `tracked_research_project:knowledge_vault` and differ only by subject.
    // The old key flagged them as one duplicate group — merging it would have
    // destroyed 14 legitimate records.
    const key = `${node.subject}:${node.predicate}:${node.object}`;
    if (!conceptMap.has(key)) {
      conceptMap.set(key, []);
    }
    conceptMap.get(key).push(node);
  }
  
  for (const [key, similarNodes] of conceptMap.entries()) {
    if (similarNodes.length > 1) {
      const paths = similarNodes.map(n => n.slug).join(', ');
      const proposal = createProposal(
        'memory-cleanup',
        `Merge similar memory nodes for concept [${key}]`,
        paths,
        `Detected ${similarNodes.length} nodes with identical predicate:object signatures. Merging them will reduce fragmentation.`
      );
      proposals.push(proposal);
    }
  }
  
  return proposals;
}

/**
 * Scans skill execution logs (if available) and proposes improvements.
 */
/**
 * Scan skill files for quality issues and propose improvements.
 * Looks at skill files that haven't been updated in >30 days and
 * checks for common issues: missing examples, vague instructions, outdated commands.
 */
export async function generateSkillImprovementProposals(vaultDir) {
  const agentDir = path.join(path.dirname(vaultDir));
  const skillsDir = path.join(agentDir, 'skills');
  const proposals = [];

  if (!fs.existsSync(skillsDir)) return proposals;

  const now = Date.now();
  const staleCutoff = 30 * 24 * 60 * 60 * 1000; // 30 days

  try {
    const skillDirs = fs.readdirSync(skillsDir, { withFileTypes: true })
      .filter(d => d.isDirectory())
      .map(d => path.join(skillsDir, d.name, 'SKILL.md'))
      .filter(p => fs.existsSync(p));

    for (const skillFile of skillDirs) {
      const stat = fs.statSync(skillFile);
      const ageMs = now - stat.mtimeMs;
      if (ageMs < staleCutoff) continue;

      const raw = fs.readFileSync(skillFile, 'utf8');
      const hasExamples = /##\s*example/i.test(raw);
      const hasCaution = /caution|warning|never|must not/i.test(raw);
      const lineCount = raw.split('\n').length;

      const issues = [];
      if (!hasExamples) issues.push('No examples section');
      if (!hasCaution) issues.push('No caution/constraint section');
      if (lineCount < 20) issues.push('Very short — may lack detail');

      if (issues.length > 0) {
        const skillName = path.basename(path.dirname(skillFile));
        proposals.push(createProposal(
          'skill-improvement',
          `Improve skill: ${skillName} (${issues.join(', ')})`,
          skillFile,
          `Skill file is ${Math.floor(ageMs / 86400000)} days old. Issues: ${issues.join('; ')}`,
        ));
      }
    }
  } catch (err) {
    logger.debug('optimizer: generateSkillImprovementProposals failed to read skillsDir', { err: err.message });
  }

  return proposals;
}

/**
 * Scan the task queue for stuck or stalled workflows.
 * Tasks that have been 'in-progress' for >1 hour are considered stalled.
 */
export async function generateWorkflowRepairProposals(vaultDir) {
  const queueDir = path.join(brainDir, 'scheduler', 'queue');
  const proposals = [];

  if (!fs.existsSync(queueDir)) return proposals;

  const now = Date.now();
  const stalledCutoff = 60 * 60 * 1000; // 1 hour

  try {
    const files = fs.readdirSync(queueDir).filter(f => f.endsWith('.md'));
    for (const file of files) {
      const raw = fs.readFileSync(path.join(queueDir, file), 'utf8');
      const { data } = matter(raw);
      if (data.status !== 'in-progress') continue;

      const updatedAt = new Date(data.updated_at || data.created || 0).getTime();
      if (now - updatedAt < stalledCutoff) continue;

      proposals.push(createProposal(
        'workflow-repair',
        `Stalled task: ${data.slug || file}`,
        path.join(queueDir, file),
        `Task has been in-progress for ${Math.floor((now - updatedAt) / 60000)} minutes. May need retry or cancellation.`,
      ));
    }
  } catch (err) {
    logger.debug('optimizer: generateWorkflowRepairProposals failed to read queueDir', { err: err.message });
  }

  return proposals;
}

/**
 * Analyze the vault's model usage patterns and propose routing improvements.
 * Flags cases where high-priority tasks were sent to the local LLM
 * that should have used a frontier model.
 */
export async function generateModelRoutingProposals(vaultDir) {
  const proposals = [];
  const nodes = getNodes(vaultDir);

  // Find high-importance facts with low confidence — likely needed frontier model
  const underconfident = nodes.filter(n =>
    n.status === 'active' &&
    n.category === 'facts' &&
    n.importance >= 4 &&
    n.confidence < 0.6 &&
    n.source?.agent === 'fact-seeker',
  );

  for (const node of underconfident.slice(0, 5)) {
    proposals.push(createProposal(
      'model-routing',
      `Re-research with frontier model: "${node.title}"`,
      node.slug,
      `High-importance fact (importance: ${node.importance}) has low confidence (${node.confidence}). Originally researched by local model. Frontier model may produce better synthesis.`,
    ));
  }

  return proposals;
}

/**
 * Nodes that are important but have gone untouched — computed on demand.
 *
 * "Which memories are stale?" is a question, not a filing cabinet. Deriving it
 * at read time costs one vault scan and is always current; the previous design
 * answered it by writing one .md ticket per stale node every dream cycle, which
 * is how 594 real answers became 16,309 files.
 *
 * @returns {object[]} stale nodes, most stale first
 */
export function findStaleNodes(vaultDir, { days = 30, minImportance = 4 } = {}) {
  const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
  return getNodes(vaultDir)
    .filter(n => n.type === 'memory'
      && n.status === 'active'
      && n.last_accessed
      && n.importance >= minImportance
      && new Date(n.last_accessed).getTime() < cutoff)
    .sort((a, b) => new Date(a.last_accessed) - new Date(b.last_accessed));
}

/**
 * Hand stale high-importance memories to the research daemon, which can actually
 * re-verify them and commit the result — instead of filing a ticket asking
 * someone else to.
 *
 * Rate-limited per cycle: re-researching hundreds of nodes at once would swamp
 * the daemon and burn provider budget. Most-stale-first means the backlog drains
 * in a sensible order across cycles. `addToQueue` dedupes by topic, so a node
 * already queued is never enqueued twice.
 *
 * @returns {{ enqueued: string[], stale: number }}
 */
export async function refreshStaleKnowledge(vaultDir, { limit = 3, days = 30, minImportance = 4 } = {}) {
  const { addToQueue } = await import('./research-queue.mjs');
  const stale = findStaleNodes(vaultDir, { days, minImportance });
  const enqueued = [];

  for (const node of stale.slice(0, limit)) {
    const ageDays = Math.floor((Date.now() - new Date(node.last_accessed).getTime()) / 86400000);
    try {
      addToQueue({
        topic: `Verify still-current: ${node.title}`,
        priority: node.importance >= 5 ? 'high' : 'medium',
        notes: `Memory node "${node.slug}" (importance ${node.importance}) has not been accessed in ${ageDays} days. Re-verify its claim against current sources and update or archive it.`,
      });
      enqueued.push(node.slug);
    } catch (err) {
      logger.warn('optimizer', `Could not enqueue staleness research for ${node.slug}: ${err.message}`);
    }
  }

  if (stale.length > enqueued.length) {
    logger.info('optimizer', `${stale.length - enqueued.length} stale nodes deferred to a later cycle (limit ${limit}).`);
  }
  return { enqueued, stale: stale.length };
}

/**
 * @deprecated Superseded by {@link refreshStaleKnowledge}, which queues real work
 * instead of writing tickets nothing reads. Retained because the dream cycle's
 * master switch still references it and because removing it would silently change
 * behavior for anyone who flips that switch back on.
 */
export async function generateStaleKnowledgeRefreshProposals(vaultDir) {
  return findStaleNodes(vaultDir, { days: 30, minImportance: 4 }).map(node => createProposal(
    'stale-knowledge-refresh',
    `Refresh stale high-importance memory: ${node.title}`,
    node.slug,
    'Node has not been accessed in over 30 days but maintains high importance. Requires verification against current state.',
  ));
}

/**
 * Local Eval Gate for Proposal Promotion
 * Uses the local runtime to evaluate the validity of a proposal.
 */
export async function evaluateProposalGate(proposal, runtimeConfig, vaultDir = null) {
  const stamp = (status, extra = {}) => {
    proposal.status = status;
    proposal.reviewed_at = new Date().toISOString();
    proposal.reviewed_by = 'local_eval_gate';
    Object.assign(proposal, extra);
    return status === 'accepted';
  };

  // memory-cleanup is the one topic a machine can verify end to end, so it is
  // the only one that may reach `accepted` (and therefore auto-apply) unattended.
  // Verify against the live vault rather than the rationale string — the old gate
  // accepted on `rationale.includes('identical predicate:object')`, which is the
  // optimizer grading its own prose.
  if (proposal.category === 'memory-cleanup') {
    const slugs = String(proposal.target_path || '').split(',').map(s => s.trim()).filter(Boolean);
    if (slugs.length < 2) {
      return stamp('rejected', { rejection_reason: `Merge proposal names ${slugs.length} target(s); needs at least 2.` });
    }
    if (vaultDir) {
      const bySlug = new Map(getNodes(vaultDir).map(n => [n.slug, n]));
      const active = slugs.map(s => bySlug.get(s)).filter(n => n && n.status === 'active');
      if (active.length < 2) {
        return stamp('rejected', { rejection_reason: `Only ${active.length} of ${slugs.length} targets are still active nodes.` });
      }
      const signatures = new Set(active.map(n => `${n.subject}:${n.predicate}:${n.object}`));
      if (signatures.size !== 1) {
        return stamp('rejected', { rejection_reason: `Targets span ${signatures.size} distinct subject:predicate:object signatures — not a duplicate set.` });
      }
      // Mirror the applier's safety rules here so an unsafe merge never reaches
      // `accepted` in the first place. The gate is what makes a proposal eligible
      // for unattended application; it must not be laxer than the applier.
      const { MAX_AUTO_MERGE_SET, findDissimilarPair } = await import('./proposal-applier.mjs');
      if (active.length > MAX_AUTO_MERGE_SET) {
        return stamp('draft', { review_reason: `${active.length} targets exceeds the auto-merge cap of ${MAX_AUTO_MERGE_SET}; needs human review.` });
      }
      const dissimilar = findDissimilarPair(active);
      if (dissimilar) {
        return stamp('rejected', { rejection_reason: `Targets share a signature but their content differs (${dissimilar}).` });
      }
      // Invariants and absolute rules are never auto-merged; a wrong merge here
      // is noticed only when the agent quietly stops obeying a rule.
      const guarded = active.filter(n => n.priority === 'absolute' || n.importance >= 5 || n.category === 'invariants');
      if (guarded.length > 0) {
        return stamp('draft', { review_reason: `Touches protected nodes (${guarded.map(n => n.slug).join(', ')}); needs human review.` });
      }
    }
    return stamp('accepted');
  }

  // stale-knowledge-refresh no longer produces tickets at all — the work is
  // handed to the research queue, which can actually perform it. If one is
  // somehow generated, it is not something to auto-accept.
  if (proposal.category === 'stale-knowledge-refresh') {
    return stamp('draft', { review_reason: 'Staleness is handled by the research queue; this ticket needs a human decision.' });
  }

  // Everything else is real work that needs judgement (skill rewrites, stalled
  // workflows, model routing). `draft` parks it for review. The old gate marked
  // these `rejected`, which quietly discarded legitimate findings and made the
  // gate's accept rate look meaningful when it was ~100% of what it kept.
  return stamp('draft', { review_reason: `No automated verifier for topic "${proposal.category}"; queued for human review.` });
}

// ─── Smart Decay ────────────────────────────────────────────────────────────────

const DECAY_SYSTEM = `You are a Memory Retention Analyst for an AI memory system.

Given a memory node that has not been accessed recently, evaluate whether it should be:
1. RETAINED — still relevant and valuable
2. ARCHIVED — no longer active but worth keeping as historical record
3. DECAYED — safe to archive with low confidence flag

Output valid JSON:
{
  "verdict": "RETAINED" | "ARCHIVED" | "DECAYED",
  "confidence_adjustment": -0.2 to 0.0,
  "reasoning": "string"
}

Criteria:
- RETAINED: Foundational principles, architectural decisions, active rules
- ARCHIVED: Historical context, superseded patterns, solved problems
- DECAYED: Temporary workarounds, version-specific hacks, stale configs

Output ONLY valid JSON.`;

/**
 * LLM-powered Smart Decay — evaluates each node individually rather than
 * applying blind half-life. Produces decay proposals for the optimizer gate.
 *
 * @param {string} vaultDir
 * @param {object} runtimeConfig
 * @param {number} [ageThresholdDays=60]  Minimum age before considering decay
 * @returns {object[]} decay proposals
 */
export async function runSmartDecay(vaultDir, runtimeConfig, ageThresholdDays = 60) {
  const { callLocalRuntime } = await import('./runtime.mjs');
  const nodes = getNodes(vaultDir);
  const now = Date.now();
  const ageThresholdMs = ageThresholdDays * 24 * 60 * 60 * 1000;
  const proposals = [];

  // Candidates: active, not absolute priority, not accessed recently
  const candidates = nodes.filter(n => {
    if (n.status !== 'active') return false;
    if (n.priority === 'absolute') return false;
    if (n.importance >= 5) return false;
    const lastAccessed = new Date(n.last_accessed || n.updated || 0).getTime();
    return (now - lastAccessed) > ageThresholdMs;
  });

  // Process up to 5 candidates per run to avoid excessive LLM calls
  const batch = candidates.slice(0, 5);

  for (const node of batch) {
    const ageDays = Math.floor((now - new Date(node.last_accessed || node.updated || 0).getTime()) / (1000 * 60 * 60 * 24));

    const prompt = [
      `## Memory Node: ${node.slug}`,
      `Title: "${node.title}"`,
      `Category: ${node.category} | Importance: ${node.importance} | Age: ${ageDays} days`,
      `Tags: ${(node.tags || []).join(', ')}`,
      '',
      '## Body',
      (node.body || '').slice(0, 800),
      '',
      `This node has not been accessed in ${ageDays} days. Should it be retained, archived, or decayed?`,
    ].join('\n');

    try {
      const rawResponse = await callLocalRuntime(prompt, DECAY_SYSTEM, runtimeConfig);
      const jsonMatch = rawResponse.match(/\{[\s\S]*\}/);
      if (!jsonMatch) continue;

      const result = JSON.parse(jsonMatch[0]);
      const verdict = result.verdict || 'RETAINED';

      if (verdict !== 'RETAINED') {
        proposals.push(createProposal(
          'smart-decay',
          `Smart Decay [${verdict}]: "${node.title}"`,
          node.slug,
          `Age: ${ageDays} days. Reasoning: ${result.reasoning || 'No reasoning provided.'} Confidence adjustment: ${result.confidence_adjustment || 0}`,
        ));
      }
    } catch {
      // Skip failed evaluations silently
    }
  }

  return proposals;
}

