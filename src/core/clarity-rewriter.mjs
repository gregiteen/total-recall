import fs from 'fs';
import path from 'path';
import matter from 'gray-matter';
import crypto from 'crypto';
import { callLocalRuntime, cleanAndParseJSON } from './runtime.mjs';
import { atomicWrite, safeStringify } from './vault.mjs';
import { getNodes, invalidate } from './vault-cache.mjs';
import { logger } from './logger.mjs';

/**
 * Total Recall Clarity Rewriter + Staleness Verifier
 *
 * Clarity Rewriter: LLM reviews each memory node and asks:
 *   - Is the title descriptive enough for 7-item skill injection?
 *   - Is the body actionable by an AI agent?
 *   - Does the frontmatter accurately reflect the content?
 *
 * Staleness Verifier: LLM evaluates if a fact is still current and
 *   generates research tasks for stale knowledge.
 *
 * Both produce proposals — never direct mutations.
 */

// ─── Clarity Rewriter ───────────────────────────────────────────────────────────

const CLARITY_SYSTEM = `You are a Memory Quality Inspector for a sovereign AI memory system called Total Recall.

You will be given a memory node. Evaluate its quality and suggest improvements.

Output valid JSON:
{
  "needs_rewrite": boolean,
  "quality_score": 1-10,
  "issues": ["string"],
  "rewritten_title": "string (if needs_rewrite)",
  "rewritten_body": "string (if needs_rewrite)"
}

Criteria for needs_rewrite = true:
- Title is vague (e.g., "Important thing to know") rather than descriptive
- Body is not actionable — an AI agent couldn't follow it
- Body is longer than 500 words when it could be concise
- Frontmatter category seems wrong for the content

Output ONLY valid JSON.`;

function buildClarityPrompt(node) {
  return [
    `## Memory Node: ${node.slug}`,
    `Title: "${node.title}"`,
    `Category: ${node.category}`,
    `Modality: ${node.modality}`,
    `Tags: ${(node.tags || []).join(', ')}`,
    '',
    '## Body',
    (node.body || '').slice(0, 1500),
    '',
    'Evaluate this node for clarity and actionability.',
  ].join('\n');
}

/**
 * Review a single node for clarity. Returns a rewrite proposal if needed.
 *
 * @param {string} slug           Node slug to review
 * @param {object} opts
 * @param {string} opts.vaultDir
 * @param {string} opts.inboxDir
 * @param {object} opts.runtimeConfig
 * @returns {{ rewrote: boolean, qualityScore?: number, error?: string }}
 */
export async function runClarityReview(slug, { vaultDir, inboxDir, runtimeConfig }) {
  const allNodes = getNodes(vaultDir);
  const node = allNodes.find(n => n.slug === slug);

  if (!node) {
    return { rewrote: false, error: 'Node not found' };
  }

  const prompt = buildClarityPrompt(node);

  let result;
  try {
    const rawResponse = await callLocalRuntime(prompt, CLARITY_SYSTEM, runtimeConfig);
    const jsonMatch = rawResponse.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error('No JSON in response');
    result = cleanAndParseJSON(jsonMatch[0]);
  } catch (err) {
    logger.info({
      subsystem: 'clarity-rewriter',
      message: `Clarity review failed for ${slug}: ${err.message}`,
    });
    return { rewrote: false, error: err.message };
  }

  if (!result.needs_rewrite) {
    logger.info({
      subsystem: 'clarity-rewriter',
      message: `${slug}: quality score ${result.quality_score}/10 — no rewrite needed`,
    });
    return { rewrote: false, qualityScore: result.quality_score };
  }

  // Write a rewrite proposal to the inbox
  if (!fs.existsSync(inboxDir)) {
    fs.mkdirSync(inboxDir, { recursive: true });
  }

  const proposalSlug = `clarity-rewrite-${slug}`;
  const now = new Date().toISOString();

  const proposalFrontmatter = {
    type: 'proposal',
    slug: proposalSlug,
    category: 'memory-cleanup',
    status: 'draft',
    proposed_by: 'clarity-rewriter',
    proposed_at: now,
    target_path: slug,
    summary: `Rewrite "${node.title}" for clarity (quality score: ${result.quality_score}/10)`,
    rationale: (result.issues || []).join('; '),
    x_rewritten_title: result.rewritten_title || node.title,
    x_quality_score: result.quality_score,
  };

  const proposalBody = result.rewritten_body
    ? `## Proposed Rewrite\n\n${result.rewritten_body}`
    : '## No rewrite body provided';

  atomicWrite(
    path.join(inboxDir, `${proposalSlug}.md`),
    safeStringify(proposalBody, proposalFrontmatter),
  );

  logger.info({
    subsystem: 'clarity-rewriter',
    message: `${slug}: rewrite proposal created (quality ${result.quality_score}/10)`,
  });

  return { rewrote: true, qualityScore: result.quality_score };
}

// ─── Staleness Verifier ─────────────────────────────────────────────────────────

const STALENESS_SYSTEM = `You are a Knowledge Currency Analyst for a sovereign AI memory system.

Given a memory node with its age and domain, assess whether the information is still current.

Output valid JSON:
{
  "verdict": "STILL_VALID" | "POSSIBLY_STALE" | "LIKELY_OUTDATED",
  "confidence": 0.0-1.0,
  "reasoning": "string",
  "verification_query": "string (search query to verify if possibly stale/outdated)"
}

Consider:
- Technical facts (API endpoints, library versions) age faster than principles
- Programming language features change every few years
- Best practices evolve; fundamental concepts are stable
- If the node is about a technology released after 2023, be more conservative

Output ONLY valid JSON.`;

function buildStalenessPrompt(node) {
  const age = node.updated
    ? Math.floor((Date.now() - new Date(node.updated).getTime()) / (1000 * 60 * 60 * 24))
    : 'unknown';

  return [
    `## Memory Node: ${node.slug}`,
    `Title: "${node.title}"`,
    `Category: ${node.category}`,
    `Tags: ${(node.tags || []).join(', ')}`,
    `Age: ${age} days since last update`,
    `Confidence: ${node.confidence}`,
    '',
    '## Content',
    (node.body || '').slice(0, 1000),
    '',
    'Is this information likely still current?',
  ].join('\n');
}

/**
 * Check if a node's knowledge is still current.
 *
 * @param {string} slug           Node slug to check
 * @param {object} opts
 * @param {string} opts.vaultDir
 * @param {string} opts.queueDir  Path to scheduler queue
 * @param {object} opts.runtimeConfig
 * @returns {{ verdict: string, confidence: number, error?: string }}
 */
export async function runStalenessCheck(slug, { vaultDir, queueDir, runtimeConfig }) {
  const allNodes = getNodes(vaultDir);
  const node = allNodes.find(n => n.slug === slug);

  if (!node) {
    return { verdict: 'STILL_VALID', error: 'Node not found' };
  }

  const prompt = buildStalenessPrompt(node);

  let result;
  try {
    const rawResponse = await callLocalRuntime(prompt, STALENESS_SYSTEM, runtimeConfig);
    const jsonMatch = rawResponse.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error('No JSON in response');
    result = cleanAndParseJSON(jsonMatch[0]);
  } catch (err) {
    logger.info({
      subsystem: 'staleness-verifier',
      message: `Staleness check failed for ${slug}: ${err.message}`,
    });
    return { verdict: 'STILL_VALID', error: err.message };
  }

  const verdict = result.verdict || 'STILL_VALID';

  logger.info({
    subsystem: 'staleness-verifier',
    message: `${slug}: ${verdict} (confidence ${result.confidence})`,
  });

  // If stale, generate a research refresh task
  if ((verdict === 'POSSIBLY_STALE' || verdict === 'LIKELY_OUTDATED') && result.verification_query) {
    if (!fs.existsSync(queueDir)) {
      fs.mkdirSync(queueDir, { recursive: true });
    }

    const taskSlug = `refresh-${slug}`;
    const priority = verdict === 'LIKELY_OUTDATED' ? 70 : 40;

    const taskData = {
      type: 'task',
      slug: taskSlug,
      priority,
      category: 'research-acquisition',
      target: slug,
      status: 'pending',
      created_by: 'staleness-verifier',
      reason: `Node "${node.title}" is ${verdict.replace('_', ' ').toLowerCase()}. Verification needed.`,
    };

    const taskBody = [
      `## Objective`,
      `Verify and refresh the knowledge in node "${slug}".`,
      '',
      `## Verification Query`,
      result.verification_query,
      '',
      `## Staleness Reasoning`,
      result.reasoning || 'No reasoning provided.',
    ].join('\n');

    atomicWrite(
      path.join(queueDir, `${taskSlug}.md`),
      safeStringify(taskBody, taskData),
    );

    logger.info({
      subsystem: 'staleness-verifier',
      message: `Refresh task queued for "${slug}" with query: ${result.verification_query}`,
    });
  }

  return { verdict, confidence: result.confidence || 0.5 };
}

// ─── Fact Seeker ─────────────────────────────────────────────────────────────────

const FACT_SEEKER_SYSTEM = `You are a Knowledge Gap Analyst for a sovereign AI memory system called Total Recall.

Given a summary of what the vault currently knows, identify knowledge gaps that would make the system more useful.

Output valid JSON:
{
  "gaps": [
    {
      "topic": "string",
      "question": "What specific fact or knowledge is missing?",
      "search_query": "string (web search query to fill the gap)",
      "priority": 1-5,
      "reasoning": "string"
    }
  ]
}

Focus on:
- Technical facts mentioned but never fully documented
- Dependencies/tools referenced without version information
- Patterns that lack concrete examples
- Skills that reference external APIs without documenting their behavior

Output ONLY valid JSON. Maximum 5 gaps.`;

/**
 * Scan the vault for knowledge gaps and generate research tasks.
 *
 * @param {object} opts
 * @param {string} opts.vaultDir
 * @param {string} opts.queueDir
 * @param {object} opts.runtimeConfig
 * @returns {{ gaps: object[], error?: string }}
 */
export async function runFactSeeker({ vaultDir, queueDir, runtimeConfig }) {
  const allNodes = getNodes(vaultDir);
  const activeNodes = allNodes.filter(n => n.status === 'active');

  if (activeNodes.length === 0) {
    return { gaps: [], skipped: 'empty-vault' };
  }

  // Build a compact vault summary
  const vaultSummary = activeNodes.map(n => [
    `- [${n.slug}] ${n.title}`,
    `  Category: ${n.category} | Tags: ${(n.tags || []).join(', ')} | Confidence: ${n.confidence}`,
  ].join('\n')).join('\n');

  const prompt = `## Current Vault Contents\n${vaultSummary}\n\nIdentify the most important knowledge gaps that would make this vault more useful.`;

  let result;
  try {
    const rawResponse = await callLocalRuntime(prompt, FACT_SEEKER_SYSTEM, runtimeConfig);
    const jsonMatch = rawResponse.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error('No JSON in response');
    result = cleanAndParseJSON(jsonMatch[0]);
  } catch (err) {
    logger.info({
      subsystem: 'fact-seeker',
      message: `Fact seeker failed: ${err.message}`,
    });
    return { gaps: [], error: err.message };
  }

  const gaps = Array.isArray(result.gaps) ? result.gaps : [];

  // Generate research tasks for high-priority gaps
  if (!fs.existsSync(queueDir)) {
    fs.mkdirSync(queueDir, { recursive: true });
  }

  for (const gap of gaps.filter(g => g.priority >= 3)) {
    const taskSlug = `fact-seeker-${crypto.createHash('md5').update(gap.query || gap.topic || '').digest('hex').slice(0, 8)}`;

    const taskData = {
      type: 'task',
      slug: taskSlug,
      priority: gap.priority * 15, // 45-75 range
      category: 'proactive-research',
      status: 'pending',
      created_by: 'fact-seeker',
      reason: `Knowledge gap identified: ${gap.question}`,
    };

    const taskBody = [
      `## Knowledge Gap`,
      `**Topic**: ${gap.topic}`,
      `**Question**: ${gap.question}`,
      '',
      `## Search Query`,
      gap.search_query,
      '',
      `## Reasoning`,
      gap.reasoning || '',
    ].join('\n');

    atomicWrite(
      path.join(queueDir, `${taskSlug}.md`),
      safeStringify(taskBody, taskData),
    );
  }

  logger.info({
    subsystem: 'fact-seeker',
    message: `Found ${gaps.length} knowledge gaps, queued ${gaps.filter(g => g.priority >= 3).length} research tasks`,
  });

  return { gaps };
}

// ─── Cutoff Assumption Auditor ───────────────────────────────────────────────────

/**
 * Domains where LLM knowledge decays fastest relative to the training cutoff.
 * Nodes touching these domains are automatically flagged for verification.
 */
const HIGH_DRIFT_DOMAINS = [
  'api', 'sdk', 'endpoint', 'version', 'release', 'changelog', 'deprecat',
  'npm', 'package', 'library', 'framework', 'model', 'pricing', 'rate limit',
  'token limit', 'context window', 'benchmark', 'leaderboard', 'sota',
  'openai', 'anthropic', 'google', 'gemini', 'claude', 'gpt', 'llama',
  'local_llm', 'hugging face', 'github', 'docker', 'kubernetes', 'terraform',
  'aws', 'gcp', 'azure', 'cloudflare', 'vercel', 'next.js', 'react', 'vite',
];

const CUTOFF_AUDIT_SYSTEM = `You are a Knowledge Cutoff Auditor for a sovereign AI memory system.

Your job is to identify claims in a memory node that are almost certainly based on the LLM's TRAINING DATA ONLY (intrinsic knowledge) and have a HIGH PROBABILITY of being outdated since the model's knowledge cutoff.

The current real-world date is: ${new Date().toISOString().slice(0, 10)}.

Output valid JSON:
{
  "has_cutoff_risk": boolean,
  "risk_level": "low" | "medium" | "high" | "critical",
  "intrinsic_claims": [
    {
      "claim": "exact quote or paraphrase of the risky claim",
      "domain": "what domain this is in (e.g. npm package version, API endpoint, model pricing)",
      "likely_changed_because": "why this probably changed",
      "verification_query": "specific web search query to verify current truth"
    }
  ],
  "cutoff_assumption_summary": "string — what the node ASSUMES to be true that may have changed"
}

Rules:
- ONLY flag claims that are time-sensitive (versions, prices, endpoints, rankings, availability)
- Do NOT flag fundamental concepts, algorithms, or stable architectural principles
- "critical" = something that would cause immediate incorrect behavior if wrong (wrong API endpoint, deprecated method)
- "high" = likely wrong for anyone running this system today (version numbers, feature availability)
- Output ONLY valid JSON.`;

/**
 * Determine if a node touches high-drift domains (fast heuristic pre-filter).
 */
function isHighDriftNode(node) {
  const text = `${node.title} ${node.body || ''} ${(node.tags || []).join(' ')}`.toLowerCase();
  return HIGH_DRIFT_DOMAINS.some(domain => text.includes(domain));
}

/**
 * Scan the vault for nodes containing LLM intrinsic assumptions that may have
 * drifted past the model's knowledge cutoff. Queues verification tasks for each.
 *
 * A node is a candidate if:
 *   1. It has no external source citation (source.type !== 'knowledge-acquisition' or 'web-search')
 *   2. It touches a high-drift domain (API, version, framework, pricing, etc.)
 *   3. It hasn't been verified in the last 30 days
 *
 * @param {object} opts
 * @param {string} opts.vaultDir
 * @param {string} opts.queueDir
 * @param {object} opts.runtimeConfig
 * @returns {{ audited: number, flagged: number, critical: number }}
 */
export async function runCutoffAudit({ vaultDir, queueDir, runtimeConfig }) {
  const allNodes = getNodes(vaultDir);
  const now = Date.now();
  const verifiedCutoff = 30 * 24 * 60 * 60 * 1000; // 30 days

  // Candidate selection: unsourced + high-drift domain + not recently verified
  const candidates = allNodes.filter(n => {
    if (n.status !== 'active') return false;
    const sourceType = n.source?.type || '';
    const isExternallySourced = ['knowledge-acquisition', 'web-search', 'web-fetch', 'brave-search', 'arxiv'].includes(sourceType);
    if (isExternallySourced) return false; // Already from a real source
    if (!isHighDriftNode(n)) return false;
    const lastVerified = new Date(n.x_cutoff_verified_at || n.updated || n.created || 0).getTime();
    return (now - lastVerified) > verifiedCutoff;
  });

  if (candidates.length === 0) {
    logger.info({ subsystem: 'cutoff-auditor', message: 'No cutoff-risk candidates found' });
    return { audited: 0, flagged: 0, critical: 0 };
  }

  // Process up to 8 candidates per run
  const batch = candidates.slice(0, 8);
  let flagged = 0;
  let critical = 0;

  if (!fs.existsSync(queueDir)) fs.mkdirSync(queueDir, { recursive: true });

  for (const node of batch) {
    const prompt = [
      `## Memory Node: ${node.slug}`,
      `Title: "${node.title}"`,
      `Source type: ${node.source?.type || 'intrinsic-llm-knowledge'}`,
      `Last updated: ${node.updated || node.created || 'unknown'}`,
      `Tags: ${(node.tags || []).join(', ')}`,
      '',
      '## Content',
      (node.body || '').slice(0, 1200),
      '',
      'Audit this node for claims that may have drifted past the LLM knowledge cutoff.',
    ].join('\n');

    let result;
    try {
      const raw = await callLocalRuntime(prompt, CUTOFF_AUDIT_SYSTEM, runtimeConfig);
      const match = raw.match(/\{[\s\S]*\}/);
      if (!match) continue;
      result = cleanAndParseJSON(match[0]);
    } catch (err) {
      logger.info({ subsystem: 'cutoff-auditor', message: `Audit failed for ${node.slug}: ${err.message}` });
      continue;
    }

    if (!result.has_cutoff_risk) {
      // Mark as verified so we don't re-audit for 30 days
      await stampVerified(node);
      continue;
    }

    flagged++;
    const isCritical = result.risk_level === 'critical';
    if (isCritical) critical++;

    const taskPriority = isCritical ? 95 : result.risk_level === 'high' ? 75 : 50;
    const intrinsicClaims = Array.isArray(result.intrinsic_claims) ? result.intrinsic_claims : [];

    logger.info({
      subsystem: 'cutoff-auditor',
      message: `CUTOFF RISK [${result.risk_level}] "${node.title}": ${intrinsicClaims.length} claims to verify`,
    });

    // Queue a verification task for each claim
    for (const claim of intrinsicClaims.slice(0, 3)) {
      const taskSlug = `cutoff-verify-${node.slug}`;

      const taskData = {
        type: 'task',
        slug: taskSlug,
        priority: taskPriority,
        category: 'proactive-research',
        target: node.slug,
        status: 'pending',
        created_by: 'cutoff-auditor',
        x_risk_level: result.risk_level,
        x_original_claim: claim.claim,
        reason: `Cutoff drift risk [${result.risk_level}]: "${claim.claim}" may have changed since training cutoff.`,
      };

      const taskBody = [
        `## Cutoff Assumption Verification`,
        `**Node**: ${node.slug} — "${node.title}"`,
        `**Risk Level**: ${result.risk_level}`,
        '',
        `## Claim to Verify`,
        `> ${claim.claim}`,
        '',
        `**Domain**: ${claim.domain}`,
        `**Why it likely changed**: ${claim.likely_changed_because}`,
        '',
        `## Verification Query`,
        claim.verification_query,
        '',
        `## Overall Assumption`,
        result.cutoff_assumption_summary || '',
      ].join('\n');

      atomicWrite(path.join(queueDir, `${taskSlug}.md`), safeStringify(taskBody, taskData));
    }

    // Stamp the node with an audit timestamp and risk level
    await stampCutoffRisk(node, result.risk_level, intrinsicClaims.length);
  }

  logger.info({
    subsystem: 'cutoff-auditor',
    message: `Cutoff audit: ${batch.length} audited, ${flagged} flagged, ${critical} critical`,
  });

  return { audited: batch.length, flagged, critical };
}

async function stampVerified(node) {
  if (!node._filepath) return;
  try {
    const raw = fs.readFileSync(node._filepath, 'utf8');
    const { data, content } = matter(raw);
    data.x_cutoff_verified_at = new Date().toISOString();
    data.x_cutoff_risk = 'none';
    atomicWrite(node._filepath, safeStringify(content, data));
    invalidate(path.dirname(node._filepath));
  } catch (err) {
    logger.debug('clarity-rewriter: stampCutoffRiskNone failed', { err: err.message });
  }
}

async function stampCutoffRisk(node, riskLevel, claimCount) {
  if (!node._filepath) return;
  try {
    const raw = fs.readFileSync(node._filepath, 'utf8');
    const { data, content } = matter(raw);
    data.x_cutoff_risk = riskLevel;
    data.x_cutoff_claim_count = claimCount;
    data.x_cutoff_flagged_at = new Date().toISOString();
    // Lower confidence to reflect that claims are unverified
    const confidencePenalty = riskLevel === 'critical' ? 0.3 : riskLevel === 'high' ? 0.2 : 0.1;
    data.confidence = Math.max(0.1, (data.confidence || 0.5) - confidencePenalty);
    atomicWrite(node._filepath, safeStringify(content, data));
    invalidate(path.dirname(node._filepath));
  } catch (err) {
    logger.debug('clarity-rewriter: stampCutoffRisk failed', { err: err.message });
  }
}

// ─── Correction Writer ───────────────────────────────────────────────────────────

const CORRECTION_SYSTEM = `You are a Knowledge Correction Writer for a sovereign AI memory system.

You will be given:
1. An ORIGINAL memory node (what the system previously believed)
2. RESEARCH EVIDENCE (what was found by real-world sources)

Your job is to write an honest, explicit correction record. The system must be able to say: "I previously stated X based on my training data, but after verification I found the actual truth is Y."

Output valid JSON:
{
  "correction_title": "string (concise, e.g. 'local_llm API endpoint changed in v0.2.0')",
  "was_wrong_about": "string (precise description of what was incorrect)",
  "actual_truth": "string (what is actually true, with citation)",
  "correction_body": "string (full markdown explanation including the correction narrative)",
  "confidence_in_correction": 0.0-1.0,
  "original_should_be": "superseded" | "archived" | "deleted",
  "applies_to_date": "string (ISO date — when this correction is accurate as of)"
}

The correction_body MUST include the phrase 'Previous belief:' and 'Verified truth:' as explicit sections.
Output ONLY valid JSON.`;

/**
 * Write an explicit correction record when research contradicts an existing node.
 *
 * Called by the conclusion writer or research engine when a validated fact
 * contradicts an existing active node.
 *
 * @param {string} originalSlug       Slug of the node being corrected
 * @param {object} researchEvidence   { title, body, sources[] } from fact-seeker
 * @param {object} opts
 * @param {string} opts.vaultDir
 * @param {string} opts.inboxDir
 * @param {object} opts.runtimeConfig
 * @returns {{ correctionSlug: string, verdict: string, error?: string }}
 */
export async function writeCorrection(originalSlug, researchEvidence, { vaultDir, inboxDir, runtimeConfig }) {
  const allNodes = getNodes(vaultDir);
  const original = allNodes.find(n => n.slug === originalSlug);

  if (!original) {
    return { correctionSlug: null, verdict: 'skip', error: 'Original node not found' };
  }

  const prompt = [
    `## Original Memory Node (What the system believed)`,
    `Slug: ${original.slug}`,
    `Title: "${original.title}"`,
    `Source: ${original.source?.type || 'intrinsic-llm-knowledge'}`,
    `Written: ${original.created || 'unknown'}`,
    '',
    '### Original Content',
    (original.body || '').slice(0, 1000),
    '',
    `## Research Evidence (What was actually found)`,
    `Title: "${researchEvidence.title}"`,
    '',
    '### Evidence Content',
    (researchEvidence.body || '').slice(0, 1500),
    '',
    '### Sources Cited',
    (researchEvidence.sources || []).map(s => `- [${s.source}] ${s.title}: ${s.url}`).join('\n'),
    '',
    'Write an explicit correction record for this node.',
  ].join('\n');

  let result;
  try {
    const raw = await callLocalRuntime(prompt, CORRECTION_SYSTEM, runtimeConfig);
    const match = raw.match(/\{[\s\S]*\}/);
    if (!match) throw new Error('No JSON in response');
    result = cleanAndParseJSON(match[0]);
  } catch (err) {
    logger.info({ subsystem: 'correction-writer', message: `Correction write failed for ${originalSlug}: ${err.message}` });
    return { correctionSlug: null, verdict: 'error', error: err.message };
  }

  // Write the correction as a new draft node
  const correctionSlug = `correction-${originalSlug}-${crypto.createHash('md5').update(correction.was_wrong_about || correction.content || originalSlug).digest('hex').slice(0, 8)}`;
  const now = new Date().toISOString();

  const correctionFrontmatter = {
    type: 'memory',
    slug: correctionSlug,
    category: 'corrections',
    title: result.correction_title || `Correction: ${original.title}`,
    status: 'draft',
    confidence: result.confidence_in_correction || 0.8,
    importance: Math.min(5, (original.importance || 3) + 1),
    created: now,
    updated: now,
    last_accessed: now,
    source: {
      type: 'correction',
      session_id: `correction-${Date.now().toString(36)}`,
      agent: 'correction-writer',
      evidence_count: (researchEvidence.sources || []).length,
      corrects_node: originalSlug,
    },
    supersedes: [originalSlug],
    superseded_by: null,
    contradicts: [originalSlug],
    tags: ['correction', 'verified', 'auto-corrected', ...(original.tags || [])],
    related: [originalSlug],
    routes_to_skills: original.routes_to_skills || [],
    sentiment_polarity: 'corrective',
    sentiment_target: 'accuracy',
    modality: 'must',
    subject: 'agent',
    predicate: 'correct',
    object: original.title,
    decay: { half_life_days: 365, access_count: 1 },
    schema_version: 2,
    x_memory_layer: original.x_memory_layer || 'conscious',
    x_corrects: originalSlug,
    x_was_wrong_about: result.was_wrong_about,
    x_applies_to_date: result.applies_to_date || now.slice(0, 10),
    x_original_should_be: result.original_should_be || 'superseded',
    x_temporal_context: now,
    x_citations: (researchEvidence.sources || []).map(s => ({
      url: s.url || '',
      source: s.source || 'web',
      title: s.title || 'Untitled Source',
      published: s.published || now,
      relevance: 1.0,
      accessed: now
    })),
  };

  const body = result.correction_body || [
    `## Previous Belief`,
    result.was_wrong_about || `The system previously believed: "${original.title}"`,
    '',
    `## Verified Truth`,
    result.actual_truth || 'See research evidence.',
    '',
    `## Sources`,
    (researchEvidence.sources || []).map(s => `- [${s.source}] ${s.title}: ${s.url}`).join('\n'),
  ].join('\n');

  if (!fs.existsSync(inboxDir)) fs.mkdirSync(inboxDir, { recursive: true });
  atomicWrite(path.join(inboxDir, `${correctionSlug}.md`), safeStringify(body, correctionFrontmatter));

  // Stamp the original node as pending-correction
  await stampNodeForCorrection(original, correctionSlug, result.original_should_be);

  logger.info({
    subsystem: 'correction-writer',
    message: `Correction written: "${result.correction_title}" (supersedes ${originalSlug})`,
  });

  return { correctionSlug, verdict: result.original_should_be || 'superseded' };
}

async function stampNodeForCorrection(node, correctionSlug, disposition) {
  if (!node._filepath) return;
  try {
    const raw = fs.readFileSync(node._filepath, 'utf8');
    const { data, content } = matter(raw);
    data.status = disposition === 'deleted' ? 'archived' : 'superseded';
    data.superseded_by = correctionSlug;
    data.x_correction_applied_at = new Date().toISOString();
    // Lower confidence significantly — this fact has been proven wrong
    data.confidence = Math.max(0.05, (data.confidence || 0.5) * 0.3);
    data.updated = new Date().toISOString();
    atomicWrite(node._filepath, safeStringify(content, data));
    invalidate(path.dirname(node._filepath));
  } catch (err) {
    logger.debug('clarity-rewriter: stampNodeForCorrection failed', { err: err.message });
  }
}
