import fs from 'fs';
import path from 'path';
import matter from 'gray-matter';
import crypto from 'crypto';
import os from 'os';
import { callLocalRuntime } from './runtime.mjs';
import { loadNodes, writeNode, atomicWrite } from './vault.mjs';
import { logger } from './logger.mjs';
import {
  loadResearchConfig,
  checkSourceAvailability,
  webSearch,
  arxivSearch,
  npmSearch,
  githubSearch,
  wikipediaFetch,
  duckduckgoInstant,
  smartFetch,
} from './source-adapters.mjs';

/**
 * Total Recall Knowledge Acquisition Engine
 *
 * A proactive, multi-source intelligence builder that:
 *   1. Infers research topics from conversation sessions
 *   2. Maintains a persistent, prioritized Research Agenda
 *   3. Fetches real data from web search, arXiv, npm, GitHub, Wikipedia
 *   4. Cites every source with URL, date, and relevance score
 *   5. Cross-verifies facts across multiple sources
 *   6. Diagnoses its own knowledge coverage and limitations
 *   7. Accepts direct research instructions from users
 */

const AGENT_DIR = path.join(os.homedir(), '.agent');
const AGENDA_FILE = path.join(AGENT_DIR, 'research-agenda.jsonl');
const SOURCES_REGISTRY = path.join(AGENT_DIR, 'memory-derived', 'source-registry.jsonl');

// ─── Research Agenda ────────────────────────────────────────────────────────────

/**
 * Load the persistent research agenda from disk.
 * @returns {ResearchTopic[]}
 */
export function loadAgenda() {
  if (!fs.existsSync(AGENDA_FILE)) return [];
  return fs.readFileSync(AGENDA_FILE, 'utf8')
    .split('\n').filter(Boolean)
    .map(line => { try { return JSON.parse(line); } catch { return null; } })
    .filter(Boolean);
}

/**
 * Save the full agenda back to disk.
 */
function saveAgenda(topics) {
  const dir = path.dirname(AGENDA_FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  atomicWrite(AGENDA_FILE, topics.map(t => JSON.stringify(t)).join('\n') + '\n');
}

/**
 * Add or update a topic on the research agenda.
 * If the topic already exists, bumps its priority.
 */
export function addToAgenda({ topic, priority = 50, source, rationale = '', tags = [], directInstruction = false }) {
  const agenda = loadAgenda();
  const existing = agenda.find(t => t.topic.toLowerCase() === topic.toLowerCase());

  if (existing) {
    existing.priority = Math.min(100, existing.priority + 10);
    existing.mention_count = (existing.mention_count || 1) + 1;
    existing.last_mentioned = new Date().toISOString();
    if (directInstruction) existing.direct_instruction = true;
  } else {
    agenda.push({
      id: crypto.randomBytes(4).toString('hex'),
      topic,
      priority,
      source,
      rationale,
      tags,
      status: 'pending',
      coverage_score: 0,
      mention_count: 1,
      direct_instruction: directInstruction,
      created: new Date().toISOString(),
      last_mentioned: new Date().toISOString(),
      last_researched: null,
      sources_consulted: [],
    });
  }

  agenda.sort((a, b) => b.priority - a.priority);
  saveAgenda(agenda);
  return existing || agenda.find(t => t.topic.toLowerCase() === topic.toLowerCase());
}

/**
 * Mark a topic as researched and update its coverage score.
 */
export function markTopicResearched(topicId, { coverageScore, sourcesConsulted }) {
  const agenda = loadAgenda();
  const topic = agenda.find(t => t.id === topicId);
  if (topic) {
    topic.last_researched = new Date().toISOString();
    topic.coverage_score = coverageScore;
    topic.sources_consulted = [...new Set([...(topic.sources_consulted || []), ...sourcesConsulted])];
    topic.status = coverageScore >= 0.7 ? 'well-covered' : 'partially-covered';
    saveAgenda(agenda);
  }
}

/**
 * Get the next highest-priority pending topic from the agenda.
 */
export function getNextAgendaTopic() {
  const agenda = loadAgenda();
  // Prioritize: direct instructions first, then by priority score, then by staleness
  const pending = agenda
    .filter(t => t.status === 'pending' || t.status === 'partially-covered')
    .sort((a, b) => {
      if (a.direct_instruction && !b.direct_instruction) return -1;
      if (!a.direct_instruction && b.direct_instruction) return 1;
      return b.priority - a.priority;
    });
  return pending[0] || null;
}

// ─── Source Registry ─────────────────────────────────────────────────────────────

/**
 * Register a source that was consulted and store citation metadata.
 */
function registerSource(sourceResult, factSlug) {
  const dir = path.dirname(SOURCES_REGISTRY);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  const record = JSON.stringify({
    fact_slug: factSlug,
    source: sourceResult.source,
    type: sourceResult.type,
    title: sourceResult.title,
    url: sourceResult.url,
    snippet: (sourceResult.snippet || '').slice(0, 300),
    published: sourceResult.published,
    relevance: sourceResult.relevance,
    accessed_at: new Date().toISOString(),
  }) + '\n';

  fs.appendFileSync(SOURCES_REGISTRY, record);
}

// ─── Topic Inference ─────────────────────────────────────────────────────────────

const TOPIC_INFERENCE_SYSTEM = `You are a Research Agenda Analyst. Given a conversation transcript, identify topics the user is actively working on or curious about that would benefit from deeper external research.

Output valid JSON:
{
  "topics": [
    {
      "topic": "string (specific, searchable — e.g. 'Ollama REST API endpoints 2024' not just 'AI')",
      "priority": 1-100,
      "rationale": "why this needs research",
      "tags": ["tag1", "tag2"],
      "suggested_sources": ["brave-search", "arxiv", "npm", "github", "wikipedia"]
    }
  ]
}

Rules:
- Maximum 5 topics per session.
- Topics must be SPECIFIC and SEARCHABLE — not vague categories.
- Include version numbers, tool names, library names when relevant.
- Prioritize topics where the agent seemed uncertain or where facts were cited without verification.
- Output ONLY valid JSON.`;

/**
 * Infer research topics from a session transcript via the local LLM.
 */
export async function inferTopicsFromSession(transcript, runtimeConfig) {
  if (!transcript || transcript.length < 100) return [];

  const prompt = `Analyze this conversation and identify the most important research topics:\n\n${transcript.slice(0, 8000)}`;

  try {
    const raw = await callLocalRuntime(prompt, TOPIC_INFERENCE_SYSTEM, runtimeConfig);
    const match = raw.match(/\{[\s\S]*\}/);
    if (!match) return [];
    const result = JSON.parse(match[0]);
    return Array.isArray(result.topics) ? result.topics : [];
  } catch (err) {
    logger.info({ subsystem: 'fact-seeker', message: `Topic inference failed: ${err.message}` });
    return [];
  }
}

// ─── Multi-Source Research Execution ────────────────────────────────────────────

const SYNTHESIS_SYSTEM = `You are a Knowledge Synthesis Analyst. Given raw search results from multiple sources, extract verified facts and synthesize them into a coherent knowledge node.

Output valid JSON:
{
  "title": "string (precise, descriptive)",
  "summary": "string (3-5 paragraphs synthesizing all sources)",
  "key_facts": ["string (specific, verifiable fact with inline citation [Source: URL])"],
  "confidence": 0.0-1.0,
  "temporal_context": "string (when this information is current as of)",
  "contradictions": ["string (any sources that disagreed)"],
  "further_research_needed": ["string (gaps that remain)"],
  "recommended_apis": ["string (specific APIs/endpoints worth integrating for this topic)"]
}

Rules:
- Every key fact MUST have an inline citation [Source: URL]
- Confidence reflects cross-source agreement (single source = max 0.6, 3+ agreeing sources = up to 0.95)
- Be temporally specific — note dates and versions
- Output ONLY valid JSON`;

/**
 * Execute research on a single topic across multiple sources.
 * Returns raw results from all sources — synthesis is done separately.
 */
async function gatherFromSources(topicEntry, researchConfig) {
  const { topic, suggested_sources, tags } = topicEntry;
  const availability = checkSourceAvailability(researchConfig);
  const results = [];
  const errors = [];

  // Determine which sources to use based on tags and availability
  const useArxiv = (suggested_sources || []).includes('arxiv') ||
    (tags || []).some(t => ['research', 'paper', 'academic', 'ml', 'ai'].includes(t));
  const useNpm = (suggested_sources || []).includes('npm') ||
    (tags || []).some(t => ['javascript', 'node', 'npm', 'typescript', 'package'].includes(t));
  const useGithub = (suggested_sources || []).includes('github') ||
    (tags || []).some(t => ['code', 'library', 'framework', 'open-source'].includes(t));

  // 1. Web search — Brave → Serper fallback, automatically selected
  if (availability.available.includes('brave-search') || availability.available.includes('serper')) {
    try {
      const webResults = await webSearch(topic, researchConfig, 5);
      results.push(...webResults);
      logger.info({ subsystem: 'fact-seeker', message: `Web search: ${webResults.length} results for "${topic}"` });
    } catch (err) {
      errors.push({ source: 'web-search', error: err.message });
      logger.info({ subsystem: 'fact-seeker', message: `Web search failed: ${err.message}` });
    }
  }

  // 2. DuckDuckGo Instant Answers (always available, good for definitions/facts)
  try {
    const ddgResult = await duckduckgoInstant(topic, researchConfig);
    if (ddgResult) results.push(ddgResult);
  } catch (err) {
    errors.push({ source: 'duckduckgo', error: err.message });
  }

  // 3. Wikipedia (always available, high-quality structured knowledge)
  try {
    const wikiResult = await wikipediaFetch(topic, researchConfig);
    if (wikiResult) results.push(wikiResult);
  } catch (err) {
    errors.push({ source: 'wikipedia', error: err.message });
  }

  // 4. arXiv (for academic/research topics)
  if (useArxiv) {
    try {
      const arxivResults = await arxivSearch(topic, researchConfig, 3);
      results.push(...arxivResults);
      logger.info({ subsystem: 'fact-seeker', message: `arXiv: ${arxivResults.length} papers for "${topic}"` });
    } catch (err) {
      errors.push({ source: 'arxiv', error: err.message });
    }
  }

  // 5. npm (for JS/Node topics)
  if (useNpm) {
    try {
      const npmResults = await npmSearch(topic, researchConfig, 3);
      results.push(...npmResults);
    } catch (err) {
      errors.push({ source: 'npm', error: err.message });
    }
  }

  // 6. GitHub (for code/library topics)
  if (useGithub) {
    try {
      const ghResults = await githubSearch(topic, researchConfig, 'repositories', 3);
      results.push(...ghResults);
    } catch (err) {
      errors.push({ source: 'github', error: err.message });
    }
  }

  // 7. Deep crawl top result with Playwright (or plain fetch if not installed)
  if (results.length > 0) {
    const topResult = results.find(r => ['brave-search', 'serper'].includes(r.source) && r.url);
    if (topResult) {
      try {
        const crawled = await smartFetch(topResult.url, researchConfig);
        if (crawled.fullText && crawled.fullText.length > 200) {
          topResult.fullText = crawled.fullText.slice(0, 3000);
          if (crawled.source === 'playwright') {
            topResult.source = 'playwright';
            topResult.type = 'webpage-rendered';
          }
        }
      } catch { /* non-fatal */ }
    }
  }

  return { results, errors, sourcesUsed: [...new Set(results.map(r => r.source))] };
}

// ─── Synthesis & Fact Node Writing ──────────────────────────────────────────────

/**
 * Synthesize raw source results into a verified fact node via local LLM.
 */
async function synthesizeFacts(topic, results, runtimeConfig) {
  if (results.length === 0) return null;

  const sourceText = results.map(r => [
    `### [${r.source.toUpperCase()}] ${r.title}`,
    `URL: ${r.url}`,
    r.published ? `Published: ${r.published}` : '',
    r.snippet || '',
    r.fullText ? `\nFull text excerpt:\n${r.fullText.slice(0, 1500)}` : '',
  ].filter(Boolean).join('\n')).join('\n\n---\n\n');

  const prompt = `Research Topic: "${topic}"\n\nSources Gathered:\n${sourceText.slice(0, 10000)}\n\nSynthesize these into a verified knowledge node.`;

  try {
    const raw = await callLocalRuntime(prompt, SYNTHESIS_SYSTEM, runtimeConfig);
    const match = raw.match(/\{[\s\S]*\}/);
    if (!match) throw new Error('No JSON in synthesis response');
    return JSON.parse(match[0]);
  } catch (err) {
    logger.info({ subsystem: 'fact-seeker', message: `Synthesis failed for "${topic}": ${err.message}` });
    return null;
  }
}

// Confidence threshold above which research bypasses the inbox and writes
// directly to the vault as an active node, triggering an immediate surface recompile.
const FAST_PATH_CONFIDENCE = 0.7;

/**
 * Build the shared node body and frontmatter for a cited fact.
 * Used by both the fast path (direct vault write) and the inbox path.
 */
function buildCitedFactNode(topic, synthesis, sourceResults, status = 'draft') {
  const slug = `fact-${crypto.randomBytes(5).toString('hex')}`;
  const now = new Date().toISOString();

  const citations = sourceResults.map(r => ({
    source: r.source,
    type: r.type,
    title: r.title,
    url: r.url,
    published: r.published,
    relevance: r.relevance,
    accessed: now,
  }));

  const bodyLines = [
    synthesis.summary || '',
    '',
    '## Key Facts',
    ...(synthesis.key_facts || []).map(f => `- ${f}`),
    '',
    '## Sources',
    ...citations.map(c => `- [${c.source}] **${c.title}** — ${c.url}${c.published ? ` (${c.published})` : ''}`),
  ];

  if ((synthesis.further_research_needed || []).length > 0) {
    bodyLines.push('', '## Further Research Needed');
    synthesis.further_research_needed.forEach(g => bodyLines.push(`- ${g}`));
  }
  if ((synthesis.recommended_apis || []).length > 0) {
    bodyLines.push('', '## Recommended APIs / Integrations');
    synthesis.recommended_apis.forEach(a => bodyLines.push(`- ${a}`));
  }
  if ((synthesis.contradictions || []).length > 0) {
    bodyLines.push('', '## Source Contradictions Noted');
    synthesis.contradictions.forEach(c => bodyLines.push(`- ${c}`));
  }

  const frontmatter = {
    type: 'memory',
    slug,
    category: 'facts',
    title: synthesis.title || `Research: ${topic}`,
    status,
    confidence: synthesis.confidence || 0.6,
    importance: synthesis.confidence >= FAST_PATH_CONFIDENCE ? 6 : 4,
    created: now,
    updated: now,
    last_accessed: now,
    source: {
      type: 'knowledge-acquisition',
      session_id: `fact-seeker-${Date.now().toString(36)}`,
      agent: 'fact-seeker',
      evidence_count: sourceResults.length,
    },
    supersedes: [],
    superseded_by: null,
    contradicts: [],
    tags: ['fact-seeker', 'auto-researched', 'cited', status === 'active' ? 'fast-path' : 'pending-validation'],
    related: [],
    routes_to_skills: [],
    sentiment_polarity: 'descriptive',
    sentiment_target: 'external-knowledge',
    modality: 'should',
    subject: 'agent',
    predicate: 'know',
    object: topic,
    decay: { half_life_days: 60, access_count: 1 },
    schema_version: 2,
    x_memory_layer: 'research',
    x_topic: topic,
    x_temporal_context: synthesis.temporal_context || now.slice(0, 10),
    x_sources_count: sourceResults.length,
    x_citations: citations,
  };

  return { slug, body: bodyLines.join('\n'), frontmatter };
}

/**
 * Write a high-confidence fact node DIRECTLY to the vault (bypassing inbox)
 * and immediately trigger a surface recompile so it appears in INSTRUCTIONS.md
 * within seconds.
 *
 * @param {string} topic
 * @param {object} synthesis
 * @param {object[]} sourceResults
 * @param {string} vaultDir
 * @param {string} skillsDir
 * @param {string} derivedDir
 * @param {string} instructionsFile
 * @returns {string} slug
 */
async function writeAndSurfaceImmediately(topic, synthesis, sourceResults, {
  vaultDir, skillsDir, derivedDir, instructionsFile,
}) {
  const { slug, body, frontmatter } = buildCitedFactNode(topic, synthesis, sourceResults, 'active');

  // Write directly to vault as active node — available via search_memory immediately
  writeNode({ ...frontmatter, body }, vaultDir);

  for (const sr of sourceResults) {
    try { registerSource(sr, slug); } catch { /* non-fatal */ }
  }

  logger.info({
    subsystem: 'fact-seeker',
    message: `[FAST-PATH] "${topic}" written to vault as active (conf: ${synthesis.confidence}). Recompiling surface…`,
  });

  // Immediately recompile so INSTRUCTIONS.md reflects this new knowledge
  try {
    const { compileSurface } = await import('./surface.mjs');
    await compileSurface({ vaultDir, skillsDir, derivedDir, instructionsFile });
    logger.info({ subsystem: 'fact-seeker', message: `[FAST-PATH] Surface recompiled — "${topic}" now live in INSTRUCTIONS.md` });
  } catch (err) {
    logger.info({ subsystem: 'fact-seeker', message: `[FAST-PATH] Surface recompile failed (non-fatal): ${err.message}` });
  }

  return slug;
}

/**
 * Write a low-confidence fact as a draft node to the inbox for validation.
 * The conclusion-writer will promote it to the vault after review.
 */
function writeDraftToInbox(topic, synthesis, sourceResults, inboxDir) {
  const { slug, body, frontmatter } = buildCitedFactNode(topic, synthesis, sourceResults, 'draft');

  if (!fs.existsSync(inboxDir)) fs.mkdirSync(inboxDir, { recursive: true });
  atomicWrite(
    path.join(inboxDir, `${slug}.md`),
    matter.stringify(body, frontmatter),
  );

  for (const sr of sourceResults) {
    try { registerSource(sr, slug); } catch { /* non-fatal */ }
  }

  return slug;
}

// ─── Self-Diagnosis ──────────────────────────────────────────────────────────────

const SELF_DIAGNOSIS_SYSTEM = `You are a Knowledge System Analyst performing a self-audit.

Given the current state of a memory vault (topics covered, confidence levels, staleness), produce a diagnosis report.

Output valid JSON:
{
  "overall_coverage_score": 0.0-1.0,
  "strong_areas": ["string"],
  "weak_areas": ["string"],
  "temporal_gaps": ["string (topics where knowledge may be outdated)"],
  "source_diversity_score": 0.0-1.0,
  "recommended_immediate_research": [
    { "topic": "string", "reason": "string", "priority": 1-100 }
  ],
  "limitations": ["string (honest assessment of what the system doesn't know)"],
  "improvement_actions": ["string (concrete steps to buttress intelligence)"]
}

Output ONLY valid JSON.`;

/**
 * Run a self-diagnosis of the knowledge base.
 * Evaluates coverage, temporal awareness, source diversity, and limitations.
 */
export async function runSelfDiagnosis({ vaultDir, runtimeConfig }) {
  const nodes = loadNodes(vaultDir);
  const activeNodes = nodes.filter(n => n.status === 'active');
  const agenda = loadAgenda();
  const availability = checkSourceAvailability(loadResearchConfig());

  const now = Date.now();
  const factNodes = activeNodes.filter(n => n.category === 'facts');
  const avgAge = factNodes.length > 0
    ? factNodes.reduce((sum, n) => {
        const age = (now - new Date(n.updated || n.created || 0).getTime()) / 86400000;
        return sum + age;
      }, 0) / factNodes.length
    : 0;

  const vaultSummary = [
    `Total active nodes: ${activeNodes.length}`,
    `Fact nodes: ${factNodes.length}`,
    `Average fact age: ${avgAge.toFixed(0)} days`,
    `Pending research topics: ${agenda.filter(t => t.status === 'pending').length}`,
    `Well-covered topics: ${agenda.filter(t => t.status === 'well-covered').length}`,
    `Available sources: ${availability.available.join(', ')}`,
    `Unavailable sources: ${availability.unavailable.join(', ')}`,
    '',
    '## Current Knowledge Areas (by category/tags)',
    ...activeNodes.slice(0, 30).map(n =>
      `- [${n.category}] ${n.title} (conf: ${n.confidence}, age: ${Math.floor((now - new Date(n.updated || n.created || 0).getTime()) / 86400000)}d)`
    ),
  ].join('\n');

  const prompt = `Analyze this knowledge base state and produce a self-diagnosis:\n\n${vaultSummary}`;

  try {
    const raw = await callLocalRuntime(prompt, SELF_DIAGNOSIS_SYSTEM, runtimeConfig);
    const match = raw.match(/\{[\s\S]*\}/);
    if (!match) throw new Error('No JSON in diagnosis response');
    const diagnosis = JSON.parse(match[0]);

    // Auto-enqueue high-priority recommended topics
    const recommended = Array.isArray(diagnosis.recommended_immediate_research)
      ? diagnosis.recommended_immediate_research : [];
    for (const rec of recommended.filter(r => r.priority >= 70)) {
      addToAgenda({
        topic: rec.topic,
        priority: rec.priority,
        source: 'self-diagnosis',
        rationale: rec.reason,
      });
    }

    // Log source warnings
    for (const warning of availability.warnings) {
      logger.info({ subsystem: 'fact-seeker', message: `[source-config] ${warning}` });
    }

    logger.info({
      subsystem: 'fact-seeker',
      message: `Self-diagnosis: coverage ${diagnosis.overall_coverage_score}, ${diagnosis.weak_areas?.length || 0} weak areas, ${recommended.length} topics recommended`,
    });

    return { ...diagnosis, source_availability: availability };
  } catch (err) {
    logger.info({ subsystem: 'fact-seeker', message: `Self-diagnosis failed: ${err.message}` });
    return { error: err.message, source_availability: availability };
  }
}

// ─── Main Entry Point ────────────────────────────────────────────────────────────

/**
 * Execute one knowledge acquisition cycle:
 *   1. Pull next topic from agenda (or skip if empty)
 *   2. Gather from all available real sources
 *   3. Synthesize with LLM
 *   4. Write cited draft node to inbox
 *   5. Update agenda coverage score
 *
 * @param {object} opts
 * @param {string} opts.vaultDir
 * @param {string} opts.inboxDir
 * @param {string} opts.queueDir
 * @param {object} opts.runtimeConfig  Local LLM config
 * @param {string} [opts.forceTopic]   Override agenda — research this topic now
 * @returns {{ topic, factSlug?, sources, error? }}
 */
export async function runKnowledgeAcquisitionCycle({
  vaultDir,
  inboxDir,
  queueDir,
  runtimeConfig,
  forceTopic = null,
  // Surface paths — needed for immediate recompile on fast path
  skillsDir,
  derivedDir,
  instructionsFile,
}) {
  const researchConfig = loadResearchConfig();

  // Determine topic
  let topicEntry;
  if (forceTopic) {
    topicEntry = addToAgenda({ topic: forceTopic, priority: 90, source: 'direct-instruction', directInstruction: true });
  } else {
    topicEntry = getNextAgendaTopic();
  }

  if (!topicEntry) {
    // No agenda items — run self-diagnosis to generate new ones
    logger.info({ subsystem: 'fact-seeker', message: 'Agenda empty — running self-diagnosis to generate topics' });
    await runSelfDiagnosis({ vaultDir, runtimeConfig });
    topicEntry = getNextAgendaTopic();
    if (!topicEntry) {
      return { topic: null, skipped: 'empty-agenda-after-diagnosis' };
    }
  }

  const { topic, id: topicId } = topicEntry;
  logger.info({ subsystem: 'fact-seeker', message: `Researching: "${topic}" (priority: ${topicEntry.priority})` });

  // Gather from real sources
  const { results, errors, sourcesUsed } = await gatherFromSources(topicEntry, researchConfig);

  if (results.length === 0) {
    logger.info({
      subsystem: 'fact-seeker',
      message: `No results for "${topic}". Errors: ${errors.map(e => `${e.source}: ${e.error}`).join('; ')}`,
    });
    return { topic, sources: [], errors, skipped: 'no-results' };
  }

  // Synthesize via local LLM
  const synthesis = await synthesizeFacts(topic, results, runtimeConfig);
  if (!synthesis) {
    return { topic, sources: sourcesUsed, skipped: 'synthesis-failed' };
  }

  const confidence = synthesis.confidence || 0;

  // ─── Fast Path: high-confidence → vault immediately + surface recompile ────────
  // Low-confidence → inbox for human/validation review
  let factSlug;
  let surfaced = false;
  if (confidence >= FAST_PATH_CONFIDENCE && skillsDir && derivedDir && instructionsFile) {
    factSlug = await writeAndSurfaceImmediately(topic, synthesis, results, {
      vaultDir, skillsDir, derivedDir, instructionsFile,
    });
    surfaced = true;
  } else {
    // Low confidence: stage for validation before vault promotion
    factSlug = writeDraftToInbox(topic, synthesis, results, inboxDir);
    logger.info({
      subsystem: 'fact-seeker',
      message: `[INBOX-PATH] "${topic}" staged for validation (conf: ${confidence} < ${FAST_PATH_CONFIDENCE})`,
    });
  }

  // Calculate coverage score
  const coverageScore = Math.min(1.0, (results.length / 5) * confidence);
  markTopicResearched(topicId, { coverageScore, sourcesConsulted: sourcesUsed });

  // Enqueue follow-up research for identified gaps (self-multiplication)
  const gaps = synthesis.further_research_needed || [];
  for (const gap of gaps.slice(0, 3)) {
    addToAgenda({
      topic: gap,
      priority: Math.max(20, topicEntry.priority - 15),
      source: `follow-up:${topic}`,
      rationale: `Gap identified while researching "${topic}"`,
    });
  }

  logger.info({
    subsystem: 'fact-seeker',
    message: `"${topic}" complete: ${results.length} sources, confidence ${confidence}, slug ${factSlug}, surfaced: ${surfaced}`,
  });

  return { topic, factSlug, sources: sourcesUsed, confidence, surfaced };
}

/**
 * Ingest a session and add inferred topics to the research agenda.
 * Called by the daemon after each session post-mortem.
 */
export async function ingestSessionTopics(sessionTranscript, runtimeConfig) {
  const topics = await inferTopicsFromSession(sessionTranscript, runtimeConfig);
  const added = [];

  for (const t of topics) {
    const entry = addToAgenda({
      topic: t.topic,
      priority: t.priority || 50,
      source: 'session-inference',
      rationale: t.rationale || '',
      tags: t.tags || [],
    });
    added.push(entry.topic);
  }

  if (added.length > 0) {
    logger.info({
      subsystem: 'fact-seeker',
      message: `Added ${added.length} topics from session: ${added.join(', ')}`,
    });
  }

  return added;
}
