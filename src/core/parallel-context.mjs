/**
 * src/core/parallel-context.mjs
 *
 * Parallel Flash Context Streaming Engine
 *
 * 1 node = 1 stream. Massive GPU-style parallelism.
 * Every node in the vault gets its own concurrent micro-Flash call.
 * Each call is tiny (~100 tokens in, ~30 tokens out).
 * Results stream back as they complete.
 *
 * Cost: 1000 nodes × ~150 tokens = 150K tokens = $0.04
 * Speed: All calls fire simultaneously, bounded only by API rate limits.
 *
 * Architecture:
 *   1. SHATTER — every node becomes its own stream
 *   2. FLOOD — fire all streams concurrently (rate-limited)
 *   3. COLLECT — results arrive as futures resolve
 *   4. RANK — sort by score, pack into budget
 *   5. DELIVER — compressed context ready for inference
 */

import { getNodes } from './vault-cache.mjs';
import { googleApiKey } from './config.mjs';
import { logger } from './logger.mjs';
import { inferMemoryLayer } from './memory-layers.mjs';
import { throttledFetch } from './throttled-fetch.mjs';

// ─── Configuration ──────────────────────────────────────────────────────────

const FLASH_MODEL = 'gemini-3.1-flash-lite';
const FLASH_API_URL = 'https://generativelanguage.googleapis.com/v1beta/models';
const MAX_CONCURRENCY = 4;        // concurrent HTTP connections — keep low, a burst this size can overwhelm router conntrack/Wi-Fi
const FLASH_TIMEOUT_MS = 6000;    // per-call timeout
const DEFAULT_BUDGET_TOKENS = 8000;
const CHARS_PER_TOKEN = 4;

// ─── Flash Micro-Call ───────────────────────────────────────────────────────

/**
 * Single micro-call to Flash. Score ONE node against the query.
 * Prompt is minimal — ~100 tokens in, ~30 tokens out.
 */
async function scoreOne(query, node, apiKey) {
  const body = (node.body || node.content || '').slice(0, 400);
  const prompt = `Score relevance 0-100 and extract the key bit.
Q: "${query}"
NODE [${node.slug}] ${node.category} imp:${node.importance || 3}: ${node.title || ''} — ${body}
Reply EXACTLY: SCORE|KEY_BIT (one line, no explanation)`;

  const url = `${FLASH_API_URL}/${FLASH_MODEL}:generateContent?key=${apiKey}`;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FLASH_TIMEOUT_MS);

  try {
    const response = await throttledFetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: controller.signal,
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { maxOutputTokens: 128, temperature: 0.0 },
      }),
    });

    if (!response.ok) {
      // Rate limited — return fallback score
      if (response.status === 429) {
        return { slug: node.slug, score: node.priority === 'absolute' ? 90 : 25, compressed: body.slice(0, 150), rateLimited: true };
      }
      throw new Error(`${response.status}`);
    }

    const data = await response.json();
    const text = (data.candidates?.[0]?.content?.parts?.[0]?.text || '').trim();

    // Parse "SCORE|KEY_BIT"
    const pipeIdx = text.indexOf('|');
    if (pipeIdx > 0) {
      const score = parseInt(text.slice(0, pipeIdx).trim(), 10);
      const compressed = text.slice(pipeIdx + 1).trim();
      if (!isNaN(score)) {
        return {
          slug: node.slug,
          score: Math.min(Math.max(score, 0), 100),
          compressed: compressed.slice(0, 300),
          title: node.title,
          category: node.category,
          layer: inferMemoryLayer(node),
        };
      }
    }

    // Parsing failed — fallback
    return { slug: node.slug, score: 30, compressed: body.slice(0, 150), title: node.title, category: node.category, parseFail: true };
  } catch (err) {
    // Timeout or network error — fallback
    return {
      slug: node.slug,
      score: node.priority === 'absolute' ? 90 : 20,
      compressed: body.slice(0, 150),
      title: node.title,
      category: node.category,
      error: err.name === 'AbortError' ? 'timeout' : err.message,
    };
  } finally {
    clearTimeout(timeout);
  }
}

// ─── Flood Dispatcher ───────────────────────────────────────────────────────

/**
 * Fire all streams concurrently with bounded concurrency.
 * Uses a semaphore pattern — N workers pulling from a shared queue.
 */
async function flood(items, fn, concurrency) {
  const results = new Array(items.length);
  let cursor = 0;
  let completed = 0;

  async function worker() {
    while (cursor < items.length) {
      const i = cursor++;
      results[i] = await fn(items[i], i);
      completed++;
    }
  }

  const workers = Array.from(
    { length: Math.min(concurrency, items.length) },
    () => worker()
  );
  await Promise.all(workers);
  return results;
}

// ─── Main Entry Point ───────────────────────────────────────────────────────

/**
 * Stream context from the entire vault — 1 node = 1 stream.
 *
 * @param {object} opts
 * @param {string} opts.query - Query to score against
 * @param {string} opts.vaultDir - Vault directory
 * @param {number} [opts.budgetTokens=8000] - Token budget
 * @param {number} [opts.concurrency=50] - Max concurrent streams
 * @param {number} [opts.minScore=20] - Minimum score to include
 * @returns {Promise<{ context: string, stats: object, scored: array }>}
 */
export async function streamParallelContext({
  query,
  vaultDir,
  budgetTokens = DEFAULT_BUDGET_TOKENS,
  concurrency = MAX_CONCURRENCY,
  minScore = 20,
} = {}) {
  const startTime = Date.now();
  const allNodes = getNodes(vaultDir).filter(n => n.status === 'active');
  const totalNodes = allNodes.length;

  if (!query || totalNodes === 0) {
    return {
      context: '',
      stats: { total_nodes: totalNodes, streams: 0, compile_ms: 0 },
      scored: [],
    };
  }

  const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || googleApiKey;
  if (!apiKey) throw new Error('No Gemini API key available for Flash streaming');

  // ── Tier 0: Invariants (instant, no LLM) ──
  const invariants = allNodes.filter(n => n.priority === 'absolute');
  const tier0 = invariants.map(n => ({
    slug: n.slug,
    score: 100,
    compressed: (n.body || n.content || '').slice(0, 500),
    title: n.title,
    category: n.category,
    layer: 'conscious',
    tier: 0,
  }));

  // ── Tier 1: FLOOD — every non-invariant node gets its own stream ──
  const scorable = allNodes.filter(n => n.priority !== 'absolute');
  const effectiveConcurrency = Math.min(concurrency, scorable.length);

  logger.info('parallel-context', `FLOOD: ${scorable.length} streams × ${effectiveConcurrency} concurrent (${totalNodes} total, ${invariants.length} invariants pre-loaded)`);

  const tier1 = await flood(
    scorable,
    (node) => scoreOne(query, node, apiKey),
    effectiveConcurrency,
  );

  const floodMs = Date.now() - startTime;

  // ── MERGE: combine tiers, rank by score ──
  const allScored = [...tier0, ...tier1].sort((a, b) => b.score - a.score);
  const filtered = allScored.filter(r => r.score >= minScore);

  // ── PACK: assemble into token budget ──
  let tokenCount = 0;
  const included = [];

  for (const item of filtered) {
    const text = `- **${item.title || item.slug}** [${item.category}]: ${item.compressed}`;
    const tokens = Math.ceil(text.length / CHARS_PER_TOKEN);
    if (tokenCount + tokens > budgetTokens) break;
    included.push({ ...item, text, tokens });
    tokenCount += tokens;
  }

  // ── Format by category ──
  const sections = new Map();
  for (const item of included) {
    const section = item.category || 'general';
    if (!sections.has(section)) sections.set(section, []);
    sections.get(section).push(item);
  }

  let context = '';
  for (const [section, items] of sections) {
    const label = section.charAt(0).toUpperCase() + section.slice(1);
    context += `## ${label}\n\n`;
    for (const item of items) {
      context += `${item.text}\n`;
    }
    context += '\n';
  }

  const totalMs = Date.now() - startTime;
  const rateLimited = allScored.filter(r => r.rateLimited).length;
  const errors = allScored.filter(r => r.error).length;
  const parseFails = allScored.filter(r => r.parseFail).length;

  const stats = {
    total_nodes: totalNodes,
    streams: scorable.length,
    invariants_preloaded: invariants.length,
    concurrency: effectiveConcurrency,
    flood_ms: floodMs,
    compile_ms: totalMs,
    scored: allScored.length,
    above_threshold: filtered.length,
    included: included.length,
    tokens_used: tokenCount,
    tokens_budget: budgetTokens,
    rate_limited: rateLimited,
    errors,
    parse_fails: parseFails,
    avg_score: included.length > 0 ? Math.round(included.reduce((s, i) => s + i.score, 0) / included.length) : 0,
    throughput_nodes_per_sec: Math.round((scorable.length / (floodMs / 1000)) * 10) / 10,
  };

  logger.info('parallel-context', `DELIVERED: ${included.length} nodes (${tokenCount} tok) from ${totalNodes} total in ${totalMs}ms | ${stats.throughput_nodes_per_sec} nodes/s | ${rateLimited} rate-limited | ${errors} errors`);

  return { context: context.trim(), stats, scored: allScored };
}

/**
 * Quick health check — verify Flash API connectivity.
 */
export async function checkFlashHealth() {
  const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || googleApiKey;
  if (!apiKey) return { status: 'unhealthy', error: 'No API key' };

  const url = `${FLASH_API_URL}/${FLASH_MODEL}:generateContent?key=${apiKey}`;

  try {
    const start = Date.now();
    const response = await throttledFetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: 'Reply with exactly: OK' }] }],
        generationConfig: { maxOutputTokens: 8, temperature: 0 },
      }),
    });

    if (!response.ok) throw new Error(`API ${response.status}`);
    const data = await response.json();
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
    return { status: 'healthy', response: text.trim().slice(0, 20), latency_ms: Date.now() - start, model: FLASH_MODEL };
  } catch (err) {
    return { status: 'unhealthy', error: err.message, model: FLASH_MODEL };
  }
}
