import fs from 'fs';
import path from 'path';
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
import { brainDir } from './config.mjs';

/**
 * Total Recall Deep Research Engine
 *
 * Replaces the old placeholder implementation with real multi-source fetching.
 *
 * Two modes:
 *   handleProactiveResearch() — frontier-model orchestrated deep research (structured task)
 *   handleQuickResearch()     — local-LLM + direct source fetch (fast, no frontier required)
 */

const BRAIN_DIR = brainDir;

// ─── Frontier-Orchestrated Deep Research ────────────────────────────────────────

/**
 * Multi-phase deep research using the frontier model for planning + synthesis,
 * and real source adapters for data gathering.
 *
 * @param {object} task - { target, body }
 * @param {object} context - { runtimeConfig }
 */
export async function handleProactiveResearch(task, context = {}) {
  const inboxDir = path.join(BRAIN_DIR, 'memory-inbox', 'pending');
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

  // Phase 3: Write and integrate findings into a single consolidated main draft node
  for (const [i, results] of allResults.entries()) {
    if (results.length === 0) continue;
    writeOrUpdateConsolidatedDraft(task.target, queries[i], results, inboxDir);
  }

  // Phase 4: Synthesize using local runtime (which consists of high-powered CLI agents)
  logger.info({ subsystem: 'deep-research', message: 'Phase 4: Synthesizing research results...' });
  const finalReport = await synthesizeLocally(task, flatResults, context.runtimeConfig);

  // Save the beautiful synthesized executive summary at the top of our main consolidated document
  if (finalReport) {
    saveSynthesizedReportToDraft(task.target, finalReport, inboxDir);
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
  const today = getLocalizedDateTime();
  const cutoff = context.runtimeConfig?.training_cutoff || 'January 2025';

  const planSystem = `<system_instructions>
You are a Research Planner.
- Decompose the research objective into 3 distinct, specific search queries.
- Prioritize queries targeting fresh, timely information that has arisen or been updated since the training cutoff.
- ALWAYS think inside a <scratchpad> block first to outline your queries.
- Your final output MUST be ONLY valid JSON matching this schema: { "queries": ["query 1", "query 2", "query 3"], "source_hints": { "query 1": ["brave-search", "arxiv"] } }
</system_instructions>

<context>
Today's date and time is ${today}.
The model's training data cutoff is ${cutoff}.
</context>`;

  const planPrompt = `<user_goal>
Research Objective: ${task.target}
Details: ${task.body || 'None'}
</user_goal>

Generate 3 targeted search queries targeting active, timely information post-${cutoff}.`;

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

/**
 * Decide source mix from the *meaning* of the query (not only crude keyword lists).
 * Combines semantic hints with optional suggested_sources from the planner.
 */
function planSourcesForQuery(query, availability, suggested = []) {
  const q = String(query || '').toLowerCase();
  const suggestedSet = new Set((suggested || []).map((s) => String(s).toLowerCase()));
  const avail = new Set(availability?.available || []);

  const want = {
    web: true, // always try web when possible
    wikipedia: true,
    arxiv: false,
    npm: false,
    github: false,
  };

  if (
    suggestedSet.has('arxiv') ||
    /\b(paper|arxiv|neural|transformer|llm|benchmark|dataset|training|model card)\b/.test(q)
  ) {
    want.arxiv = true;
  }
  if (
    suggestedSet.has('npm') ||
    /\b(npm|package\.json|node\.js|typescript package|js library)\b/.test(q)
  ) {
    want.npm = true;
  }
  if (
    suggestedSet.has('github') ||
    /\b(github|open.?source|repository|pull request|commit)\b/.test(q)
  ) {
    want.github = true;
  }
  // API / integration research: bias web + github docs, not arxiv
  if (/\b(api|endpoint|oauth|sdk|webhook|authentication|base url)\b/.test(q)) {
    want.github = true;
    want.web = true;
    want.arxiv = false;
  }

  return {
    web: want.web && (avail.has('brave-search') || avail.has('serper') || avail.has('tavily') || avail.has('exa') || avail.has('duckduckgo')),
    wikipedia: want.wikipedia && avail.has('wikipedia'),
    arxiv: want.arxiv && avail.has('arxiv'),
    npm: want.npm && avail.has('npm'),
    github: want.github && avail.has('github'),
  };
}

async function gatherForQuery(query, researchConfig, availability) {
  const results = [];
  const fetches = [];
  const sources = planSourcesForQuery(query, availability);

  if (sources.wikipedia) {
    fetches.push(
      wikipediaFetch(query, researchConfig).then((r) => r && results.push(r)).catch(() => {}),
    );
  }

  // Paid chain (Brave→Tavily→Exa→Serper) or DuckDuckGo — always prefer web for product/API research
  if (sources.web) {
    fetches.push(
      webSearch(query, researchConfig, 4)
        .then((r) => results.push(...r))
        .catch((err) => {
          logger.info({
            subsystem: 'deep-research',
            message: `Web search failed for "${query}": ${err.message}`,
          });
        }),
    );
  }

  if (sources.arxiv) {
    fetches.push(
      arxivSearch(query, researchConfig, 2).then((r) => results.push(...r)).catch(() => {}),
    );
  }

  if (sources.npm) {
    fetches.push(
      npmSearch(query, researchConfig, 3).then((r) => results.push(...r)).catch(() => {}),
    );
  }

  if (sources.github) {
    fetches.push(
      githubSearch(query, researchConfig, 'repositories', 3)
        .then((r) => results.push(...r))
        .catch(() => {}),
    );
  }

  await Promise.all(fetches);

  // Deep-crawl top web result using smartFetch (Playwright if installed, plain fetch otherwise)
  const topWebResult = results.find((r) =>
    ['brave-search', 'serper', 'tavily', 'exa'].includes(r.source) && r.url,
  );
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

function slugify(text) {
  return text
    .toString()
    .toLowerCase()
    .trim()
    .replace(/\s+/g, '-')
    .replace(/[^\w\-]+/g, '')
    .replace(/\-\-+/g, '-');
}

export function writeOrUpdateConsolidatedDraft(parentTopic, query, results, inboxDir) {
  const slug = `research-report-${slugify(parentTopic)}`;
  const filePath = path.join(inboxDir, `${slug}.md`);
  const now = new Date().toISOString();

  let existingFrontmatter = null;
  let existingBody = '';

  if (fs.existsSync(filePath)) {
    try {
      const raw = fs.readFileSync(filePath, 'utf8');
      const { data, content } = matter(raw);
      existingFrontmatter = data;
      existingBody = content.trim();
    } catch {}
  }

  const newCitations = results.map(r => ({
    source: r.source || 'web',
    title: r.title || 'Untitled Source',
    url: r.url || '',
    published: r.published || now,
    relevance: 1.0,
    accessed: now
  }));

  const formatFriendly = (isoString) => {
    try {
      const d = new Date(isoString);
      if (isNaN(d.getTime())) return isoString;
      return d.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
    } catch {
      return isoString;
    }
  };

  const citations = existingFrontmatter?.x_citations 
    ? [...existingFrontmatter.x_citations, ...newCitations] 
    : newCitations;

  const uniqueCitationsMap = new Map();
  for (const c of citations) {
    uniqueCitationsMap.set(c.url || c.title, c);
  }
  const mergedCitations = Array.from(uniqueCitationsMap.values());

  const sourcesList = results.map(r => ({ source: r.source, url: r.url, published: r.published }));
  const mergedSources = existingFrontmatter?.x_sources
    ? [...existingFrontmatter.x_sources, ...sourcesList]
    : sourcesList;

  const uniqueSourcesMap = new Map();
  for (const s of mergedSources) {
    uniqueSourcesMap.set(s.url || s.source, s);
  }
  const mergedSourcesUnique = Array.from(uniqueSourcesMap.values());

  const bodyLines = [];
  if (existingBody) {
    bodyLines.push(existingBody);
    bodyLines.push('');
    bodyLines.push('---');
    bodyLines.push(`### Research Query: "${query}"`);
    bodyLines.push('');
    bodyLines.push('#### Integrated Sources');
    results.forEach(r => {
      bodyLines.push(`- [${r.source}] **${r.title}** — ${r.url}${r.published ? ` (${r.published})` : ''}`);
      if (r.snippet) bodyLines.push(`  ${r.snippet.slice(0, 200)}`);
    });
  } else {
    const temporalFriendly = formatFriendly(now);
    bodyLines.push(`> [!NOTE]`);
    bodyLines.push(`> **Temporal Context**: Consolidated research current as of ${temporalFriendly}.`);
    bodyLines.push('');
    bodyLines.push(`# Consolidated Research: ${parentTopic}`);
    bodyLines.push('');
    bodyLines.push(`### Research Query: "${query}"`);
    bodyLines.push('');
    bodyLines.push('#### Integrated Sources');
    results.forEach(r => {
      bodyLines.push(`- [${r.source}] **${r.title}** — ${r.url}${r.published ? ` (${r.published})` : ''}`);
      if (r.snippet) bodyLines.push(`  ${r.snippet.slice(0, 200)}`);
    });
  }

  const frontmatter = {
    type: 'memory',
    slug,
    category: 'facts',
    title: `Consolidated Research: ${parentTopic}`,
    status: 'draft',
    confidence: 0.8,
    importance: 4,
    created: existingFrontmatter?.created || now,
    updated: now,
    last_accessed: now,
    source: {
      type: 'knowledge-acquisition',
      session_id: existingFrontmatter?.source?.session_id || `deep-research-${Date.now().toString(36)}`,
      agent: 'deep-research-engine',
      evidence_count: mergedCitations.length,
      parent_topic: parentTopic,
    },
    supersedes: existingFrontmatter?.supersedes || [],
    superseded_by: null,
    contradicts: existingFrontmatter?.contradicts || [],
    tags: ['research', 'deep-research', 'consolidated-report', 'cited'],
    related: existingFrontmatter?.related || [],
    routes_to_skills: [],
    sentiment_polarity: 'descriptive',
    sentiment_target: 'external-knowledge',
    modality: 'should',
    subject: 'agent',
    predicate: 'know',
    object: parentTopic,
    decay: { half_life_days: 60, access_count: 1 },
    schema_version: 2,
    x_memory_layer: 'research',
    x_temporal_context: now,
    x_citations: mergedCitations,
    x_sources: mergedSourcesUnique,
  };

  atomicWrite(filePath, safeStringify(bodyLines.join('\n'), frontmatter));
  return filePath;
}

export function saveSynthesizedReportToDraft(parentTopic, finalReport, inboxDir) {
  const slug = `research-report-${slugify(parentTopic)}`;
  const filePath = path.join(inboxDir, `${slug}.md`);
  const now = new Date().toISOString();

  let existingFrontmatter = null;
  let existingBody = '';

  if (fs.existsSync(filePath)) {
    try {
      const raw = fs.readFileSync(filePath, 'utf8');
      const { data, content } = matter(raw);
      existingFrontmatter = data;
      existingBody = content.trim();
    } catch {}
  }

  let sourcesSection = '';
  if (existingBody) {
    const idx = existingBody.indexOf('### Research Query:');
    if (idx !== -1) {
      sourcesSection = existingBody.slice(idx);
    } else {
      sourcesSection = existingBody;
    }
  }

  const formatFriendly = (isoString) => {
    try {
      const d = new Date(isoString);
      if (isNaN(d.getTime())) return isoString;
      return d.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
    } catch {
      return isoString;
    }
  };

  const temporalFriendly = formatFriendly(now);
  const temporalCallout = `> [!NOTE]\n> **Temporal Context**: Integrated research current as of ${temporalFriendly}.`;

  const bodyLines = [
    temporalCallout,
    '',
    `# Consolidated Research Report: ${parentTopic}`,
    '',
    finalReport,
    '',
    '## Appendix: Gathered Search Batches & Sources',
    '',
    sourcesSection
  ];

  const frontmatter = {
    type: 'memory',
    slug,
    category: 'facts',
    title: `Consolidated Research Report: ${parentTopic}`,
    status: 'draft',
    confidence: 0.9,
    importance: 4,
    created: existingFrontmatter?.created || now,
    updated: now,
    last_accessed: now,
    source: {
      type: 'knowledge-acquisition',
      session_id: existingFrontmatter?.source?.session_id || `deep-research-${Date.now().toString(36)}`,
      agent: 'deep-research-engine',
      evidence_count: existingFrontmatter?.source?.evidence_count || 0,
      parent_topic: parentTopic,
    },
    supersedes: existingFrontmatter?.supersedes || [],
    superseded_by: null,
    contradicts: existingFrontmatter?.contradicts || [],
    tags: ['research', 'deep-research', 'consolidated-report', 'cited', 'master-artifact'],
    related: existingFrontmatter?.related || [],
    routes_to_skills: [],
    sentiment_polarity: 'descriptive',
    sentiment_target: 'external-knowledge',
    modality: 'should',
    subject: 'agent',
    predicate: 'know',
    object: parentTopic,
    decay: { half_life_days: 60, access_count: 1 },
    schema_version: 2,
    x_memory_layer: 'research',
    x_temporal_context: now,
    x_citations: existingFrontmatter?.x_citations || [],
    x_sources: existingFrontmatter?.x_sources || [],
  };

  atomicWrite(filePath, safeStringify(bodyLines.join('\n'), frontmatter));
  return filePath;
}

// ─── Synthesis ───────────────────────────────────────────────────────────────────

async function synthesizeLocally(task, results, runtimeConfig) {
  const today = getLocalizedDateTime();
  const cutoff = runtimeConfig?.training_cutoff || 'January 2025';

  const sourceSummary = results
    .map(r => `[${r.source}] ${r.title}: ${r.snippet?.slice(0, 300)}`)
    .join('\n');

  const system = `<system_instructions>
You are a Deep Research Synthesizer.
- Synthesize research results into a concise report.
- Cite sources inline [Source: URL].
- Prioritize fresh, timely information published after the cutoff.
- ALWAYS use a <scratchpad> block first to outline your synthesis and evaluate source reliability before writing the final report.
</system_instructions>

<context>
Today's date and time is ${today}.
The model's training data cutoff is ${cutoff}.
</context>`;

  const prompt = `<user_goal>
Topic: "${task.target}"
</user_goal>

<retrieved_docs>
${sourceSummary.slice(0, 6000)}
</retrieved_docs>

Please synthesize the research results.`;

  try {
    let report = await callLocalRuntime(prompt, system, runtimeConfig);
    // Remove the scratchpad from the final stored report
    if (report) {
      report = report.replace(/<scratchpad>[\s\S]*?<\/scratchpad>/gi, '').trim();
    }
    return report;
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
