/**
 * AI-only secret → integration research.
 *
 * When a new secret is stored, a CLI agent (callLocalRuntime) decides:
 *   - whether this credential is worth product-API research
 *   - which product/provider it is
 *   - what research topic + notes to enqueue
 *
 * No hardcoded provider lists, no key-name regex classification, no catalog matching.
 * Optional code-usage snippets are gathered as *evidence for the model*, not as rules.
 */

import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { logger } from './logger.mjs';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

const INFER_SYSTEM = `You are a senior integrations engineer for Total Recall (a personal memory / mesh OS).
You are given only:
  (1) an environment/secret KEY NAME (never the secret value)
  (2) optional code snippets where that key is referenced in THIS repo

Decide whether Total Recall should queue a *research* job to learn an *external third-party* product API that is NOT already part of this product.

Output ONLY valid JSON (no markdown fences):
{
  "researchable": boolean,
  "skip_reason": string|null,
  "product_name": string|null,
  "product_slug": string|null,
  "kind": "api_key"|"password"|"oauth"|"webhook"|"internal"|"self_hosted"|"already_integrated"|"unknown",
  "topic": string|null,
  "notes": string|null,
  "priority": "low"|"medium"|"high",
  "confidence": number
}

Rules (strict):
- researchable=true ONLY for external SaaS/third-party APIs the product might need to learn about from the public internet.
- researchable=false when code shows the key is for:
  - infrastructure we already own/run (mesh, Tailscale-compatible control planes, Headscale, local routers, self-hosted mail, etc.)
  - features already implemented in this repo (routes, clients, adapters present)
  - passwords, email logins, SSO/client secrets, webhook signing secrets, private keys, session/DB secrets
  - Total Recall / TR_ / mesh-sync internal credentials
- If the key is used by existing modules (e.g. headscale routes, mesh auth, mail), set researchable=false with kind "already_integrated" or "self_hosted".
- Never queue research whose topic is the env var name itself.
- topic (when researchable) must name the external product and API surface; notes must say use official docs, not the raw key string.
- Prefer skip when uncertain. Do not invent product paths.`;

/**
 * Collect a small amount of code-usage context for the AI (not classification rules).
 * @param {string} key
 * @param {{ roots?: string[], maxHits?: number }} [opts]
 * @returns {string}
 */
export function gatherCodeUsageContext(key, opts = {}) {
  const roots = opts.roots || [path.join(REPO_ROOT, 'src')];
  const maxHits = opts.maxHits ?? 12;
  const snippets = [];

  // Prefer ripgrep if available; fall back to a tiny walk.
  const rg = spawnSync(
    'rg',
    [
      '-n',
      '--no-heading',
      '-m',
      '8',
      '-g',
      '!**/node_modules/**',
      '-g',
      '!**/*.spec.*',
      '-e',
      key,
      ...roots.filter((r) => fs.existsSync(r)),
    ],
    { encoding: 'utf8', timeout: 8000, maxBuffer: 512_000 },
  );

  if (rg.status === 0 && rg.stdout) {
    for (const line of rg.stdout.split('\n').filter(Boolean).slice(0, maxHits)) {
      snippets.push(line.slice(0, 400));
    }
  } else {
    // Minimal fallback walk
    for (const root of roots) {
      if (!fs.existsSync(root)) continue;
      walkForKey(root, key, snippets, maxHits, 0);
      if (snippets.length >= maxHits) break;
    }
  }

  if (!snippets.length) {
    return '(no code references found in local src tree)';
  }
  return snippets.join('\n');
}

function walkForKey(dir, key, out, maxHits, depth) {
  if (out.length >= maxHits || depth > 6) return;
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const ent of entries) {
    if (out.length >= maxHits) return;
    if (ent.name === 'node_modules' || ent.name === '.git' || ent.name.startsWith('.')) continue;
    const full = path.join(dir, ent.name);
    if (ent.isDirectory()) {
      walkForKey(full, key, out, maxHits, depth + 1);
      continue;
    }
    if (!/\.(mjs|js|ts|tsx|yml|yaml|json|md)$/i.test(ent.name)) continue;
    if (/\.spec\./i.test(ent.name)) continue;
    let text;
    try {
      text = fs.readFileSync(full, 'utf8');
    } catch {
      continue;
    }
    if (!text.includes(key)) continue;
    const lines = text.split('\n');
    for (let i = 0; i < lines.length && out.length < maxHits; i++) {
      if (lines[i].includes(key)) {
        const from = Math.max(0, i - 1);
        const to = Math.min(lines.length, i + 2);
        const chunk = lines
          .slice(from, to)
          .map((l, idx) => `${full}:${from + idx + 1}:${l.trim().slice(0, 200)}`)
          .join('\n');
        out.push(chunk);
      }
    }
  }
}

/**
 * Parse first JSON object from model output.
 * @param {string} raw
 */
export function parseAiJson(raw) {
  const text = String(raw || '');
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  try {
    return JSON.parse(text.slice(start, end + 1));
  } catch {
    return null;
  }
}

/**
 * Ask a CLI agent to infer provider / research brief from key name + code usage.
 *
 * @param {string} key
 * @param {{
 *   meta?: object,
 *   codeContext?: string,
 *   runtimeConfig?: object,
 *   callRuntime?: Function,
 * }} [opts]
 * @returns {Promise<{
 *   researchable: boolean,
 *   skip_reason: string|null,
 *   product_name: string|null,
 *   product_slug: string|null,
 *   kind: string,
 *   topic: string|null,
 *   notes: string|null,
 *   priority: string,
 *   confidence: number,
 *   source: 'ai',
 * }>}
 */
export async function inferSecretIntegrationWithAi(key, opts = {}) {
  const codeContext =
    opts.codeContext !== undefined
      ? opts.codeContext
      : gatherCodeUsageContext(key, { roots: opts.roots });

  const prompt = [
    `Secret key name: ${key}`,
    opts.meta?.provider ? `Stored provider tag (may be wrong/empty): ${opts.meta.provider}` : null,
    opts.meta?.label ? `Label: ${opts.meta.label}` : null,
    opts.meta?.notes ? `User notes: ${String(opts.meta.notes).slice(0, 500)}` : null,
    '',
    'Code references (evidence only — reason about them):',
    codeContext,
    '',
    'Return the JSON decision now.',
  ]
    .filter((l) => l !== null)
    .join('\n');

  const callRuntime =
    opts.callRuntime ||
    (async (user, system, cfg) => {
      const { callLocalRuntime, loadRuntimeConfig } = await import('./runtime.mjs');
      return callLocalRuntime(user, system, cfg || opts.runtimeConfig || loadRuntimeConfig());
    });

  let raw;
  try {
    raw = await callRuntime(prompt, INFER_SYSTEM, opts.runtimeConfig);
  } catch (err) {
    logger.warn('secrets', 'AI secret integration inference failed', {
      key,
      error: err.message,
    });
    return {
      researchable: false,
      skip_reason: `AI inference unavailable: ${err.message}`,
      product_name: null,
      product_slug: null,
      kind: 'unknown',
      topic: null,
      notes: null,
      priority: 'low',
      confidence: 0,
      source: 'ai',
    };
  }

  const parsed = parseAiJson(raw);
  if (!parsed || typeof parsed !== 'object') {
    return {
      researchable: false,
      skip_reason: 'AI returned non-JSON inference',
      product_name: null,
      product_slug: null,
      kind: 'unknown',
      topic: null,
      notes: null,
      priority: 'low',
      confidence: 0,
      source: 'ai',
    };
  }

  const researchable = parsed.researchable === true;
  return {
    researchable,
    skip_reason: researchable ? null : String(parsed.skip_reason || 'AI declined research'),
    product_name: parsed.product_name ? String(parsed.product_name) : null,
    product_slug: parsed.product_slug ? String(parsed.product_slug) : null,
    kind: String(parsed.kind || 'unknown'),
    topic: researchable && parsed.topic ? String(parsed.topic) : null,
    notes: researchable && parsed.notes ? String(parsed.notes) : null,
    priority: ['low', 'medium', 'high'].includes(parsed.priority) ? parsed.priority : 'low',
    confidence: Number.isFinite(Number(parsed.confidence)) ? Number(parsed.confidence) : 0,
    source: 'ai',
  };
}

/**
 * Build brief via AI only.
 * @returns {Promise<{ topic: string, notes: string, priority: string, inference: object } | null>}
 */
export async function buildIntegrationResearchBrief(key, meta = {}, opts = {}) {
  const inference = await inferSecretIntegrationWithAi(key, { meta, ...opts });
  if (!inference.researchable || !inference.topic) {
    return null;
  }
  return {
    topic: inference.topic,
    notes: inference.notes || `AI-inferred product research for secret \`${key}\`.`,
    priority: inference.priority || 'low',
    inference,
  };
}

/**
 * Enqueue integration research when the AI says so.
 * @returns {Promise<{ enqueued: boolean, item?: object, skipped?: string, inference?: object }>}
 */
export async function maybeEnqueueIntegrationResearch(brainDir, key, meta = {}, opts = {}) {
  const inference = await inferSecretIntegrationWithAi(key, { meta, ...opts });
  if (!inference.researchable || !inference.topic) {
    return {
      enqueued: false,
      skipped: inference.skip_reason || 'AI declined research',
      inference,
    };
  }

  const { addToQueue } = await import('./research-queue.mjs');
  const item = addToQueue({
    topic: inference.topic,
    priority: inference.priority || 'low',
    notes: inference.notes || `AI-inferred product research for secret \`${key}\`.`,
    brainDir,
  });
  return { enqueued: true, item, inference };
}

/**
 * Retire obsolete key-name scrape queue items (old Automated API Integration Build: KEY topics).
 */
export function cancelBogusApiIntegrationQueueItems(overrideBrainDir) {
  return import('./research-queue.mjs').then(({ loadQueue, updateQueueItem }) => {
    const items = loadQueue(overrideBrainDir);
    let cancelled = 0;
    for (const item of items) {
      if (item.status !== 'pending' && item.status !== 'in_progress') continue;
      if (!/^Automated API Integration Build:/i.test(String(item.topic || ''))) continue;
      updateQueueItem(
        item.id,
        {
          status: 'failed',
          notes: `${item.notes || ''}\n\n[auto-cancelled] Obsolete key-name scrape job; re-add the secret to trigger AI provider inference.`,
          research_phase: 'cancelled',
        },
        overrideBrainDir,
      );
      cancelled += 1;
    }
    return { cancelled };
  });
}
