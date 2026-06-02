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

export function createProposal(category, summary, targetPath = null, rationale = '') {
  const proposalId = `prop_${crypto.randomBytes(6).toString('hex')}`;
  return {
    type: 'proposal',
    proposal_id: proposalId,
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
    const key = `${node.predicate}:${node.object}`;
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

export async function generateStaleKnowledgeRefreshProposals(vaultDir) {
  const nodes = getNodes(vaultDir);
  const proposals = [];
  
  const now = Date.now();
  const ONE_MONTH_MS = 30 * 24 * 60 * 60 * 1000;
  
  for (const node of nodes) {
    if (node.type === 'memory' && node.last_accessed) {
      const lastAccessed = new Date(node.last_accessed).getTime();
      if (now - lastAccessed > ONE_MONTH_MS && node.importance > 3) {
        proposals.push(createProposal(
          'stale-knowledge-refresh',
          `Refresh stale high-importance memory: ${node.title}`,
          node.slug,
          `Node has not been accessed in over 30 days but maintains high importance. Requires verification against current state.`
        ));
      }
    }
  }
  
  return proposals;
}

/**
 * Local Eval Gate for Proposal Promotion
 * Uses the local runtime to evaluate the validity of a proposal.
 */
export async function evaluateProposalGate(proposal, runtimeConfig) {
  // In a production scenario, this calls the local LLM runtime to grade the proposal.
  // For now, we simulate the evaluation gate based on deterministic rules or simple heuristics.
  if (proposal.category === 'memory-cleanup' && proposal.rationale.includes('identical predicate:object')) {
    proposal.status = 'accepted';
    proposal.reviewed_at = new Date().toISOString();
    proposal.reviewed_by = 'local_eval_gate';
    return true;
  }
  
  if (proposal.category === 'stale-knowledge-refresh') {
    proposal.status = 'accepted';
    proposal.reviewed_at = new Date().toISOString();
    proposal.reviewed_by = 'local_eval_gate';
    return true;
  }
  
  proposal.status = 'rejected';
  proposal.rejection_reason = 'Failed to meet minimum evaluation threshold for automatic promotion.';
  proposal.reviewed_at = new Date().toISOString();
  proposal.reviewed_by = 'local_eval_gate';
  return false;
}

// ─── Smart Decay ────────────────────────────────────────────────────────────────

const DECAY_SYSTEM = `You are a Memory Retention Analyst for a sovereign AI memory system.

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

