import fs from 'fs';
import path from 'path';
import matter from 'gray-matter';
import crypto from 'crypto';
import os from 'os';
import { callLocalRuntime, cleanAndParseJSON } from './runtime.mjs';
import { writeNode, atomicWrite, safeStringify } from './vault.mjs';
import { getNodes } from './vault-cache.mjs';
import { logger } from './logger.mjs';
import { addToQueue } from './research-queue.mjs';
import { persistTaskToDisk } from './scheduler.mjs';
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
 * Get dynamic timezone-aware local date and time string.
 */
export function getLocalizedDateTime() {
  return new Date().toLocaleString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    timeZoneName: 'short'
  });
}

/**
 * Format ISO date string into a human-readable beautiful date.
 */
export function formatBeautifulDate(isoString) {
  if (!isoString) return 'unknown';
  try {
    const d = new Date(isoString);
    if (isNaN(d.getTime())) return isoString;
    return d.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
  } catch {
    return isoString;
  }
}

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

import { agentDir, brainDir } from './config.mjs';

const getAgentDir = () => process.env.AGENT_DIR || process.env._TR_TEST_AGENT_DIR || agentDir;
const getBrainDir = () => {
  const ad = getAgentDir();
  // If agentDir was overridden (e.g. in tests), derive brainDir from it
  return ad !== agentDir ? path.join(ad, 'skills', 'total-recall') : brainDir;
};
const getAgendaFile = () => path.join(getBrainDir(), 'research-agenda.jsonl');
const getSourcesRegistry = () => path.join(getBrainDir(), 'memory-derived', 'source-registry.jsonl');

// ─── Research Agenda ────────────────────────────────────────────────────────────

/**
 * Load the persistent research agenda from disk.
 * @returns {ResearchTopic[]}
 */
export function loadAgenda() {
  const agendaFile = getAgendaFile();
  if (!fs.existsSync(agendaFile)) return [];
  return fs.readFileSync(agendaFile, 'utf8')
    .split('\n').filter(Boolean)
    .map(line => { try { return JSON.parse(line); } catch { return null; } })
    .filter(Boolean);
}

/**
 * Save the full agenda back to disk.
 */
function saveAgenda(topics) {
  const agendaFile = getAgendaFile();
  const dir = path.dirname(agendaFile);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  atomicWrite(agendaFile, topics.map(t => JSON.stringify(t)).join('\n') + '\n');
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
  const sourcesRegistry = getSourcesRegistry();
  const dir = path.dirname(sourcesRegistry);
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

  fs.appendFileSync(sourcesRegistry, record);
}

// ─── Topic Inference ─────────────────────────────────────────────────────────────

function TOPIC_INFERENCE_SYSTEM(runtimeConfig) {
  const today = getLocalizedDateTime();
  const cutoff = runtimeConfig?.training_cutoff || 'January 2025';
  return `You are a Research Agenda Analyst. Today's date and time is ${today}. The model's training data cutoff is ${cutoff} — anything after that date may be outdated or unknown. Given a conversation transcript, identify topics that would benefit from real-world verification, especially anything that may have changed since the training cutoff.

Output valid JSON:
{
  "topics": [
    {
      "topic": "string (specific, searchable — e.g. 'Ollama REST API endpoints 2025' not just 'AI')",
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
- Prioritize topics post-${cutoff} or where the agent showed uncertainty.
- Output ONLY valid JSON.`;
}

/**
 * Infer research topics from a session transcript via the local LLM.
 */
export async function inferTopicsFromSession(transcript, runtimeConfig) {
  if (!transcript || transcript.length < 100) return [];

  const prompt = `Analyze this conversation and identify the most important research topics:\n\n${transcript.slice(0, 8000)}`;

  try {
    const raw = await callLocalRuntime(prompt, TOPIC_INFERENCE_SYSTEM(runtimeConfig), runtimeConfig);
    const match = raw.match(/\{[\s\S]*\}/);
    if (!match) return [];
    const result = cleanAndParseJSON(match[0]);
    return Array.isArray(result.topics) ? result.topics : [];
  } catch (err) {
    logger.info({ subsystem: 'fact-seeker', message: `Topic inference failed: ${err.message}` });
    return [];
  }
}

// ─── Multi-Source Research Execution ────────────────────────────────────────────

function SYNTHESIS_SYSTEM(runtimeConfig) {
  const today = getLocalizedDateTime();
  const cutoff = runtimeConfig?.training_cutoff || 'January 2025';
  return `You are a Knowledge Synthesis Analyst. Today's date and time is ${today}. The model's training data cutoff is ${cutoff}. Given raw search results, extract verified facts and synthesize them into a coherent knowledge node. Prioritize sources published after ${cutoff} — they contain information the model cannot know from training alone.

Output valid JSON:
{
  "title": "string (precise, descriptive)",
  "summary": "string (3-5 paragraphs synthesizing all sources)",
  "key_facts": ["string (specific, verifiable fact with inline citation [Source: URL])"],
  "confidence": 0.0-1.0,
  "temporal_context": "string (when this information is current as of, relative to today ${today})",
  "contradictions": ["string (any sources that disagreed)"],
  "further_research_needed": ["string (gaps that remain)]",
  "recommended_apis": ["string (specific APIs/endpoints worth integrating for this topic)"]
}

Rules:
- Every key fact MUST have an inline citation [Source: URL]
- Confidence: single source = max 0.6, 3+ agreeing post-cutoff sources = up to 0.95
- Flag any fact that relies solely on pre-${cutoff} training data as potentially stale
- Be temporally specific — note publication dates relative to today and the cutoff
- Output ONLY valid JSON`;
}

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

  const tasks = [];

  // 1. Web search — Brave → Serper fallback, automatically selected
  if (availability.available.includes('brave-search') || availability.available.includes('serper')) {
    tasks.push((async () => {
      try {
        const webResults = await webSearch(topic, researchConfig, 5);
        logger.info({ subsystem: 'fact-seeker', message: `Web search: ${webResults.length} results for "${topic}"` });
        return { success: true, results: webResults };
      } catch (err) {
        logger.info({ subsystem: 'fact-seeker', message: `Web search failed: ${err.message}` });
        return { success: false, source: 'web-search', error: err.message };
      }
    })());
  }

  // 2. DuckDuckGo Instant Answers (always available, good for definitions/facts)
  tasks.push((async () => {
    try {
      const ddgResult = await duckduckgoInstant(topic, researchConfig);
      return { success: true, results: ddgResult ? [ddgResult] : [] };
    } catch (err) {
      return { success: false, source: 'duckduckgo', error: err.message };
    }
  })());

  // 3. Wikipedia (always available, high-quality structured knowledge)
  tasks.push((async () => {
    try {
      const wikiResult = await wikipediaFetch(topic, researchConfig);
      return { success: true, results: wikiResult ? [wikiResult] : [] };
    } catch (err) {
      return { success: false, source: 'wikipedia', error: err.message };
    }
  })());

  // 4. arXiv (for academic/research topics)
  if (useArxiv) {
    tasks.push((async () => {
      try {
        const arxivResults = await arxivSearch(topic, researchConfig, 3);
        logger.info({ subsystem: 'fact-seeker', message: `arXiv: ${arxivResults.length} papers for "${topic}"` });
        return { success: true, results: arxivResults };
      } catch (err) {
        return { success: false, source: 'arxiv', error: err.message };
      }
    })());
  }

  // 5. npm (for JS/Node topics)
  if (useNpm) {
    tasks.push((async () => {
      try {
        const npmResults = await npmSearch(topic, researchConfig, 3);
        return { success: true, results: npmResults };
      } catch (err) {
        return { success: false, source: 'npm', error: err.message };
      }
    })());
  }

  // 6. GitHub (for code/library topics)
  if (useGithub) {
    tasks.push((async () => {
      try {
        const ghResults = await githubSearch(topic, researchConfig, 'repositories', 3);
        return { success: true, results: ghResults };
      } catch (err) {
        return { success: false, source: 'github', error: err.message };
      }
    })());
  }

  // Await all tasks concurrently in parallel
  const taskResults = await Promise.all(tasks);

  for (const res of taskResults) {
    if (res.success) {
      results.push(...res.results);
    } else {
      errors.push({ source: res.source, error: res.error });
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
      } catch (err) {
        logger.debug('fact-seeker: smartFetch failed during topResult crawl', { err: err.message });
      }
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
    const raw = await callLocalRuntime(prompt, SYNTHESIS_SYSTEM(runtimeConfig), runtimeConfig);
    const match = raw.match(/\{[\s\S]*\}/);
    if (!match) throw new Error('No JSON in synthesis response');
    return cleanAndParseJSON(match[0]);
  } catch (err) {
    logger.info({ subsystem: 'fact-seeker', message: `Synthesis failed for "${topic}": ${err.message}` });
    return null;
  }
}

// Confidence threshold above which research bypasses the inbox and writes
// directly to the vault as an active node, triggering an immediate surface recompile.
const FAST_PATH_CONFIDENCE = 0.7;

/**
 * Summarize a single research source using the local LLM.
 * Fallback to snippet if local LLM fails or times out.
 */
async function synthesizeSupportingNote(topic, result, runtimeConfig) {
  const today = getLocalizedDateTime();
  const sourceContent = [
    `Source: ${result.source}`,
    `Title: ${result.title}`,
    `URL: ${result.url}`,
    result.published ? `Published: ${result.published}` : '',
    `Snippet: ${result.snippet || ''}`,
    result.fullText ? `Excerpt: ${result.fullText.slice(0, 1500)}` : '',
  ].filter(Boolean).join('\n');

  const prompt = `Research Topic: "${topic}"\n\nSpecific Source details:\n${sourceContent}\n\nSummarize the key facts, findings, and context from this specific source into a concise, detailed supporting research note (1-2 paragraphs).`;

  const systemPrompt = `You are a Research Assistant. Today's date and time is ${today}.
Given a specific search or source result, summarize its key findings, data points, or context in 1-2 detailed, high-quality paragraphs. Do not add general summary of other sources, focus ONLY on the provided source content. Keep it premium, objective, and dense with facts.
Do not wrap in Markdown code blocks, just output the raw summary text.`;

  try {
    const raw = await callLocalRuntime(prompt, systemPrompt, runtimeConfig);
    const cleaned = raw.trim();
    if (cleaned.length > 20) return cleaned;
    return result.snippet || 'No summary available.';
  } catch (err) {
    logger.info({ subsystem: 'fact-seeker', message: `Supporting note summary failed: ${err.message}` });
    return result.snippet || 'No summary available.';
  }
}

/**
 * Build the bidirectional wiki-graph representing the Main Master Artifact and Supporting Notes.
 */
export function buildMultiNoteGraph(topic, synthesis, parsedSupportingNotes, status = 'draft') {
  const now = new Date().toISOString();

  const supportingNodes = parsedSupportingNotes.map(({ result, summary, slug }) => {
    const citations = [{
      source: result.source,
      type: result.type,
      title: result.title,
      url: result.url,
      published: result.published,
      relevance: result.relevance,
      accessed: now,
    }];

    const supportingTemporal = result.published || now;
    const supportingTemporalFriendly = result.published ? formatBeautifulDate(result.published) : formatBeautifulDate(now);
    const supportingTemporalCallout = `> [!NOTE]\n> **Temporal Context**: Information published/current as of ${supportingTemporalFriendly}.`;

    const publishedStr = result.published ? ` (Published: ${result.published})` : '';
    const bodyLines = [
      supportingTemporalCallout,
      '',
      summary,
      '',
      '## Citations',
      `- [${result.source}] **${result.title}** — ${result.url}${publishedStr}`
    ];

    const frontmatter = {
      type: 'memory',
      slug,
      category: 'facts',
      title: `Source Note: ${result.title}`,
      status,
      confidence: synthesis.confidence || 0.6,
      importance: synthesis.confidence >= FAST_PATH_CONFIDENCE ? 4 : 3,
      created: now,
      updated: now,
      last_accessed: now,
      source: {
        type: 'knowledge-acquisition',
        session_id: `fact-seeker-${Date.now().toString(36)}`,
        agent: 'fact-seeker',
        evidence_count: 1,
      },
      supersedes: [],
      superseded_by: null,
      contradicts: [],
      tags: ['fact-seeker', 'auto-researched', 'supporting-note', status === 'active' ? 'fast-path' : 'pending-validation'],
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
      x_temporal_context: supportingTemporal,
      x_sources_count: 1,
      x_citations: citations,
    };

    return { slug, body: bodyLines.join('\n'), frontmatter };
  });

  const masterSlug = `fact-master-${crypto.randomBytes(5).toString('hex')}`;

  // Bidirectionally link the master node and supporting notes
  const masterRelated = supportingNodes.map(n => n.slug);
  supportingNodes.forEach(node => {
    node.frontmatter.related = [masterSlug];
  });

  let masterTemporal = now;
  if (synthesis.temporal_context && !isNaN(Date.parse(synthesis.temporal_context))) {
    masterTemporal = new Date(synthesis.temporal_context).toISOString();
  } else {
    let latestPub = null;
    for (const { result } of parsedSupportingNotes) {
      if (result?.published) {
        const parsed = Date.parse(result.published);
        if (!isNaN(parsed)) {
          if (!latestPub || parsed > latestPub) {
            latestPub = parsed;
          }
        }
      }
    }
    if (latestPub) {
      masterTemporal = new Date(latestPub).toISOString();
    } else if (synthesis.temporal_context) {
      masterTemporal = synthesis.temporal_context;
    }
  }

  const masterTemporalFriendly = formatBeautifulDate(masterTemporal);
  const masterTemporalCallout = `> [!NOTE]\n> **Temporal Context**: Information current as of ${masterTemporalFriendly}.`;

  const bodyLines = [
    masterTemporalCallout,
    '',
    synthesis.summary || '',
    '',
    '## Supporting Evidence',
    ...supportingNodes.map(n => `- [[${n.slug}]] — ${n.frontmatter.title}`),
    '',
    '## Key Facts',
    ...(synthesis.key_facts || []).map(f => `- ${f}`),
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

  const allCitations = parsedSupportingNotes.map(({ result }) => ({
    source: result.source,
    type: result.type,
    title: result.title,
    url: result.url,
    published: result.published,
    relevance: result.relevance,
    accessed: now,
  }));

  // Append Citations section to the master node body as well
  bodyLines.push('', '## Citations');
  allCitations.forEach(c => {
    const publishedStr = c.published ? ` (Published: ${c.published})` : '';
    bodyLines.push(`- [${c.source}] **${c.title}** — ${c.url}${publishedStr}`);
  });

  const masterFrontmatter = {
    type: 'memory',
    slug: masterSlug,
    category: 'facts',
    title: synthesis.title || `Research: ${topic}`,
    status,
    confidence: synthesis.confidence || 0.6,
    importance: synthesis.confidence >= FAST_PATH_CONFIDENCE ? 5 : 4,
    created: now,
    updated: now,
    last_accessed: now,
    source: {
      type: 'knowledge-acquisition',
      session_id: `fact-seeker-${Date.now().toString(36)}`,
      agent: 'fact-seeker',
      evidence_count: allCitations.length,
    },
    supersedes: [],
    superseded_by: null,
    contradicts: [],
    tags: ['fact-seeker', 'auto-researched', 'master-artifact', status === 'active' ? 'fast-path' : 'pending-validation'],
    related: masterRelated,
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
    x_temporal_context: masterTemporal,
    x_sources_count: allCitations.length,
    x_citations: allCitations,
  };

  const masterNode = { slug: masterSlug, body: bodyLines.join('\n'), frontmatter: masterFrontmatter };

  return { masterNode, supportingNodes };
}

/**
 * Write high-confidence master and supporting nodes DIRECTLY to the vault
 * and immediately trigger a surface recompile.
 */
async function writeAndSurfaceImmediately(topic, synthesis, sourceResults, {
  vaultDir, skillsDir, derivedDir, instructionsFile,
}, runtimeConfig) {
  const parsedSupportingNotes = [];
  const topResults = sourceResults.slice(0, 4);
  for (const r of topResults) {
    const summary = await synthesizeSupportingNote(topic, r, runtimeConfig);
    const slug = `fact-note-${crypto.randomBytes(5).toString('hex')}`;
    parsedSupportingNotes.push({ result: r, summary, slug });
  }

  const { masterNode, supportingNodes } = buildMultiNoteGraph(topic, synthesis, parsedSupportingNotes, 'active');

  // Write supporting nodes to vault
  for (const node of supportingNodes) {
    writeNode({ ...node.frontmatter, body: node.body }, vaultDir);
  }
  // Write master node to vault
  writeNode({ ...masterNode.frontmatter, body: masterNode.body }, vaultDir);

  for (const sr of sourceResults) {
    try { registerSource(sr, masterNode.slug); } catch (err) { logger.debug('fact-seeker: registerSource fast-path failed', { err: err.message }); }
  }

  logger.info({
    subsystem: 'fact-seeker',
    message: `[FAST-PATH] "${topic}" written to vault as active master (${masterNode.slug}) with ${supportingNodes.length} supporting notes. Recompiling surface…`,
  });

  // Immediately recompile so INSTRUCTIONS.md reflects this new knowledge
  try {
    const { compileSurface } = await import('./surface.mjs');
    await compileSurface({ vaultDir, skillsDir, derivedDir, instructionsFile });
    logger.info({ subsystem: 'fact-seeker', message: `[FAST-PATH] Surface recompiled — "${topic}" now live in INSTRUCTIONS.md` });
  } catch (err) {
    logger.info({ subsystem: 'fact-seeker', message: `[FAST-PATH] Surface recompile failed (non-fatal): ${err.message}` });
  }

  return masterNode.slug;
}

/**
 * Write low-confidence master and supporting nodes as draft nodes to the inbox.
 */
async function writeDraftToInbox(topic, synthesis, sourceResults, inboxDir, runtimeConfig) {
  const parsedSupportingNotes = [];
  const topResults = sourceResults.slice(0, 4);
  for (const r of topResults) {
    const summary = await synthesizeSupportingNote(topic, r, runtimeConfig);
    const slug = `fact-note-${crypto.randomBytes(5).toString('hex')}`;
    parsedSupportingNotes.push({ result: r, summary, slug });
  }

  const { masterNode, supportingNodes } = buildMultiNoteGraph(topic, synthesis, parsedSupportingNotes, 'draft');

  if (!fs.existsSync(inboxDir)) fs.mkdirSync(inboxDir, { recursive: true });

  // Write supporting nodes as drafts in the inbox
  for (const node of supportingNodes) {
    atomicWrite(
      path.join(inboxDir, `${node.slug}.md`),
      safeStringify(node.body, node.frontmatter),
    );
  }

  // Write master node as draft in the inbox
  atomicWrite(
    path.join(inboxDir, `${masterNode.slug}.md`),
    safeStringify(masterNode.body, masterNode.frontmatter),
  );

  for (const sr of sourceResults) {
    try { registerSource(sr, masterNode.slug); } catch (err) { logger.debug('fact-seeker: registerSource inbox failed', { err: err.message }); }
  }

  return masterNode.slug;
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
  const nodes = getNodes(vaultDir);
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
    const diagnosis = cleanAndParseJSON(match[0]);

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
    }, runtimeConfig);
    surfaced = true;
  } else {
    // Low confidence: stage for validation before vault promotion
    factSlug = await writeDraftToInbox(topic, synthesis, results, inboxDir, runtimeConfig);
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

// ─── Specialized Cognitive Research Phase Engines ────────────────────────────────

async function pushDeliberationConclusion(conclusions = []) {
  if (!conclusions.length) return;
  
  // 1. Resolve interrupts file path
  // Use isolated dynamic agent dir in tests, global in production
  const interruptsFile = path.join(getBrainDir(), 'interrupts', 'pending.md');

  const dir = path.dirname(interruptsFile);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  // 2. Read existing content to check for duplication
  const existingContent = fs.existsSync(interruptsFile) ? fs.readFileSync(interruptsFile, 'utf8') : '';
  
  // Filter out conclusions that are already present in pending.md to prevent duplicate alerts
  const uniqueConclusions = conclusions.filter(c => !existingContent.includes(c));
  if (uniqueConclusions.length === 0) {
    logger.info({ subsystem: 'fact-seeker', message: 'Deliberation conclusions are already present in pending.md, skipping notifications.' });
    return;
  }

  // 3. Append unique conclusions to the interrupts file
  const lines = [
    `\n\n---`,
    `<!-- total-recall deliberation-interrupt: ${new Date().toISOString()} -->`,
    `## 🧠 New Deliberation Insight`,
    ...uniqueConclusions.map(c => `- ${c}`),
    ``,
    `*Query \`search_memory\` or check vault for full context.*`,
  ];
  fs.appendFileSync(interruptsFile, lines.join('\n'));
  
  // 4. macOS notification (Skip in tests)
  if (process.env.VITEST) {
    logger.debug('fact-seeker: bypassing notification in test environment');
    return;
  }

  const notificationSummary = uniqueConclusions[0] || 'New deliberation conclusion';
  try {
    const { sendSystemNotification } = await import('./notifications.mjs');
    await sendSystemNotification('Total Recall Deliberation', notificationSummary, {
      open: interruptsFile,
      sound: 'Glass',
      subtitle: 'Deliberation Insight',
      group: 'total-recall-deliberation'
    });
  } catch (err) {
    logger.debug('fact-seeker: deliberation notification failed', { err: err.message });
  }
}

/**
 * Phase 2/5: Deliberation
 */
export async function runResearchDeliberationCycle({ vaultDir, nodeSlug, topic, runtimeConfig }) {
  const nodes = getNodes(vaultDir);
  const targetNode = nodes.find(n => n.slug === nodeSlug);
  if (!targetNode) {
    return { success: false, error: `Target node not found for slug: ${nodeSlug}` };
  }
  
  const otherFacts = nodes.filter(n => n.status === 'active' && n.category === 'facts' && n.slug !== nodeSlug);
  const otherFactsText = otherFacts.slice(0, 15).map(n => `- [${n.slug}] ${n.title}: ${n.body.slice(0, 300)}`).join('\n');
  
  const today = getLocalizedDateTime();
  const prompt = `Today's Date/Time: ${today}
Target Node Topic: "${topic}"
Title: ${targetNode.title}
Temporal Context of Target: ${targetNode.x_temporal_context || 'unknown'}
Body:
${targetNode.body}

Other Active Facts in Memory Vault:
${otherFactsText || 'No other active facts.'}

Analyze the target node in the context of the other facts. Identify:
1. Any connections, overlaps, or implicit relationships between this node and the other facts.
2. Any contradictions or discrepancies between this node and the other facts.
3. Any facts that this target node supersedes or renders obsolete (e.g. because this is a newer update or contains more recent data than an older fact).
4. Any new higher-level cognitive insights or takeaways.
5. Additional tags to add to the target node.`;

  const systemPrompt = `You are a System 2 Cognitive Deliberation Engine. Today's date and time is ${today}. Your job is to deeply analyze the target knowledge node in relation to other facts in the memory vault.
Identify connections, contradictions/discrepancies, facts that are superseded or rendered obsolete by the target node, high-level insights, actionable patterns/corrections, and autonomous tasks.

Output valid JSON:
{
  "insights": ["specific high-level insight"],
  "connections": [
    {
      "slug": "string (the target node slug to link to)",
      "description": "string (relationship explanation)"
    }
  ],
  "contradictions": [
    {
      "slug": "string (the target node slug that contradicts)",
      "description": "string (contradiction explanation)"
    }
  ],
  "supersedes": [
    {
      "slug": "string (the target node slug that this target node supersedes/renders obsolete)",
      "description": "string (explanation of why the older node is now obsolete/superseded)"
    }
  ],
  "additional_tags": ["tag1", "tag2"],
  "synthesized_instructions": [
    {
      "title": "string (clear guideline title)",
      "body": "string (the detailed rule/convention/guideline)",
      "category": "patterns",
      "modality": "should",
      "sentiment_polarity": "descriptive",
      "subject": "agent",
      "predicate": "use",
      "object": "string (what the rule applies to)"
    }
  ],
  "autonomous_tasks": [
    {
      "priority": 50,
      "category": "proactive-research",
      "reason": "string (why this task is needed)",
      "body": "string (detailed markdown instructions for the task)"
    }
  ]
}

Rules for synthesized_instructions:
- Use category "patterns" or "corrections".
- Modality MUST be one of: "must", "must_not", "should", "should_not".
- Sentiment_polarity MUST be one of: "directive_must", "directive_must_not", "descriptive", "preference".
- Subject and predicate MUST be alphanumeric (letters, numbers, hyphens, underscores, dots, spaces only). E.g., subject="agent", predicate="use".
- Keep rules highly actionable.

Rules for autonomous_tasks:
- Category MUST be one of: "memory-maintenance", "system2-deliberation", "skill-engineering", "proactive-research", "self-evaluation", "exploration".
- Priority MUST be an integer between 1 and 100.

Output ONLY valid JSON.`;
  
  try {
    const raw = await callLocalRuntime(prompt, systemPrompt, runtimeConfig);
    const match = raw.match(/\{[\s\S]*\}/);
    if (!match) throw new Error('No JSON in deliberation response');
    const result = cleanAndParseJSON(match[0]);
    
    // Update target node body and frontmatter
    let updatedBody = targetNode.body;
    const linesToAdd = [];
    
    if (result.insights && result.insights.length > 0) {
      linesToAdd.push('', '## Cognitive Deliberation', ...result.insights.map(ins => `- **Insight**: ${ins}`));
    }
    
    const relatedSlugs = new Set(targetNode.related || []);
    if (result.connections && result.connections.length > 0) {
      if (linesToAdd.length === 0) linesToAdd.push('', '## Cognitive Deliberation');
      for (const conn of result.connections) {
        if (conn.slug && conn.slug !== nodeSlug) {
          linesToAdd.push(`- **Connection to [[${conn.slug}]]**: ${conn.description || ''}`);
          relatedSlugs.add(conn.slug);
          // Bidirectional graph link
          const otherNode = nodes.find(n => n.slug === conn.slug);
          if (otherNode) {
            const otherRelated = new Set(otherNode.related || []);
            otherRelated.add(nodeSlug);
            otherNode.related = Array.from(otherRelated);
            otherNode.updated = new Date().toISOString();
            writeNode(otherNode, vaultDir);
          }
        }
      }
    }
    if (result.contradictions && result.contradictions.length > 0) {
      if (linesToAdd.length === 0) linesToAdd.push('', '## Cognitive Deliberation');
      for (const contra of result.contradictions) {
        if (contra.slug && contra.slug !== nodeSlug) {
          linesToAdd.push(`- **Discrepancy with [[${contra.slug}]]**: ${contra.description || ''}`);
          relatedSlugs.add(contra.slug);
          // Bidirectional graph link and contradictions annotation
          const otherNode = nodes.find(n => n.slug === contra.slug);
          if (otherNode) {
            const otherRelated = new Set(otherNode.related || []);
            otherRelated.add(nodeSlug);
            otherNode.related = Array.from(otherRelated);
            const otherContradicts = new Set(otherNode.contradicts || []);
            otherContradicts.add(nodeSlug);
            otherNode.contradicts = Array.from(otherContradicts);
            otherNode.updated = new Date().toISOString();
            writeNode(otherNode, vaultDir);
          }
        }
      }
    }

    const originalSupersedes = targetNode.supersedes || [];
    const newSupersedes = [...new Set([...originalSupersedes])];
    if (result.supersedes && result.supersedes.length > 0) {
      if (linesToAdd.length === 0) linesToAdd.push('', '## Cognitive Deliberation');
      for (const sup of result.supersedes) {
        if (sup.slug && sup.slug !== nodeSlug) {
          linesToAdd.push(`- **Supersedes [[${sup.slug}]]**: ${sup.description || ''}`);
          newSupersedes.push(sup.slug);
          // Update the superseded node in vault
          const otherNode = nodes.find(n => n.slug === sup.slug);
          if (otherNode) {
            otherNode.superseded_by = nodeSlug;
            otherNode.updated = new Date().toISOString();
            writeNode(otherNode, vaultDir);
          }
        }
      }
    }
    
    if (linesToAdd.length > 0) {
      updatedBody += '\n' + linesToAdd.join('\n');
    }
    
    const originalTags = targetNode.tags || [];
    const newTags = [...new Set([...originalTags, ...(result.additional_tags || []), 'deliberated'])];
    
    targetNode.related = Array.from(relatedSlugs);
    const updatedNode = {
      ...targetNode,
      body: updatedBody,
      tags: newTags,
      supersedes: newSupersedes,
      updated: new Date().toISOString()
    };
    
    writeNode(updatedNode, vaultDir);
    
    const conclusions = [];
    if (result.insights && result.insights.length > 0) {
      conclusions.push(...result.insights);
    }
    if (result.connections && result.connections.length > 0) {
      conclusions.push(...result.connections.map(c => `Connection to ${c.slug}: ${c.description || ''}`));
    }
    
    if (conclusions.length > 0) {
      await pushDeliberationConclusion(conclusions);
    }

    // Process synthesized instructions
    const localBrainDir = getBrainDir();
    const now = new Date().toISOString();
    let rulesSynthesized = false;
    
    if (result.synthesized_instructions && result.synthesized_instructions.length > 0) {
      for (const inst of result.synthesized_instructions) {
        const ruleSlug = `rule-synth-${crypto.randomBytes(5).toString('hex')}`;
        const ruleNode = {
          type: 'memory',
          slug: ruleSlug,
          category: inst.category || 'patterns',
          title: inst.title || 'Synthesized Rule',
          status: 'active',
          priority: 'absolute',
          confidence: 0.9,
          importance: 5,
          created: now,
          updated: now,
          last_accessed: now,
          source: {
            type: 'deliberation-synthesis',
            session_id: targetNode.source?.session_id || `delib-${Date.now().toString(36)}`,
            agent: 'fact-seeker-deliberation',
            evidence_count: 1,
          },
          supersedes: [],
          superseded_by: null,
          contradicts: [],
          tags: ['deliberation', 'synthesized-rule', 'auto-generated'],
          related: [nodeSlug],
          routes_to_skills: [],
          sentiment_polarity: inst.sentiment_polarity || 'descriptive',
          sentiment_target: inst.category || 'patterns',
          modality: inst.modality || 'should',
          subject: inst.subject || 'agent',
          predicate: inst.predicate || 'use',
          object: inst.object || topic,
          decay: { half_life_days: 120, access_count: 1 },
          schema_version: 2,
          x_memory_layer: 'conscious',
          x_temporal_context: targetNode.x_temporal_context || now,
          x_citations: [{
            source: 'deliberation-synthesis',
            title: `Synthesized from target node: ${targetNode.title || nodeSlug}`,
            url: `file://${path.join(vaultDir, targetNode.category, targetNode.slug + '.md')}`,
            published: targetNode.updated || now,
            relevance: 1.0,
            accessed: now
          }],
          body: inst.body || ''
        };
        
        writeNode(ruleNode, vaultDir);
        rulesSynthesized = true;
        logger.info({
          subsystem: 'fact-seeker',
          message: `Synthesized active rule node: ${ruleSlug} (${inst.category})`
        });
      }
      
      // Trigger immediate surface recompilation if active rules were synthesized
      if (rulesSynthesized) {
        try {
          const skillsDir = path.join(getAgentDir(), 'skills');
          const derivedDir = path.join(localBrainDir, 'memory-derived');
          const instructionsFile = path.join(getAgentDir(), 'INSTRUCTIONS.md');
          const { compileSurface } = await import('./surface.mjs');
          await compileSurface({ vaultDir, skillsDir, derivedDir, instructionsFile });
          logger.info({
            subsystem: 'fact-seeker',
            message: `Surface compiled with newly synthesized developer instructions/patterns.`
          });
        } catch (err) {
          logger.info({
            subsystem: 'fact-seeker',
            message: `Surface compilation failed (non-fatal): ${err.message}`
          });
        }
      }
    }

    // Process autonomous tasks
    if (result.autonomous_tasks && result.autonomous_tasks.length > 0) {
      const queueDir = path.join(localBrainDir, 'scheduler', 'queue');
      const { persistTaskToDisk } = await import('./scheduler.mjs');
      for (const t of result.autonomous_tasks) {
        const taskSlug = `delib-task-${crypto.randomBytes(4).toString('hex')}`;
        const taskNode = {
          type: 'task',
          slug: taskSlug,
          priority: t.priority || 50,
          category: t.category || 'proactive-research',
          status: 'pending',
          created_by: 'fact-seeker-deliberation',
          reason: t.reason || `Autonomously generated from deliberation on "${topic}"`,
          body: t.body || `Follow up on research for "${topic}"`,
          progress: 0,
          estimated_calls: 5,
          deadline: new Date(Date.now() + 86400000).toISOString().split('T')[0]
        };
        
        persistTaskToDisk(taskNode, queueDir);
        logger.info({
          subsystem: 'fact-seeker',
          message: `Scheduled autonomous deliberation task: ${taskSlug} (${t.category})`
        });
      }
    }
    
    return {
      success: true,
      output: `Deliberated on "${topic}". Generated ${result.insights?.length || 0} insights, ${result.connections?.length || 0} connections, ${result.synthesized_instructions?.length || 0} instructions, ${result.autonomous_tasks?.length || 0} tasks.`,
      factSlug: nodeSlug
    };
  } catch (err) {
    return { success: false, error: `Deliberation failed: ${err.message}` };
  }
}

/**
 * Phase 3/5: Refinement & Clarity Auditing
 */
export async function runResearchImprovementCycle({ vaultDir, nodeSlug, topic, runtimeConfig }) {
  const nodes = getNodes(vaultDir);
  const targetNode = nodes.find(n => n.slug === nodeSlug);
  if (!targetNode) {
    return { success: false, error: `Target node not found for slug: ${nodeSlug}` };
  }
  
  const today = getLocalizedDateTime();
  const prompt = `Today's Date/Time: ${today}
Target Node Topic: "${topic}"
Title: ${targetNode.title}
Body:
${targetNode.body}

Rewrite the markdown body to improve structure, layout, typography, and premium clarity.

Rules:
- Keep the content extremely premium and professional.
- Use clean headings, lists, and tables where appropriate.
- STRICTLY PRESERVE all original citations, sources, URLs, and key facts. Do NOT hallucinate or delete any source references!
- Strictly output the raw markdown of the improved body without any wrapper or conversational text.`;

  const systemPrompt = `You are a Markdown Refinement & Clarity Auditor. Today's date and time is ${today}.
Your job is to restructure and polish markdown files for ultimate readability and premium layout.
Ensure proper hierarchy and typography while strictly retaining every single citation, key fact, and URL.
Output ONLY the raw markdown of the polished body, starting immediately with no introductory text or backtick wrappers.`;
  
  try {
    const raw = await callLocalRuntime(prompt, systemPrompt, runtimeConfig);
    
    let cleanedBody = raw.trim();
    if (cleanedBody.startsWith('```markdown')) {
      cleanedBody = cleanedBody.slice(11).trim();
    }
    if (cleanedBody.startsWith('```')) {
      cleanedBody = cleanedBody.slice(3).trim();
    }
    if (cleanedBody.endsWith('```')) {
      cleanedBody = cleanedBody.slice(0, -3).trim();
    }
    
    if (cleanedBody.length < 50) {
      throw new Error('Polished body is suspiciously short');
    }
    
    const updatedNode = {
      ...targetNode,
      body: cleanedBody,
      tags: [...new Set([...(targetNode.tags || []), 'improved'])],
      updated: new Date().toISOString()
    };
    
    writeNode(updatedNode, vaultDir);
    
    return {
      success: true,
      output: `Improved and refined document layout for "${topic}".`,
      factSlug: nodeSlug
    };
  } catch (err) {
    return { success: false, error: `Markdown improvement failed: ${err.message}` };
  }
}

/**
 * Phase 4/5: Source Monitoring
 */
export async function runResearchMonitoringCycle({
  vaultDir,
  nodeSlug,
  topic,
  runtimeConfig,
  skillsDir,
  derivedDir,
  instructionsFile
}) {
  const nodes = getNodes(vaultDir);
  const targetNode = nodes.find(n => n.slug === nodeSlug);
  if (!targetNode) {
    return { success: false, error: `Target node not found for slug: ${nodeSlug}` };
  }
  
  const researchConfig = loadResearchConfig();
  const searchQuery = `${topic} newsletters blogs release notes feeds updates`;
  
  let results = [];
  try {
    results = await webSearch(searchQuery, researchConfig, 5);
  } catch (err) {
    logger.info({ subsystem: 'fact-seeker', message: `Web search for monitoring failed: ${err.message}` });
  }
  
  if (results.length === 0) {
    return { success: true, output: `Monitoring skipped: no search results found for query: "${searchQuery}"`, factSlug: nodeSlug };
  }
  
  const sourceText = results.map(r => `Title: ${r.title}\nURL: ${r.url}\nSnippet: ${r.snippet}`).join('\n\n');
  
  const today = getLocalizedDateTime();
  const prompt = `Today's Date/Time: ${today}
Research Topic: "${topic}"
Search Results for ongoing updates/feeds/newsletters/releases:
${sourceText}

Extract 2-4 authoritative, high-quality ongoing sources (newsletters, RSS feeds, official release notes, blogs, communities) for this topic.`;

  const systemPrompt = `You are a Research Monitoring Specialist. Today's date and time is ${today}.
Your job is to identify high-quality ongoing sources of information (e.g. RSS feeds, newsletters, official release notes, specific blogs) from search results.

Output valid JSON:
{
  "sources": [
    {
      "name": "string (name of the newsletter, blog, or release feed)",
      "url": "string (direct URL)",
      "type": "string (newsletter / RSS feed / official blog / release notes / etc.)",
      "description": "string (why this is a reliable ongoing source)"
    }
  ]
}

Output ONLY valid JSON.`;
  
  try {
    const raw = await callLocalRuntime(prompt, systemPrompt, runtimeConfig);
    const match = raw.match(/\{[\s\S]*\}/);
    if (!match) throw new Error('No JSON in monitoring response');
    const parsed = cleanAndParseJSON(match[0]);
    const sources = parsed.sources || [];
    
    if (sources.length === 0) {
      return { success: true, output: `Monitoring complete: no ongoing sources extracted for "${topic}".`, factSlug: nodeSlug };
    }
    
    let updatedBody = targetNode.body;
    const linesToAdd = ['', '## Ongoing Monitoring & Sources'];
    sources.forEach(src => {
      linesToAdd.push(`- **[${src.name}](${src.url})** (${src.type}) — ${src.description}`);
    });
    
    updatedBody += '\n' + linesToAdd.join('\n');
    
    const updatedNode = {
      ...targetNode,
      body: updatedBody,
      tags: [...new Set([...(targetNode.tags || []), 'monitored'])],
      updated: new Date().toISOString()
    };
    
    writeNode(updatedNode, vaultDir);
    
    // Trigger immediate surface recompilation if active rules/sources were added
    if (skillsDir && derivedDir && instructionsFile) {
      try {
        const { compileSurface } = await import('./surface.mjs');
        await compileSurface({ vaultDir, skillsDir, derivedDir, instructionsFile });
        logger.info({
          subsystem: 'fact-seeker',
          message: `Surface compiled with newly monitored sources.`
        });
      } catch (err) {
        logger.info({
          subsystem: 'fact-seeker',
          message: `Surface compilation failed (non-fatal): ${err.message}`
        });
      }
    }
    
    return {
      success: true,
      output: `Monitoring complete: added ${sources.length} ongoing sources for "${topic}".`,
      factSlug: nodeSlug
    };
  } catch (err) {
    return { success: false, error: `Monitoring failed: ${err.message}` };
  }
}

/**
 * Phase 5/5: Domain Tangents Expansion
 */
export async function runResearchExpansionCycle({ vaultDir, nodeSlug, topic, runtimeConfig }) {
  const nodes = getNodes(vaultDir);
  const targetNode = nodes.find(n => n.slug === nodeSlug);
  if (!targetNode) {
    return { success: false, error: `Target node not found for slug: ${nodeSlug}` };
  }
  
  const today = getLocalizedDateTime();
  const prompt = `Today's Date/Time: ${today}
Target Node Topic: "${topic}"
Title: ${targetNode.title}
Body:
${targetNode.body}

Deliberate on what adjacent domain topics must be researched next to build complete expertise.
Brainstorm 2-3 highly specific, searchable research topics/questions.`;

  const systemPrompt = `You are a Research Expansion Specialist. Today's date and time is ${today}.
Your job is to brainstorm the next logical adjacent topics that must be researched to build comprehensive domain expertise on the target topic.

Output valid JSON:
{
  "tangents": [
    {
      "topic": "string (specific, searchable topic)",
      "priority": "low" | "medium" | "high",
      "rationale": "string (why this tangent is crucial next step)"
    }
  ]
}

Output ONLY valid JSON.`;
  
  try {
    const raw = await callLocalRuntime(prompt, systemPrompt, runtimeConfig);
    const match = raw.match(/\{[\s\S]*\}/);
    if (!match) throw new Error('No JSON in expansion response');
    const parsed = cleanAndParseJSON(match[0]);
    const tangents = parsed.tangents || [];
    
    if (tangents.length === 0) {
      return { success: true, output: `Expansion complete: no new tangents brainstormed for "${topic}".`, factSlug: nodeSlug };
    }
    
    const localBrainDir = getBrainDir();
    const queueDir = path.join(localBrainDir, 'scheduler', 'queue');
    const { persistTaskToDisk } = await import('./scheduler.mjs');
    
    const spawnedList = [];
    for (const tangent of tangents.slice(0, 3)) {
      try {
        const added = addToQueue({
          topic: tangent.topic,
          priority: tangent.priority || 'medium',
          notes: `Autonomously spawned from research on "${topic}". Rationale: ${tangent.rationale}`
        });
        spawnedList.push(added);
        
        // Also schedule a scheduler task to run proactive research for this topic
        const prio = tangent.priority === 'high' ? 65 : (tangent.priority === 'low' ? 45 : 55);
        const taskSlug = `proactive-research-${crypto.randomBytes(4).toString('hex')}`;
        const taskNode = {
          type: 'task',
          slug: taskSlug,
          priority: prio,
          category: 'proactive-research',
          status: 'pending',
          created_by: 'fact-seeker-expansion',
          reason: tangent.rationale || `Explore research tangent on: ${tangent.topic}`,
          body: `Autonomously spawned from research on "${topic}".\n\nTopic: ${tangent.topic}\n\nRationale:\n${tangent.rationale}`,
          progress: 0,
          estimated_calls: 5,
          deadline: new Date(Date.now() + 86400000).toISOString().split('T')[0]
        };
        
        persistTaskToDisk(taskNode, queueDir);
        logger.info({
          subsystem: 'fact-seeker',
          message: `Scheduled expansion task: ${taskSlug} for topic "${tangent.topic}"`
        });
      } catch (err) {
        logger.error({ subsystem: 'fact-seeker', message: `Failed to auto-spawn tangent "${tangent.topic}": ${err.message}` });
      }
    }
    
    let updatedBody = targetNode.body;
    const linesToAdd = ['', '## Spawned Research Expansion Avenues'];
    tangents.forEach(t => {
      linesToAdd.push(`- **${t.topic}** (${t.priority || 'medium'}) — ${t.rationale}`);
    });
    
    updatedBody += '\n' + linesToAdd.join('\n');
    
    const updatedNode = {
      ...targetNode,
      body: updatedBody,
      tags: [...new Set([...(targetNode.tags || []), 'expanded'])],
      updated: new Date().toISOString()
    };
    
    writeNode(updatedNode, vaultDir);
    
    return {
      success: true,
      output: `Autonomously spawned ${spawnedList.length} new research tangents: ${spawnedList.map(s => `"${s.topic}"`).join(', ')}.`,
      factSlug: nodeSlug
    };
  } catch (err) {
    return { success: false, error: `Tangent expansion failed: ${err.message}` };
  }
}
