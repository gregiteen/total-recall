import fs from 'fs';
import path from 'path';
import { atomicWrite } from './vault.mjs';
import { logger } from './logger.mjs';

/**
 * Provider usage/billing fetcher.
 *
 * `usage-tracker.mjs` estimates spend by multiplying locally-observed tokens by a
 * hardcoded price table. That drifts: it misses usage from outside this machine,
 * it cannot see cache-read discounts or tier changes, and the price table goes
 * stale silently. This module fetches what the providers themselves report.
 *
 * Verified against provider docs on 2026-08-01. Two facts the tracker item
 * ("fetch usage from provider APIs using stored keys") assumed away:
 *
 *   1. OpenAI and Anthropic cost endpoints require **admin/organization** keys
 *      (`sk-admin-…`, `sk-ant-admin-…`), NOT the ordinary inference keys already
 *      in the secrets store. A normal key returns 401/403. We detect this and
 *      report it as a distinct `needs_admin_key` state rather than an error.
 *   2. Google has **no** usage or cost endpoint on the Gemini / Generative
 *      Language API. Spend is only retrievable through Cloud Billing, which needs
 *      a GCP billing account and service-account credentials — a different auth
 *      system entirely. It is reported `unsupported`, not silently stubbed.
 */

const DEFAULT_TIMEOUT_MS = 15_000;

/** Milliseconds between live fetches. Anthropic asks for ≤1 poll/minute; daily spend does not move fast enough to justify more. */
export const MIN_FETCH_INTERVAL_MS = 60 * 60 * 1000;

async function getJson(url, headers, timeoutMs = DEFAULT_TIMEOUT_MS) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { headers, signal: controller.signal });
    const text = await res.text();
    let body = null;
    try { body = JSON.parse(text); } catch { /* provider returned non-JSON */ }
    return { ok: res.ok, status: res.status, body, text };
  } finally {
    clearTimeout(timer);
  }
}

function daysAgoSeconds(days) {
  return Math.floor((Date.now() - days * 86400_000) / 1000);
}

// ─── Providers ──────────────────────────────────────────────────────────────

/**
 * Each provider declares which secret names hold its credential, how to tell an
 * admin key from an inference key, and how to read its cost response.
 */
export const USAGE_PROVIDERS = {
  openai: {
    label: 'OpenAI',
    secrets: ['openai_admin_key', 'OPENAI_ADMIN_KEY', 'openai_api_key', 'OPENAI_API_KEY'],
    // Admin keys are a distinct credential class; the ordinary sk-proj-/sk- key
    // cannot read organization costs no matter how it is scoped.
    isAdminKey: (key) => key.startsWith('sk-admin-'),
    adminKeyHint: 'Create one at platform.openai.com/settings/organization/admin-keys and store it as `openai_admin_key`.',
    async fetch(key, { days }) {
      const url = `https://api.openai.com/v1/organization/costs?start_time=${daysAgoSeconds(days)}&limit=${Math.min(days, 180)}`;
      const res = await getJson(url, { Authorization: `Bearer ${key}` });
      if (!res.ok) return { ok: false, status: res.status, error: res.body?.error?.message || res.text?.slice(0, 200) };

      let total = 0;
      let currency = 'usd';
      for (const bucket of res.body?.data || []) {
        for (const r of bucket.results || []) {
          total += Number(r.amount?.value || 0);
          if (r.amount?.currency) currency = r.amount.currency;
        }
      }
      return { ok: true, total_cost: total, currency, buckets: (res.body?.data || []).length };
    },
  },

  anthropic: {
    label: 'Anthropic',
    secrets: ['anthropic_admin_key', 'ANTHROPIC_ADMIN_KEY', 'anthropic_api_key', 'ANTHROPIC_API_KEY'],
    isAdminKey: (key) => key.startsWith('sk-ant-admin'),
    adminKeyHint: 'Create an Admin API key in the Claude Console (Organization settings) and store it as `anthropic_admin_key`.',
    async fetch(key, { days }) {
      const startingAt = new Date(Date.now() - days * 86400_000).toISOString();
      const url = `https://api.anthropic.com/v1/organizations/cost_report?starting_at=${encodeURIComponent(startingAt)}`;
      const res = await getJson(url, {
        'x-api-key': key,
        'anthropic-version': '2023-06-01',
      });
      if (!res.ok) return { ok: false, status: res.status, error: res.body?.error?.message || res.text?.slice(0, 200) };

      let total = 0;
      let currency = 'USD';
      for (const bucket of res.body?.data || []) {
        for (const r of bucket.results || []) {
          total += Number(r.amount || 0);
          if (r.currency) currency = r.currency;
        }
      }
      return { ok: true, total_cost: total, currency, buckets: (res.body?.data || []).length };
    },
  },

  openrouter: {
    label: 'OpenRouter',
    secrets: ['openrouter_api_key', 'OPENROUTER_API_KEY'],
    // OpenRouter is the only one of the four whose spend is readable with the
    // ordinary inference key already in the store.
    isAdminKey: () => true,
    async fetch(key, _opts) {
      const res = await getJson('https://openrouter.ai/api/v1/credits', { Authorization: `Bearer ${key}` });
      if (!res.ok) return { ok: false, status: res.status, error: res.body?.error?.message || res.text?.slice(0, 200) };
      const d = res.body?.data || {};
      const used = Number(d.total_usage || 0);
      return {
        ok: true,
        total_cost: used,
        currency: 'USD',
        // Lifetime, not windowed — OpenRouter's credits endpoint has no date range.
        lifetime: true,
        balance: Number(d.total_credits || 0) - used,
      };
    },
  },

  google: {
    label: 'Google (Gemini)',
    secrets: ['google_api_key', 'GOOGLE_API_KEY', 'gemini_api_key', 'GEMINI_API_KEY'],
    unsupported: 'The Gemini / Generative Language API exposes no usage or cost endpoint. '
      + 'Spend is only available via Cloud Billing (GCP billing account + service-account credentials), '
      + 'which this API key cannot authenticate against.',
  },
};

// ─── Fetch ──────────────────────────────────────────────────────────────────

/**
 * Resolve a provider's credential from the secrets store, trying admin-key names
 * before inference-key names.
 */
async function resolveKey(brainDir, names) {
  const { getSecret } = await import('./secrets-store.mjs');
  for (const name of names) {
    try {
      const result = await getSecret(brainDir, name, { action: 'usage-fetch', actor: 'usage-fetcher' });
      if (result?.found && result.value) return { key: result.value, name };
    } catch { /* store locked or key absent — try the next name */ }
  }
  return null;
}

/**
 * Fetch reported spend from every provider we can.
 *
 * Never throws and never lets one provider's failure hide another's result: each
 * entry carries its own state so a partial answer is still a usable answer.
 *
 * @returns {Promise<{fetched_at: string, window_days: number, providers: object}>}
 */
export async function fetchAllProviderUsage(brainDir, { days = 30, only = null } = {}) {
  const providers = {};

  for (const [id, provider] of Object.entries(USAGE_PROVIDERS)) {
    if (only && !only.includes(id)) continue;

    if (provider.unsupported) {
      providers[id] = { label: provider.label, state: 'unsupported', reason: provider.unsupported };
      continue;
    }

    const resolved = await resolveKey(brainDir, provider.secrets);
    if (!resolved) {
      providers[id] = { label: provider.label, state: 'no_key', reason: `No secret found under: ${provider.secrets.join(', ')}` };
      continue;
    }

    if (!provider.isAdminKey(resolved.key)) {
      // Distinct from an error: the integration works, the credential class is
      // wrong. Calling anyway would just produce a confusing 401 every cycle.
      providers[id] = {
        label: provider.label,
        state: 'needs_admin_key',
        secret_name: resolved.name,
        reason: `\`${resolved.name}\` is an inference key; cost endpoints require an admin key. ${provider.adminKeyHint}`,
      };
      continue;
    }

    try {
      const result = await provider.fetch(resolved.key, { days });
      providers[id] = result.ok
        ? { label: provider.label, state: 'ok', secret_name: resolved.name, ...result, ok: undefined }
        : { label: provider.label, state: 'error', secret_name: resolved.name, status: result.status, reason: result.error };
    } catch (err) {
      const reason = err.name === 'AbortError' ? `Timed out after ${DEFAULT_TIMEOUT_MS}ms` : err.message;
      providers[id] = { label: provider.label, state: 'error', secret_name: resolved.name, reason };
    }
  }

  return { fetched_at: new Date().toISOString(), window_days: days, providers };
}

// ─── Cache ──────────────────────────────────────────────────────────────────

export function usageCachePath(brainDir) {
  return path.join(brainDir, 'usage', 'provider-usage.json');
}

export function readCachedUsage(brainDir) {
  const file = usageCachePath(brainDir);
  if (!fs.existsSync(file)) return null;
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (err) {
    logger.warn('usage-fetcher', `Unreadable usage cache: ${err.message}`, { file });
    return null;
  }
}

function writeCachedUsage(brainDir, payload) {
  const file = usageCachePath(brainDir);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  atomicWrite(file, JSON.stringify(payload, null, 2));
}

/**
 * Daemon entry point. Refreshes at most once per {@link MIN_FETCH_INTERVAL_MS}
 * and returns the cache otherwise, so hooking this into a fast daemon cycle
 * cannot turn into a request storm against provider billing APIs.
 *
 * @param {string} brainDir
 * @param {object} [opts]
 * @param {boolean} [opts.force] ignore the interval
 * @returns {Promise<object>} the usage payload (fresh or cached)
 */
export async function refreshProviderUsage(brainDir, { force = false, days = 30 } = {}) {
  const cached = readCachedUsage(brainDir);
  if (!force && cached?.fetched_at) {
    const age = Date.now() - new Date(cached.fetched_at).getTime();
    if (age < MIN_FETCH_INTERVAL_MS) return { ...cached, from_cache: true };
  }

  const payload = await fetchAllProviderUsage(brainDir, { days });

  // Keep a stale-but-real cache rather than overwriting it with a page of
  // failures — a transient network outage should not erase yesterday's numbers.
  const anySuccess = Object.values(payload.providers).some(p => p.state === 'ok');
  if (!anySuccess && cached) {
    logger.warn('usage-fetcher', 'No provider returned usage; keeping previous cache.');
    return { ...cached, from_cache: true, last_attempt_at: payload.fetched_at };
  }

  writeCachedUsage(brainDir, payload);
  return payload;
}
