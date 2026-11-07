/** Local task capsules: explicit required rules, ranked supporting knowledge, complete-render accounting. */

import { getNodes } from './vault-cache.mjs';
import crypto from 'node:crypto';
import { selectRules, assembleContext, curatedRules, ruleFingerprint, RULE_CATEGORIES } from './context-policy.mjs';
import { retrieveTaskKnowledge, summarizeRetrieval } from './task-context.mjs';
import { inferMemoryLayer, memoryLayerRoutingWeight } from './memory-layers.mjs';

// ─── Token Budget Defaults ──────────────────────────────────────────────────

const DEFAULT_BUDGET = { total: 4000 };

// Rough token estimation: ~4 chars per token (conservative)
const CHARS_PER_TOKEN = 4;

function estimateTokens(text) {
  if (!text) return 0;
  return Math.ceil(text.length / CHARS_PER_TOKEN);
}

// ─── Temporal Scoring ───────────────────────────────────────────────────────

/**
 * Compute temporal relevance boost for a vault node.
 * Same formula as search.mjs but extracted for reuse.
 */
function temporalScore(node) {
  if (!node) return 1.0;
  const now = Date.now();

  // Recency: exponential decay
  let recency = 1.0;
  const lastAccessed = node.last_accessed || node.updated || node.created;
  if (lastAccessed) {
    const ageMs = now - new Date(lastAccessed).getTime();
    const halfLifeDays = node.decay?.half_life_days || 7;
    const halfLifeMs = halfLifeDays * 24 * 60 * 60 * 1000;
    recency = Math.pow(0.5, ageMs / halfLifeMs);
    recency = Math.max(recency, 0.05);
  }

  // Confidence
  const confidence = typeof node.confidence === 'number' ? node.confidence : 1.0;
  const confidenceWeight = 0.5 + (confidence * 0.5);

  // Frequency
  const accessCount = node.decay?.access_count ?? 0;
  const frequencySignal = 1.0 + (Math.log10(accessCount + 1) * 0.2);

  // Importance
  const importance = typeof node.importance === 'number' ? node.importance : 3;
  const importanceBoost = 0.8 + ((importance - 1) * 0.1);

  // Priority
  const priorityBoost = node.priority === 'absolute' ? 1.3 : 1.0;

  // Layer
  const layer = inferMemoryLayer(node);
  const layerWeight = memoryLayerRoutingWeight(layer);

  const momentumBoost = node._momentum ? 1.25 : 1.0;
  return recency * confidenceWeight * frequencySignal * importanceBoost * priorityBoost * layerWeight * momentumBoost;
}

export async function compileContext({
  query = '', vaultDir, derivedDir, budget = {}, consumer = 'api',
  momentumSlugs = [], actions = [], projectRoot = process.cwd(), semantic = true,
  nodes, contributions = [], versionInputs = '', includeKnowledge = true, indexScopes,
  knowledgeOptions = {},
} = {}) {
  const startTime = Date.now();
  const b = { ...DEFAULT_BUDGET, total: 4000, ...budget };
  const allNodes = (nodes || getNodes(vaultDir)).map(n => ({ ...n }));
  const rules = selectRules(curatedRules(allNodes), { actions, projectRoot });
  const required = rules.map(n => ({ id: `${n._layer || 'project'}:${n.slug}`, required: true,
    text: n._directive ? `[${n.slug}] ${n._directive}` : `## ${n.title || n.slug} [${n.slug}]\n\n${(n.body || n.content || '').trim()}` }));
  const knowledge = includeKnowledge ? await retrieveTaskKnowledge({ query, nodes: allNodes, derivedDir, indexScopes,
    projectRoot, actions, semantic, ...knowledgeOptions }) : { contributions: [], summary: { mode: 'disabled', selected: 0 }, queryVector: null };

  // CLI Semantic Index recommendations: top task-matched runnable CLI verbs
  let cliVerbContribution = null;
  if (query && String(query).trim()) {
    try {
      const { queryCliSemanticIndex } = await import('./cli-semantic-index.mjs');
      const matchedVerbs = await queryCliSemanticIndex(query, {
        derivedDir,
        projectRoot,
        limit: 3,
        minScore: 0.35,
        queryEmbedding: knowledge.queryVector,
      });
      if (matchedVerbs.length > 0) {
        const verbLines = matchedVerbs.map(verb => {
          const description = String(verb.description || '').replace(/\s+/g, ' ').trim();
          const brief = description.length <= 120 ? description : description.slice(0, 120).replace(/\s+\S*$/, '…');
          return `- \`${verb.verb}\`${brief ? ` — ${brief}` : ''}`;
        });
        const mode = matchedVerbs.some(verb => Number.isFinite(verb.vectorScore)) ? 'hybrid' : 'lexical';
        cliVerbContribution = {
          id: 'cli:recommended-verbs',
          required: false,
          text: `### Recommended task commands (${mode})\n${verbLines.join('\n')}\nUse command help for current arguments.`,
        };
        knowledge.summary.commandReferences = { count: matchedVerbs.length, mode };
      }
    } catch {
      /* non-fatal */
    }
  }

  const cliContributions = cliVerbContribution ? [cliVerbContribution] : [];
  const evidence = knowledge.summary.selected
    ? knowledge.contributions.map(item => ({ ...item, taskEvidence: true }))
    : knowledge.contributions;
  const supporting = [...evidence, ...cliContributions];
  const result = assembleContext([...required, ...supporting, ...contributions], { total: b.total });
  const evidenceMissing = supporting.some(item => !result.stats.contributions.some(placed => placed.id === item.id));
  // Compaction may reclaim rule explanation space; never claim readiness after losing selected task evidence.
  result.ready = result.ready && !evidenceMissing;
  result.stats.evidence_overflow = evidenceMissing;
  // The compaction path consumes the same retrieved evidence, never a second rules-only reconstruction.
  result.taskKnowledge = { ...knowledge, contributions: supporting };
  // Which rules apply, in their exact words. Task text and the rest of the vault stay out, so an
  // unchanged rule set can be told apart from a changed one (`version` varies with both).
  result.stats.rules_hash = crypto.createHash('sha256')
    .update(JSON.stringify([...required, ...contributions.filter(item => item.required)].map(item => [item.id, item.text]).sort()))
    .digest('hex').slice(0, 16);
  result.stats.retrieval = knowledge.summary;
  result.stats.total_nodes = allNodes.length;
  result.stats.compile_ms = Date.now() - startTime;
  result.stats.consumer = consumer;
  result.stats.actions = actions;
  result.stats.curation_sources = allNodes.filter(n => RULE_CATEGORIES.has(n.category)).map(n => ({
    id: `${n._layer || 'project'}:${n.slug}`, source_hash: ruleFingerprint(n),
  }));
  result.stats.unresolved_contradictions = rules.flatMap(node => (node.contradicts || [])
    .filter(slug => rules.some(other => other.slug === slug)).map(slug => [node.slug, slug]));
  result.stats.version = crypto.createHash('sha256').update(JSON.stringify({
    policy: 2, projectRoot, actions, includeKnowledge, versionInputs, nodes: allNodes, capsule: result.stats.version,
  })).digest('hex');
  result.stats.mode = knowledge.summary.mode;
  result.stats.slots = { invariants: { nodes: rules.filter(n => n.category === 'invariants').length,
    tokens: result.stats.required_tokens } };
  result.stats.slots_filled = result.stats.contributions.length;
  return result;
}

/**
 * Second line of every text capsule, so output that is truncated or piped through
 * `head` still carries the rule (the rule once sat at line 544 of the output and
 * an agent that cut the output at 80 lines never saw it).
 */
export const PREFLIGHT_NOTICE = 'PREFLIGHT: before any other tool call, read this whole capsule (never pipe or truncate it), then run this on its own, with nothing piped, chained or redirected: total-recall tr-preflight --ack --task "<task>" --action read,edit,test';

export function renderCapsule(result, format = 'json') {
  return format === 'text' ? `ready:${result.ready} tokens:${result.stats.total_tokens} version:${result.stats.version} rules_hash:${result.stats.rules_hash}\n${PREFLIGHT_NOTICE}\n${result.context}` : JSON.stringify(result);
}

/** Budget the actual wire representation, including metadata, escaping and status. */
export function capsuleResponse(result, { total = 4000, debug = false, format = 'json' } = {}) {
  if (!Number.isFinite(total) || total < 1) throw new Error('Context total must be a positive finite token estimate');
  const stats = debug ? { ...result.stats } : {
    version: result.stats.version, rules_hash: result.stats.rules_hash, mode: result.stats.mode,
    token_measurement: 'estimated_chars_divided_by_four',
    required_count: result.stats.required_ids.length, body_tokens: estimateTokens(result.context),
    retrieval: summarizeRetrieval(result.stats.retrieval),
  };
  const response = { ready: result.ready, context: result.context, stats };
  // This offset refers to the decoded context string, not the escaped JSON bytes.
  if (result.evidenceStart !== undefined) response.evidence_start = result.evidenceStart;
  stats.budget = total;
  // Counts affect serialization themselves. Iterate to a stable representation.
  for (let i = 0; i < 20; i++) {
    const previous = renderCapsule(response, format);
    stats.total_tokens = estimateTokens(previous + '\n');
    if (debug) {
      stats.budget_used = stats.total_tokens;
      stats.budget_remaining = Math.max(0, total - stats.total_tokens);
    }
    stats.overflow_tokens = Math.max(0, stats.total_tokens - total);
    response.ready = result.ready && stats.overflow_tokens === 0;
    if (renderCapsule(response, format) === previous) return response;
  }
  throw new Error('Context output accounting did not converge');
}

/**
 * Lightweight variant that returns pre-scored candidates without embedding lookup.
 * Used for fast context previews and budget estimation.
 */
export function previewContext({ vaultDir, budget = {} } = {}) {
  const b = { ...DEFAULT_BUDGET, ...budget };
  const allNodes = getNodes(vaultDir).map(n => ({ ...n }));
  const active = allNodes.filter(n => n.status === 'active');

  const candidates = active.map(node => ({
    slug: node.slug,
    category: node.category,
    title: node.title,
    temporal_score: temporalScore(node),
    tokens: estimateTokens(node.body || node.content || ''),
    layer: inferMemoryLayer(node),
    priority: node.priority || 'normal',
    importance: node.importance || 3,
    confidence: node.confidence ?? 1.0,
    last_accessed: node.last_accessed || null,
  }));

  candidates.sort((a, b) => b.temporal_score - a.temporal_score);

  return {
    candidates,
    budget: b,
    total_candidates: candidates.length,
    total_tokens: candidates.reduce((sum, c) => sum + c.tokens, 0),
  };
}
