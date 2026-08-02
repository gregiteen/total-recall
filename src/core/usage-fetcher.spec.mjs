import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

vi.mock('./logger.mjs', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

const getSecret = vi.fn();
vi.mock('./secrets-store.mjs', () => ({ getSecret: (...a) => getSecret(...a) }));

import fs from 'fs';
import os from 'os';
import path from 'path';
import {
  USAGE_PROVIDERS,
  fetchAllProviderUsage,
  refreshProviderUsage,
  readCachedUsage,
  usageCachePath,
  MIN_FETCH_INTERVAL_MS,
} from './usage-fetcher.mjs';

let brainDir;
const realFetch = global.fetch;

/** Route each provider host to a canned response. */
function mockFetch(routes) {
  global.fetch = vi.fn(async (url) => {
    for (const [fragment, reply] of Object.entries(routes)) {
      if (String(url).includes(fragment)) {
        return {
          ok: reply.status ? reply.status < 400 : true,
          status: reply.status || 200,
          text: async () => JSON.stringify(reply.body ?? {}),
        };
      }
    }
    throw new Error(`unrouted fetch: ${url}`);
  });
}

/** Secrets store that returns `map[name]` and reports not-found otherwise. */
function withSecrets(map) {
  getSecret.mockImplementation(async (_dir, key) => (
    key in map ? { found: true, key, value: map[key] } : { found: false, key }
  ));
}

beforeEach(() => {
  brainDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tr-usage-'));
  getSecret.mockReset();
});

afterEach(() => {
  global.fetch = realFetch;
});

describe('provider registry', () => {
  it('marks Google unsupported instead of pretending a usage endpoint exists', async () => {
    // Verified 2026-08-01: the Gemini / Generative Language API has no usage or
    // cost endpoint. Spend requires Cloud Billing + service-account credentials.
    expect(USAGE_PROVIDERS.google.unsupported).toMatch(/no usage or cost endpoint/i);
    withSecrets({ google_api_key: 'AIza-whatever' });
    const { providers } = await fetchAllProviderUsage(brainDir, { only: ['google'] });
    expect(providers.google.state).toBe('unsupported');
  });

  it('recognises admin keys only by their real prefixes', () => {
    expect(USAGE_PROVIDERS.openai.isAdminKey('sk-admin-abc')).toBe(true);
    expect(USAGE_PROVIDERS.openai.isAdminKey('sk-proj-abc')).toBe(false);
    expect(USAGE_PROVIDERS.anthropic.isAdminKey('sk-ant-admin01-abc')).toBe(true);
    expect(USAGE_PROVIDERS.anthropic.isAdminKey('sk-ant-api03-abc')).toBe(false);
  });
});

describe('credential states', () => {
  it('reports no_key when nothing is stored', async () => {
    withSecrets({});
    const { providers } = await fetchAllProviderUsage(brainDir, { only: ['openai'] });
    expect(providers.openai.state).toBe('no_key');
  });

  it('distinguishes an inference key from a missing key', async () => {
    // An ordinary sk-proj- key would 401 on the cost endpoint every cycle. Saying
    // "wrong key class" is actionable; "error 401" is not.
    withSecrets({ openai_api_key: 'sk-proj-inference' });
    const { providers } = await fetchAllProviderUsage(brainDir, { only: ['openai'] });
    expect(providers.openai.state).toBe('needs_admin_key');
    expect(providers.openai.reason).toMatch(/admin key/i);
  });

  it('does not call the network when the key class is wrong', async () => {
    withSecrets({ anthropic_api_key: 'sk-ant-api03-inference' });
    global.fetch = vi.fn();
    await fetchAllProviderUsage(brainDir, { only: ['anthropic'] });
    expect(global.fetch).not.toHaveBeenCalled();
  });
});

describe('cost parsing', () => {
  it('sums OpenAI cost buckets', async () => {
    withSecrets({ openai_admin_key: 'sk-admin-real' });
    mockFetch({
      'api.openai.com': {
        body: {
          data: [
            { results: [{ amount: { value: 1.5, currency: 'usd' } }] },
            { results: [{ amount: { value: 2.25, currency: 'usd' } }] },
          ],
        },
      },
    });
    const { providers } = await fetchAllProviderUsage(brainDir, { only: ['openai'] });
    expect(providers.openai.state).toBe('ok');
    expect(providers.openai.total_cost).toBeCloseTo(3.75);
  });

  it('sums Anthropic cost buckets', async () => {
    withSecrets({ anthropic_admin_key: 'sk-ant-admin01-real' });
    mockFetch({
      'api.anthropic.com': { body: { data: [{ results: [{ amount: 4, currency: 'USD' }, { amount: 1, currency: 'USD' }] }] } },
    });
    const { providers } = await fetchAllProviderUsage(brainDir, { only: ['anthropic'] });
    expect(providers.anthropic.total_cost).toBeCloseTo(5);
  });

  it('reads OpenRouter credits with an ordinary key and reports the balance', async () => {
    withSecrets({ openrouter_api_key: 'sk-or-v1-abc' });
    mockFetch({ 'openrouter.ai': { body: { data: { total_credits: 20, total_usage: 7.5 } } } });
    const { providers } = await fetchAllProviderUsage(brainDir, { only: ['openrouter'] });
    expect(providers.openrouter.state).toBe('ok');
    expect(providers.openrouter.total_cost).toBeCloseTo(7.5);
    expect(providers.openrouter.balance).toBeCloseTo(12.5);
    // Flagged because this figure is lifetime, not the requested window.
    expect(providers.openrouter.lifetime).toBe(true);
  });

  it('surfaces an HTTP failure as an error state rather than a zero cost', async () => {
    // A silent 0 would read as "you spent nothing" — the worst possible failure
    // mode for a billing display.
    withSecrets({ openai_admin_key: 'sk-admin-real' });
    mockFetch({ 'api.openai.com': { status: 403, body: { error: { message: 'forbidden' } } } });
    const { providers } = await fetchAllProviderUsage(brainDir, { only: ['openai'] });
    expect(providers.openai.state).toBe('error');
    expect(providers.openai.total_cost).toBeUndefined();
  });

  it('isolates one provider failure from another', async () => {
    withSecrets({ openai_admin_key: 'sk-admin-real', openrouter_api_key: 'sk-or-v1-abc' });
    mockFetch({
      'api.openai.com': { status: 500, body: {} },
      'openrouter.ai': { body: { data: { total_credits: 5, total_usage: 1 } } },
    });
    const { providers } = await fetchAllProviderUsage(brainDir, { only: ['openai', 'openrouter'] });
    expect(providers.openai.state).toBe('error');
    expect(providers.openrouter.state).toBe('ok');
  });
});

describe('cache and throttling', () => {
  it('serves the cache inside the refresh interval instead of re-fetching', async () => {
    withSecrets({ openrouter_api_key: 'sk-or-v1-abc' });
    mockFetch({ 'openrouter.ai': { body: { data: { total_credits: 5, total_usage: 1 } } } });

    await refreshProviderUsage(brainDir);
    const callsAfterFirst = global.fetch.mock.calls.length;
    const second = await refreshProviderUsage(brainDir);

    expect(second.from_cache).toBe(true);
    expect(global.fetch.mock.calls.length).toBe(callsAfterFirst);
    expect(MIN_FETCH_INTERVAL_MS).toBeGreaterThanOrEqual(60_000);
  });

  it('re-fetches when forced', async () => {
    withSecrets({ openrouter_api_key: 'sk-or-v1-abc' });
    mockFetch({ 'openrouter.ai': { body: { data: { total_credits: 5, total_usage: 1 } } } });
    await refreshProviderUsage(brainDir);
    const before = global.fetch.mock.calls.length;
    await refreshProviderUsage(brainDir, { force: true });
    expect(global.fetch.mock.calls.length).toBeGreaterThan(before);
  });

  it('keeps a stale cache rather than overwriting it with a page of failures', async () => {
    withSecrets({ openrouter_api_key: 'sk-or-v1-abc' });
    mockFetch({ 'openrouter.ai': { body: { data: { total_credits: 5, total_usage: 3 } } } });
    await refreshProviderUsage(brainDir);

    // Now everything fails. Yesterday's real numbers must survive.
    mockFetch({ 'openrouter.ai': { status: 500, body: {} } });
    const result = await refreshProviderUsage(brainDir, { force: true });
    expect(result.from_cache).toBe(true);
    expect(result.providers.openrouter.total_cost).toBeCloseTo(3);
    expect(readCachedUsage(brainDir).providers.openrouter.total_cost).toBeCloseTo(3);
  });

  it('writes the cache where readCachedUsage looks for it', async () => {
    withSecrets({ openrouter_api_key: 'sk-or-v1-abc' });
    mockFetch({ 'openrouter.ai': { body: { data: { total_credits: 1, total_usage: 0 } } } });
    await refreshProviderUsage(brainDir);
    expect(fs.existsSync(usageCachePath(brainDir))).toBe(true);
  });

  it('returns null for a missing cache rather than throwing', () => {
    expect(readCachedUsage(brainDir)).toBeNull();
  });
});
