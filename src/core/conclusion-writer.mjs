import fs from 'fs';
import path from 'path';
import matter from 'gray-matter';
import { callLocalRuntime } from './runtime.mjs';
import { atomicWrite, safeStringify } from './vault.mjs';
import { getNodes, invalidate } from './vault-cache.mjs';
import { logger } from './logger.mjs';

/**
 * Total Recall Conclusion Writer — Research → Active Validation Gate
 *
 * All research-derived facts arrive as status: draft in .agent/memory-inbox/pending/.
 * Before promoting any draft to status: active, the Conclusion Writer asks the local LLM:
 *   1. Is this fact self-consistent?
 *   2. Does it contradict any existing active node?
 *   3. Is the confidence appropriate given the source?
 *
 * If it passes, the node is promoted (status: active, moved to vault).
 * If it fails, it gets quarantined with a reason record.
 *
 * This prevents research hallucinations from polluting working memory.
 */

const VALIDATION_SYSTEM = `You are a Fact Validation Gate for an AI memory system called Total Recall.

You will be given a draft memory node and a list of related active nodes. Determine if the draft should be promoted to active memory.

Output valid JSON:
{
  "verdict": "APPROVE" | "REJECT" | "NEEDS_REVISION",
  "confidence_adjustment": -0.3 to +0.1,
  "reasoning": "string",
  "revision_instructions": "string (only if NEEDS_REVISION)"
}

Criteria for REJECT:
- Factual claim that contradicts an active node with higher confidence
- Circular or empty content (no actionable information)
- Obvious hallucination (specific version numbers without any evidence)
- Duplicate of an existing node

Criteria for NEEDS_REVISION:
- Directionally correct but confidence is too high for the evidence
- Title is misleading
- Body needs tightening

Criteria for APPROVE:
- Adds genuine new knowledge
- Does not contradict existing high-confidence nodes
- Confidence is appropriate for the evidence

Output ONLY valid JSON.`;

function buildValidationPrompt(draftNode, relatedActiveNodes) {
  const draftText = [
    `## Draft Node: ${draftNode.slug}`,
    `Title: "${draftNode.title}"`,
    `Category: ${draftNode.category} | Confidence: ${draftNode.confidence}`,
    `Source: ${draftNode.source?.type || 'unknown'} / ${draftNode.source?.agent || 'unknown'}`,
    '',
    '## Body',
    (draftNode.body || '').slice(0, 1200),
  ].join('\n');

  const relatedText = relatedActiveNodes.length > 0
    ? '\n\n## Related Active Nodes\n' + relatedActiveNodes.map(n => [
        `### [${n.slug}] ${n.title} (confidence: ${n.confidence})`,
        (n.body || '').slice(0, 400),
      ].join('\n')).join('\n\n')
    : '\n\n## Related Active Nodes\n(none)';

  return draftText + relatedText + '\n\nShould this draft be promoted to active memory?';
}

/**
 * Find active nodes related to a draft (same category or shared tags).
 */
function findRelatedNodes(draftNode, allActiveNodes) {
  return allActiveNodes
    .filter(n => {
      if (n.category !== draftNode.category) return false;
      const draftTags = new Set(draftNode.tags || []);
      const sharedTags = (n.tags || []).filter(t => draftTags.has(t));
      return sharedTags.length > 0;
    })
    .slice(0, 5); // Cap at 5 to keep prompt size manageable
}

/**
 * Run the validation gate on a single draft node.
 *
 * @param {object} draftNode      Parsed draft node object (includes _filepath)
 * @param {object[]} allActiveNodes All currently active nodes from vault
 * @param {object} opts
 * @param {string} opts.vaultDir     Path to memory vault
 * @param {string} opts.quarantineDir Path to quarantine directory
 * @param {object} opts.runtimeConfig Local LLM config
 * @returns {{ verdict: string, promoted: boolean, error?: string }}
 */
export async function validateDraftNode(draftNode, allActiveNodes, { vaultDir, quarantineDir, runtimeConfig }) {
  const relatedNodes = findRelatedNodes(draftNode, allActiveNodes);
  const prompt = buildValidationPrompt(draftNode, relatedNodes);

  let result;
  try {
    const rawResponse = await callLocalRuntime(prompt, VALIDATION_SYSTEM, runtimeConfig);
    const jsonMatch = rawResponse.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error('No JSON in response');
    result = JSON.parse(jsonMatch[0]);
  } catch (err) {
    logger.info({
      subsystem: 'conclusion-writer',
      message: `Validation failed for ${draftNode.slug}: ${err.message}`,
    });
    return { verdict: 'SKIP', promoted: false, error: err.message };
  }

  const verdict = result.verdict || 'REJECT';
  const confidenceAdj = Number(result.confidence_adjustment) || 0;

  if (verdict === 'APPROVE') {
    await promoteToVault(draftNode, confidenceAdj, vaultDir);
    logger.info({
      subsystem: 'conclusion-writer',
      message: `APPROVED: ${draftNode.slug} → ${draftNode.category}/`,
    });
    return { verdict: 'APPROVE', promoted: true };
  }

  if (verdict === 'NEEDS_REVISION') {
    await applyRevision(draftNode, confidenceAdj, result.revision_instructions);
    logger.info({
      subsystem: 'conclusion-writer',
      message: `NEEDS_REVISION: ${draftNode.slug} — revised in-place`,
    });
    return { verdict: 'NEEDS_REVISION', promoted: false };
  }

  // REJECT → quarantine
  await quarantineDraft(draftNode, result.reasoning || 'Rejected by validation gate', quarantineDir);
  logger.info({
    subsystem: 'conclusion-writer',
    message: `REJECTED: ${draftNode.slug} — ${result.reasoning}`,
  });
  return { verdict: 'REJECT', promoted: false };
}

async function promoteToVault(draftNode, confidenceAdj, vaultDir) {
  if (!draftNode._filepath) return;

  const raw = fs.readFileSync(draftNode._filepath, 'utf8');
  const { data, content } = matter(raw);

  // Promote
  data.status = 'active';
  data.confidence = Math.min(1.0, Math.max(0.1, (data.confidence || 0.5) + confidenceAdj));
  data.updated = new Date().toISOString();
  data.x_promoted_at = new Date().toISOString();

  // Compute target path in vault
  const targetDir = path.join(vaultDir, data.category || 'concepts');
  if (!fs.existsSync(targetDir)) {
    fs.mkdirSync(targetDir, { recursive: true });
  }

  const targetPath = path.join(targetDir, `${data.slug}.md`);
  atomicWrite(targetPath, safeStringify(content, data));
  invalidate(vaultDir);

  // Remove from inbox
  try { fs.unlinkSync(draftNode._filepath); } catch { /* ignore */ }
}

async function applyRevision(draftNode, confidenceAdj, revisionInstructions) {
  if (!draftNode._filepath || !revisionInstructions) return;

  const raw = fs.readFileSync(draftNode._filepath, 'utf8');
  const { data, content } = matter(raw);

  data.confidence = Math.min(1.0, Math.max(0.1, (data.confidence || 0.5) + confidenceAdj));
  data.x_revision_requested = revisionInstructions;
  data.updated = new Date().toISOString();

  atomicWrite(draftNode._filepath, safeStringify(content, data));
}

async function quarantineDraft(draftNode, reason, quarantineDir) {
  if (!fs.existsSync(quarantineDir)) {
    fs.mkdirSync(quarantineDir, { recursive: true });
  }

  if (!draftNode._filepath) return;

  const raw = fs.readFileSync(draftNode._filepath, 'utf8');
  const { data, content } = matter(raw);
  data.status = 'quarantined';
  data.x_quarantine_reason = reason;
  data.x_quarantined_at = new Date().toISOString();

  const targetPath = path.join(quarantineDir, `${data.slug}.md`);
  atomicWrite(targetPath, safeStringify(content, data));

  try { fs.unlinkSync(draftNode._filepath); } catch { /* ignore */ }
}

/**
 * Run the validation gate over all draft nodes in the inbox.
 *
 * @param {object} opts
 * @param {string} opts.inboxDir      Path to pending inbox
 * @param {string} opts.vaultDir      Path to memory vault
 * @param {string} opts.quarantineDir Path to quarantine
 * @param {object} opts.runtimeConfig
 * @returns {{ processed: number, approved: number, rejected: number }}
 */
export async function runConclusionWriter({ inboxDir, vaultDir, quarantineDir, runtimeConfig }) {
  if (!fs.existsSync(inboxDir)) {
    return { processed: 0, approved: 0, rejected: 0, skipped: 'no-inbox' };
  }

  const files = fs.readdirSync(inboxDir).filter(f => f.endsWith('.md'));
  if (files.length === 0) {
    return { processed: 0, approved: 0, rejected: 0, skipped: 'empty-inbox' };
  }

  // Load all active vault nodes for comparison
  const allActiveNodes = getNodes(vaultDir).filter(n => n.status === 'active');

  let approved = 0;
  let rejected = 0;

  // Process up to 10 drafts per run to avoid excessive LLM calls
  const batch = files.slice(0, 10);

  for (const file of batch) {
    const filepath = path.join(inboxDir, file);
    try {
      const raw = fs.readFileSync(filepath, 'utf8');
      const { data, content } = matter(raw);
      if (!data.slug || data.status !== 'draft') continue;

      const draftNode = { ...data, body: content.trim(), _filepath: filepath };
      const result = await validateDraftNode(draftNode, allActiveNodes, {
        vaultDir,
        quarantineDir,
        runtimeConfig,
      });

      if (result.promoted) approved++;
      else if (result.verdict === 'REJECT') rejected++;
    } catch (err) {
      logger.info({
        subsystem: 'conclusion-writer',
        message: `Error processing ${file}: ${err.message}`,
      });
    }
  }

  return { processed: batch.length, approved, rejected };
}
