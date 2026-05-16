import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { loadNodes, writeNode } from './vault.mjs';

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
  const nodes = loadNodes(vaultDir);
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
export async function generateSkillImprovementProposals(vaultDir) {
  // Stub for Phase 4
  return [];
}

export async function generateWorkflowRepairProposals(vaultDir) {
  // Stub for Phase 4
  return [];
}

export async function generateModelRoutingProposals(vaultDir) {
  // Stub for Phase 4
  return [];
}

export async function generateStaleKnowledgeRefreshProposals(vaultDir) {
  const nodes = loadNodes(vaultDir);
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
