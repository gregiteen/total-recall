import fs from 'fs';
import path from 'path';
import matter from 'gray-matter';
import crypto from 'crypto';
import { callLocalRuntime, cleanAndParseJSON } from './runtime.mjs';
import { atomicWrite, safeStringify } from './vault.mjs';
import { getNodes } from './vault-cache.mjs';
import { logger } from './logger.mjs';
import { brainDir } from './config.mjs';

/**
 * Total Recall System 2 Inference Engine
 *
 * Reads clusters of related memory nodes and asks the local LLM to:
 *   1. Draw higher-level conclusions
 *   2. Identify implicit patterns that should be explicit rules
 *   3. Find subtle contradictions that Jaccard wouldn't catch
 *
 * Produces new nodes with category: decisions or concepts,
 * x_memory_layer: system2, status: draft in the inbox.
 * All outputs are proposals — never direct mutations.
 */

// ─── Prompts ────────────────────────────────────────────────────────────────────

const INFERENCE_SYSTEM = `You are a System 2 Reasoning Engine for a sovereign AI memory system called Total Recall.

You will be given a cluster of related memory nodes. Your job is to reason deeply about them and produce higher-level conclusions.

Output valid JSON matching this schema:
{
  "conclusions": [
    {
      "title": "string",
      "body": "string",
      "category": "decisions" | "concepts" | "patterns",
      "confidence": 0.0-1.0,
      "reasoning": "string"
    }
  ],
  "contradictions": [
    {
      "node_a": "slug string",
      "node_b": "slug string",
      "description": "string"
    }
  ],
  "merge_candidates": [
    {
      "node_a": "slug string",
      "node_b": "slug string",
      "reason": "string"
    }
  ]
}

Guidelines:
- Only include conclusions that are genuinely new — not just summaries of existing nodes.
- Confidence reflects how well the evidence supports the conclusion.
- "contradictions" are only real logical contradictions, not just different topics.
- "merge_candidates" are nodes that say the same thing differently.
- Output ONLY valid JSON.`;

function buildInferencePrompt(nodes) {
  const nodeTexts = nodes.map(n => [
    `### [${n.slug}] ${n.title}`,
    `Category: ${n.category} | Confidence: ${n.confidence} | Layer: ${n.x_memory_layer || 'inferred'}`,
    (n.body || '').slice(0, 800),
  ].join('\n')).join('\n\n');

  return `Analyze these ${nodes.length} related memory nodes and reason about them:\n\n${nodeTexts}\n\nDraw higher-level conclusions, identify contradictions, and flag merge candidates.`;
}

// ─── Inference Execution ────────────────────────────────────────────────────────

/**
 * Run inference over a set of node slugs.
 *
 * @param {string[]} slugs     Node slugs to analyze
 * @param {object} opts
 * @param {string} opts.vaultDir     Path to memory vault
 * @param {string} opts.inboxDir     Path to memory inbox
 * @param {object} opts.runtimeConfig Local LLM config
 * @returns {{ conclusions: object[], contradictions: object[], merge_candidates: object[], error? }}
 */
export async function runInferenceTask(slugs, { vaultDir, inboxDir, runtimeConfig }) {
  const allNodes = getNodes(vaultDir);
  const nodes = allNodes.filter(n => slugs.includes(n.slug) && n.status === 'active');

  if (nodes.length < 2) {
    return { conclusions: [], contradictions: [], merge_candidates: [], skipped: 'too-few-nodes' };
  }

  const prompt = buildInferencePrompt(nodes);

  let result;
  try {
    const rawResponse = await callLocalRuntime(prompt, INFERENCE_SYSTEM, runtimeConfig);
    const jsonMatch = rawResponse.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error('No JSON in response');
    result = cleanAndParseJSON(jsonMatch[0]);
  } catch (err) {
    logger.info({
      subsystem: 'inference-engine',
      message: `Inference failed for slugs [${slugs.join(', ')}]: ${err.message}`,
    });
    return { conclusions: [], contradictions: [], merge_candidates: [], error: err.message };
  }

  const conclusions = Array.isArray(result.conclusions) ? result.conclusions : [];
  const contradictions = Array.isArray(result.contradictions) ? result.contradictions : [];
  const mergeCandidates = Array.isArray(result.merge_candidates) ? result.merge_candidates : [];

  // Write conclusions as draft nodes in the inbox
  if (!fs.existsSync(inboxDir)) {
    fs.mkdirSync(inboxDir, { recursive: true });
  }

  for (const conclusion of conclusions) {
    writeConclusionNode(inboxDir, conclusion, slugs, vaultDir);
  }

  // Write contradictions as conflict records
  if (contradictions.length > 0) {
    const conflictsDir = path.join(brainDir, 'memory-inbox', 'conflicts');
    for (const contradiction of contradictions) {
      writeContradictionRecord(conflictsDir, contradiction);
    }
  }

  // Write merge proposals
  if (mergeCandidates.length > 0) {
    const proposalsDir = path.join(vaultDir, 'proposals');
    for (const candidate of mergeCandidates) {
      writeMergeProposal(proposalsDir, candidate);
    }
  }

  logger.info({
    subsystem: 'inference-engine',
    message: `Inference complete: ${conclusions.length} conclusions, ${contradictions.length} contradictions, ${mergeCandidates.length} merge candidates`,
  });

  return { conclusions, contradictions, merge_candidates: mergeCandidates };
}

// ─── Node Writers ───────────────────────────────────────────────────────────────

function writeConclusionNode(inboxDir, conclusion, sourceSlugList, vaultDir) {
  const slug = `inference-${crypto.createHash('md5').update(conclusion.title || conclusion.description || JSON.stringify(conclusion)).digest('hex').slice(0, 8)}`;
  const now = new Date().toISOString();

  let latestPublished = null;
  let citations = null;
  
  if (vaultDir) {
    try {
      const allNodes = getNodes(vaultDir);
      citations = sourceSlugList.map(s => {
        const matchingNode = allNodes.find(n => n.slug === s);
        const cat = matchingNode ? matchingNode.category : 'facts';
        const published = matchingNode ? (matchingNode.updated || matchingNode.created || now) : now;
        if (!latestPublished || new Date(published) > new Date(latestPublished)) {
          latestPublished = published;
        }
        return {
          source: 'memory-vault',
          title: matchingNode ? matchingNode.title : `Memory Node: ${s}`,
          url: `file://${path.join(vaultDir, cat, s + '.md')}`,
          published,
          relevance: 1.0,
          accessed: now
        };
      });
    } catch (err) {
      logger.info({
        subsystem: 'inference-engine',
        message: `Failed to build citations for conclusion node: ${err.message}`
      });
    }
  }

  if (!citations) {
    citations = sourceSlugList.map(s => ({
      source: 'memory-vault',
      title: `Memory Node: ${s}`,
      url: `memory://${s}`,
      published: now,
      relevance: 1.0,
      accessed: now
    }));
  }

  const temporalContext = latestPublished || now;

  const frontmatter = {
    type: 'memory',
    slug,
    category: conclusion.category || 'concepts',
    title: conclusion.title || 'Inferred Conclusion',
    status: 'draft',
    confidence: Math.min(1.0, Math.max(0.0, Number(conclusion.confidence) || 0.7)),
    importance: 3,
    created: now,
    updated: now,
    last_accessed: now,
    source: {
      type: 'dream-cycle',
      session_id: `inference-${Date.now().toString(36)}`,
      agent: 'inference-engine',
      evidence_count: sourceSlugList.length,
    },
    supersedes: [],
    superseded_by: null,
    contradicts: [],
    tags: ['inference', 'system2', 'auto-generated'],
    related: sourceSlugList,
    routes_to_skills: [],
    sentiment_polarity: 'descriptive',
    sentiment_target: 'knowledge',
    modality: 'should',
    subject: 'agent',
    predicate: 'conclude',
    object: 'knowledge',
    decay: { half_life_days: 180, access_count: 1 },
    schema_version: 2,
    x_memory_layer: 'system2',
    x_reasoning: (conclusion.reasoning || '').slice(0, 500),
    x_temporal_context: temporalContext,
    x_citations: citations,
  };

  const body = conclusion.body || '';
  atomicWrite(path.join(inboxDir, `${slug}.md`), safeStringify(body, frontmatter));
}

function writeContradictionRecord(conflictsDir, contradiction) {
  if (!fs.existsSync(conflictsDir)) {
    fs.mkdirSync(conflictsDir, { recursive: true });
  }

  const slug = `contradiction-${crypto.createHash('md5').update(contradiction.node_a + contradiction.node_b).digest('hex').slice(0, 8)}`;
  const now = new Date().toISOString();

  const data = {
    type: 'conflict',
    slug,
    status: 'detected',
    detected_at: now,
    detected_by: 'inference-engine',
    node_a: contradiction.node_a,
    node_b: contradiction.node_b,
    description: contradiction.description || 'Logical contradiction detected by inference engine',
  };

  atomicWrite(
    path.join(conflictsDir, `${slug}.md`),
    safeStringify('', data),
  );
}

function writeMergeProposal(proposalsDir, candidate) {
  if (!fs.existsSync(proposalsDir)) {
    fs.mkdirSync(proposalsDir, { recursive: true });
  }

  const slug = `merge-proposal-${crypto.createHash('md5').update(candidate.node_a + candidate.node_b).digest('hex').slice(0, 8)}`;
  const now = new Date().toISOString();

  const data = {
    type: 'proposal',
    slug,
    category: 'memory-cleanup',
    status: 'draft',
    proposed_by: 'inference-engine',
    proposed_at: now,
    target_path: `${candidate.node_a},${candidate.node_b}`,
    summary: `Merge ${candidate.node_a} and ${candidate.node_b}`,
    rationale: candidate.reason || 'Nodes appear to express the same concept differently.',
  };

  atomicWrite(
    path.join(proposalsDir, `${slug}.md`),
    safeStringify('', data),
  );
}

// ─── Memory Synthesizer ─────────────────────────────────────────────────────────

const SYNTHESIS_SYSTEM = `You are a Memory Synthesizer for a sovereign AI memory system.

Given two memory nodes that may be similar, determine:
1. Are they saying the same thing? → "MERGE"
2. Are they complementary? → "LINK"
3. Are they actually about different things? → "KEEP"

Output valid JSON:
{
  "verdict": "MERGE" | "LINK" | "KEEP",
  "reason": "string",
  "merged_title": "string (only if MERGE)",
  "merged_body": "string (only if MERGE)"
}`;

/**
 * Compare two nodes semantically and suggest merge/link/keep.
 *
 * @param {string} slugA   First node slug
 * @param {string} slugB   Second node slug
 * @param {object} opts
 * @param {string} opts.vaultDir
 * @param {string} opts.inboxDir
 * @param {object} opts.runtimeConfig
 */
export async function runSynthesisTask(slugA, slugB, { vaultDir, inboxDir, runtimeConfig }) {
  const allNodes = getNodes(vaultDir);
  const nodeA = allNodes.find(n => n.slug === slugA);
  const nodeB = allNodes.find(n => n.slug === slugB);

  if (!nodeA || !nodeB) {
    return { verdict: 'KEEP', error: 'One or both nodes not found' };
  }

  const prompt = [
    `## Node A: ${nodeA.title}`,
    (nodeA.body || '').slice(0, 1000),
    '',
    `## Node B: ${nodeB.title}`,
    (nodeB.body || '').slice(0, 1000),
    '',
    'Should these nodes be MERGED, LINKED, or KEPT separate?',
  ].join('\n');

  try {
    const rawResponse = await callLocalRuntime(prompt, SYNTHESIS_SYSTEM, runtimeConfig);
    const jsonMatch = rawResponse.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error('No JSON in response');
    const result = cleanAndParseJSON(jsonMatch[0]);

    if (result.verdict === 'MERGE' && result.merged_title) {
      writeConclusionNode(inboxDir, {
        title: result.merged_title,
        body: result.merged_body || '',
        category: nodeA.category,
        confidence: Math.max(nodeA.confidence || 0, nodeB.confidence || 0),
        reasoning: `Merged from ${slugA} and ${slugB}: ${result.reason}`,
      }, [slugA, slugB], vaultDir);

      logger.info({
        subsystem: 'inference-engine',
        message: `MERGE proposed: ${slugA} + ${slugB} → ${result.merged_title}`,
      });
    } else if (result.verdict === 'LINK') {
      logger.info({
        subsystem: 'inference-engine',
        message: `LINK suggested: ${slugA} ↔ ${slugB}`,
      });
    }

    return result;
  } catch (err) {
    logger.info({
      subsystem: 'inference-engine',
      message: `Synthesis failed for ${slugA}/${slugB}: ${err.message}`,
    });
    return { verdict: 'KEEP', error: err.message };
  }
}
