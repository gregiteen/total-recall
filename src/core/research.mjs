import fs from 'fs';
import path from 'path';
import os from 'os';
import crypto from 'crypto';
import matter from 'gray-matter';
import { callLocalRuntime } from './runtime.mjs';
import { atomicWrite, safeStringify } from './vault.mjs';
import { logger } from './logger.mjs';
import {
  loadResearchConfig,
  braveSearch,
  serperSearch,
  webSearch,
  arxivSearch,
  npmSearch,
  githubSearch,
  wikipediaFetch,
  smartFetch,
  checkSourceAvailability,
} from './source-adapters.mjs';
import { addToAgenda, runKnowledgeAcquisitionCycle, getLocalizedDateTime } from './fact-seeker.mjs';

/**
 * Total Recall Deep Research Engine
 *
 * Replaces the old placeholder implementation with real multi-source fetching.
 *
 * Two modes:
 *   handleProactiveResearch() — frontier-model orchestrated deep research (structured task)
 *   handleQuickResearch()     — local-LLM + direct source fetch (fast, no frontier required)
 */

const AGENT_DIR = path.join(os.homedir(), '.agent');

// ─── Frontier-Orchestrated Deep Research ────────────────────────────────────────

/**
 * Multi-phase deep research using the frontier model for planning + synthesis,
 * and real source adapters for data gathering.
 *
 * @param {object} task - { target, body }
 * @param {object} context - { runtimeConfig }
 */
export async function handleProactiveResearch(task, context = {}) {
  const inboxDir = path.join(AGENT_DIR, 'memory-inbox', 'pending');
  if (!fs.existsSync(inboxDir)) fs.mkdirSync(inboxDir, { recursive: true });

  const researchConfig = loadResearchConfig();
  const availability = checkSourceAvailability(researchConfig);

  logger.info({
    subsystem: 'deep-research',
    message: `Starting deep research: "${task.target}" | sources: ${availability.available.join(', ')}`,
  });

  // Phase 1: Plan — use frontier if available, else use local LLM
  const queries = await planResearchQueries(task, context);
  logger.info({ subsystem: 'deep-research', message: `Phase 1 complete: ${queries.length} queries` });

  // Phase 2: Parallel fetch from all real sources
  const allResults = await Promise.all(
    queries.map(async (query, i) => {
      logger.info({ subsystem: 'deep-research', message: `  → Agent ${i + 1}: "${query}"` });
      return gatherForQuery(query, researchConfig, availability);
    }),
  );

  const flatResults = allResults.flat();
  logger.info({
    subsystem: 'deep-research',
    message: `Phase 2 complete: ${flatResults.length} total results from ${[...new Set(flatResults.map(r => r.source))].join(', ')}`,
  });

  if (flatResults.length === 0) {
    logger.info({ subsystem: 'deep-research', message: 'No results gathered — research aborted' });
    return null;
  }

  // Phase 3: Write draft nodes for each result batch
  const draftPaths = [];
  for (const [i, results] of allResults.entries()) {
    if (results.length === 0) continue;
    const draftPath = writeDraftBatch(queries[i], results, inboxDir, task.target);
    draftPaths.push(draftPath);
  }

  // Phase 4: Synthesize using local runtime (which consists of high-powered CLI agents)
  logger.info({ subsystem: 'deep-research', message: 'Phase 4: Synthesizing research results...' });
  const finalReport = await synthesizeLocally(task, flatResults, context.runtimeConfig);

  // Phase 5: Also add topic to the Research Agenda for ongoing tracking
  addToAgenda({
    topic: task.target,
    priority: 75,
    source: 'deep-research-task',
    rationale: task.body || '',
    tags: ['deep-research'],
  });

  return finalReport;
}

// ─── Planning ───────────────────────────────────────────────────────────────────

async function planResearchQueries(task, context) {
  const today = getLocalizedDateTime();
  const cutoff = context.runtimeConfig?.training_cutoff || 'January 2025';

  const planSystem = `You are a Research Planner. Today's date and time is ${today}. The model's training data cutoff is ${cutoff}.
Decompose the research objective into 3 distinct, specific search queries. Prioritize queries targeting fresh, timely information that has arisen or been updated since the training cutoff.
Output ONLY valid JSON: { "queries": ["query 1", "query 2", "query 3"], "source_hints": { "query 1": ["brave-search", "arxiv"] } }`;

  const planPrompt = `Research Objective: ${task.target}\nDetails: ${task.body || ''}\nGenerate 3 targeted search queries targeting active, timely information post-${cutoff}.`;

  try {
    const raw = await callLocalRuntime(planPrompt, planSystem, context.runtimeConfig);
    const match = raw.match(/\{[\s\S]*\}/);
    if (match) {
      const plan = JSON.parse(match[0]);
      if (Array.isArray(plan.queries) && plan.queries.length > 0) return plan.queries;
    }
  } catch (err) {
    logger.debug('research: callLocalRuntime failed during plan generation', { err: err.message });
  }

  // Final fallback: use the target itself as the query
  return [task.target, `${task.target} tutorial`, `${task.target} best practices`];
}

// ─── Real Source Gathering ───────────────────────────────────────────────────────

async function gatherForQuery(query, researchConfig, availability) {
  const results = [];
  const fetches = [];

  // Always try: Wikipedia + DuckDuckGo
  fetches.push(
    wikipediaFetch(query, researchConfig).then(r => r && results.push(r)).catch(() => {}),
  );

  // 1. Web search — Brave with Serper fallback
  if (availability.available.includes('brave-search') || availability.available.includes('serper')) {
    fetches.push(
      webSearch(query, researchConfig, 4).then(r => results.push(...r)).catch(err => {
        logger.info({ subsystem: 'deep-research', message: `Web search failed for "${query}": ${err.message}` });
      }),
    );
  }

  // arXiv for academic topics
  if (/\b(model|llm|neural|ml|ai|research|paper|algorithm|training)\b/i.test(query)) {
    fetches.push(
      arxivSearch(query, researchConfig, 2).then(r => results.push(...r)).catch(() => {}),
    );
  }

  // npm for JS/package topics
  if (/\b(npm|node|javascript|typescript|package|library|framework)\b/i.test(query)) {
    fetches.push(
      npmSearch(query, researchConfig, 3).then(r => results.push(...r)).catch(() => {}),
    );
  }

  // GitHub for code/tool topics
  if (/\b(github|repo|open.source|tool|cli|sdk|api|integration)\b/i.test(query)) {
    fetches.push(
      githubSearch(query, researchConfig, 'repositories', 3)
        .then(r => results.push(...r))
        .catch(() => {}),
    );
  }

  await Promise.all(fetches);

  // Deep-crawl top web result using smartFetch (Playwright if installed, plain fetch otherwise)
  const topWebResult = results.find(r => ['brave-search', 'serper'].includes(r.source) && r.url);
  if (topWebResult) {
    try {
      const crawled = await smartFetch(topWebResult.url, researchConfig);
      topWebResult.fullText = crawled.fullText?.slice(0, 3000);
      if (crawled.source === 'playwright') {
        topWebResult.source = 'playwright'; // Upgrade source label
        topWebResult.type = 'webpage-rendered';
      }
    } catch (err) {
      logger.debug('research: smartFetch failed during topWebResult crawl', { err: err.message });
    }
  }

  return results;
}

// ─── Draft Node Writing ──────────────────────────────────────────────────────────

function writeDraftBatch(query, results, inboxDir, parentTopic) {
  const slug = `research-${Date.now().toString(36)}-${crypto.randomBytes(3).toString('hex')}`;
  const now = new Date().toISOString();

  let latestPublished = null;
  const citations = results.map(r => {
    const published = r.published || now;
    if (r.published) {
      if (!latestPublished || new Date(r.published) > new Date(latestPublished)) {
        latestPublished = r.published;
      }
    }
    return {
      source: r.source || 'web',
      title: r.title || 'Untitled Source',
      url: r.url || '',
      published,
      relevance: 1.0,
      accessed: now
    };
  });
  const temporalContext = latestPublished || now;

  const formatFriendly = (isoString) => {
    try {
      const d = new Date(isoString);
      if (isNaN(d.getTime())) return isoString;
      return d.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
    } catch {
      return isoString;
    }
  };

  const temporalFriendly = formatFriendly(temporalContext);
  const temporalCallout = `> [!NOTE]\n> **Temporal Context**: Information published/current as of ${temporalFriendly}.`;

  const bodyLines = [
    temporalCallout,
    '',
    `Research query: "${query}"`,
    '',
    '## Sources',
    ...results.map(r => `- [${r.source}] **${r.title}** — ${r.url}${r.published ? ` (${r.published})` : ''}\n  ${r.snippet?.slice(0, 200) || ''}`),
  ];

  const frontmatter = {
    type: 'memory',
    slug,
    category: 'facts',
    title: `Research: ${query}`,
    status: 'draft',
    confidence: Math.min(0.8, 0.4 + results.length * 0.1),
    importance: 4,
    created: now,
    updated: now,
    last_accessed: now,
    source: {
      type: 'knowledge-acquisition',
      session_id: `deep-research-${Date.now().toString(36)}`,
      agent: 'deep-research-engine',
      evidence_count: results.length,
      parent_topic: parentTopic,
    },
    supersedes: [],
    superseded_by: null,
    contradicts: [],
    tags: ['research', 'deep-research', 'auto-fetched', 'cited'],
    related: [],
    routes_to_skills: [],
    sentiment_polarity: 'descriptive',
    sentiment_target: 'external-knowledge',
    modality: 'should',
    subject: 'agent',
    predicate: 'know',
    object: query,
    decay: { half_life_days: 45, access_count: 1 },
    schema_version: 2,
    x_memory_layer: 'research',
    x_query: query,
    x_temporal_context: temporalContext,
    x_citations: citations,
    x_sources: results.map(r => ({ source: r.source, url: r.url, published: r.published })),
  };

  const draftPath = path.join(inboxDir, `${slug}.md`);
  atomicWrite(draftPath, safeStringify(bodyLines.join('\n'), frontmatter));
  return draftPath;
}

// ─── Synthesis ───────────────────────────────────────────────────────────────────

async function synthesizeLocally(task, results, runtimeConfig) {
  const today = getLocalizedDateTime();
  const cutoff = runtimeConfig?.training_cutoff || 'January 2025';

  const sourceSummary = results
    .map(r => `[${r.source}] ${r.title}: ${r.snippet?.slice(0, 300)}`)
    .join('\n');

  const system = `You are a Deep Research Synthesizer. Today's date and time is ${today}. The model's training data cutoff is ${cutoff}.
Synthesize research results into a concise report. Cite sources inline [Source: URL]. Prioritize fresh, timely information published after the cutoff.`;
  const prompt = `Topic: "${task.target}"\n\nResults:\n${sourceSummary.slice(0, 6000)}`;

  try {
    return callLocalRuntime(prompt, system, runtimeConfig);
  } catch (err) {
    logger.error('research: callLocalRuntime failed during synthesis', { err: err.message });
    return null;
  }
}

/**
 * Quick research: add a topic to the agenda and immediately run one acquisition cycle.
 * Used for direct research instructions from users.
 *
 * @param {string} topic
 * @param {object} opts
 */
export async function handleQuickResearch(topic, { vaultDir, inboxDir, queueDir, runtimeConfig }) {
  addToAgenda({ topic, priority: 90, source: 'user-instruction', directInstruction: true });
  return runKnowledgeAcquisitionCycle({ vaultDir, inboxDir, queueDir, runtimeConfig, forceTopic: topic });
}
