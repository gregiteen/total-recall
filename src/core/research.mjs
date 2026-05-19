import fs from 'fs';
import path from 'path';
import os from 'os';
import crypto from 'crypto';
import matter from 'gray-matter';
import { callFrontier, loadFrontierConfig } from './frontier.mjs';
import { atomicWrite } from './vault.mjs';
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
import { addToAgenda, runKnowledgeAcquisitionCycle } from './fact-seeker.mjs';

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

  // Phase 4: Synthesize with frontier model if available
  let finalReport = null;
  try {
    const configPath = path.join(AGENT_DIR, 'config', 'frontier.yml');
    const frontierConfig = loadFrontierConfig(configPath);
    finalReport = await synthesizeWithFrontier(task, draftPaths, frontierConfig);
    logger.info({ subsystem: 'deep-research', message: 'Phase 4 complete: frontier synthesis done' });
  } catch (err) {
    logger.info({ subsystem: 'deep-research', message: `Frontier synthesis skipped: ${err.message} — using local synthesis` });
    finalReport = await synthesizeLocally(task, flatResults, context.runtimeConfig);
  }

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
  const planSystem = `You are a Research Planner. Decompose the research objective into 3 distinct, specific search queries.
Output ONLY valid JSON: { "queries": ["query 1", "query 2", "query 3"], "source_hints": { "query 1": ["brave-search", "arxiv"] } }`;

  const planPrompt = `Research Objective: ${task.target}\nDetails: ${task.body || ''}\nGenerate 3 targeted search queries.`;

  try {
    // Try frontier first
    const configPath = path.join(AGENT_DIR, 'config', 'frontier.yml');
    const frontierConfig = loadFrontierConfig(configPath);
    const raw = await callFrontier(planPrompt, planSystem, frontierConfig);
    const match = raw.match(/\{[\s\S]*\}/);
    if (match) {
      const plan = JSON.parse(match[0]);
      if (Array.isArray(plan.queries) && plan.queries.length > 0) return plan.queries;
    }
  } catch {
    // Fall through to local LLM
  }

  if (context.runtimeConfig) {
    try {
      const { callLocalRuntime } = await import('./runtime.mjs');
      const raw = await callLocalRuntime(planPrompt, planSystem, context.runtimeConfig);
      const match = raw.match(/\{[\s\S]*\}/);
      if (match) {
        const plan = JSON.parse(match[0]);
        if (Array.isArray(plan.queries) && plan.queries.length > 0) return plan.queries;
      }
    } catch { /* fall through */ }
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
    } catch { /* non-fatal */ }
  }

  return results;
}

// ─── Draft Node Writing ──────────────────────────────────────────────────────────

function writeDraftBatch(query, results, inboxDir, parentTopic) {
  const slug = `research-${Date.now().toString(36)}-${crypto.randomBytes(3).toString('hex')}`;
  const now = new Date().toISOString();

  const bodyLines = [
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
    x_sources: results.map(r => ({ source: r.source, url: r.url, published: r.published })),
  };

  const draftPath = path.join(inboxDir, `${slug}.md`);
  atomicWrite(draftPath, matter.stringify(bodyLines.join('\n'), frontmatter));
  return draftPath;
}

// ─── Synthesis ───────────────────────────────────────────────────────────────────

async function synthesizeWithFrontier(task, draftPaths, frontierConfig) {
  const draftedFacts = draftPaths.map(draftPath => {
    const raw = fs.readFileSync(draftPath, 'utf8');
    const { data, content } = matter(raw);
    return `[Fact: ${data.slug}]\nSources: ${(data.x_sources || []).map(s => s.url).join(', ')}\n${content}`;
  }).join('\n\n');

  const synthSystem = `You are a Deep Research Synthesizer. Synthesize the gathered facts into a comprehensive, cited Markdown report. Every claim MUST have an inline citation [Source: URL]. Identify knowledge gaps and contradictions explicitly.`;
  const synthPrompt = `Research Objective: ${task.target}\n\nGathered Facts:\n${draftedFacts.slice(0, 12000)}\n\nProduce a final synthesized report.`;

  return callFrontier(synthPrompt, synthSystem, frontierConfig);
}

async function synthesizeLocally(task, results, runtimeConfig) {
  if (!runtimeConfig) return null;
  const { callLocalRuntime } = await import('./runtime.mjs');

  const sourceSummary = results
    .map(r => `[${r.source}] ${r.title}: ${r.snippet?.slice(0, 300)}`)
    .join('\n');

  const system = `Synthesize research results into a concise report. Cite sources inline [Source: URL].`;
  const prompt = `Topic: "${task.target}"\n\nResults:\n${sourceSummary.slice(0, 6000)}`;

  try {
    return callLocalRuntime(prompt, system, runtimeConfig);
  } catch {
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
