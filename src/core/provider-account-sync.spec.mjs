import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('./logger.mjs', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { setSecret, listSecretsMeta } from './secrets-store.mjs';

vi.mock('./throttled-fetch.mjs', () => ({
  throttledFetch: vi.fn(),
}));

import { throttledFetch } from './throttled-fetch.mjs';
import {
  resolveProbeName,
  syncSecretAccount,
  getTrackingHealth,
  syncAllSecretAccounts,
} from './provider-account-sync.mjs';

function jsonResponse(status, body) {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => JSON.stringify(body),
  };
}

describe('provider-account-sync', () => {
  let brain;

  beforeEach(() => {
    brain = fs.mkdtempSync(path.join(os.tmpdir(), 'tr-pas-'));
    fs.mkdirSync(path.join(brain, 'config'), { recursive: true });
    vi.mocked(throttledFetch).mockReset();
  });

  afterEach(() => {
    fs.rmSync(brain, { recursive: true, force: true });
  });

  it('resolveProbeName maps known keys and value prefixes', () => {
    expect(resolveProbeName('OPENROUTER_API_KEY', {}, 'sk-or-v1-x')).toBe('openrouter');
    expect(resolveProbeName('GITHUB_TOKEN', {}, 'ghp_xxx')).toBe('github');
    expect(resolveProbeName('ELEVENLABS_API_KEY', {}, 'el_x')).toBe('elevenlabs');
    expect(resolveProbeName('ANTHROPIC_API_KEY', {}, 'sk-ant-api03-x')).toBe('anthropic');
    expect(resolveProbeName('UNKNOWN_FOO', {}, 'random')).toBe(null);
  });

  it('OpenRouter probe marks tracking ok and persists meta', async () => {
    await setSecret(brain, 'OPENROUTER_API_KEY', 'sk-or-v1-test', {
      provider: 'openrouter',
      skip_integration_research: true,
    });
    vi.mocked(throttledFetch).mockResolvedValueOnce(
      jsonResponse(200, {
        data: {
          label: 'tr',
          usage: 1.5,
          usage_daily: 0.1,
          limit: 10,
          limit_remaining: 8.5,
        },
      }),
    );
    const r = await syncSecretAccount(brain, 'OPENROUTER_API_KEY');
    expect(r.tracking_status).toBe('ok');
    expect(r.usage.credits_used_all_time).toBe(1.5);
    const meta = await listSecretsMeta(brain);
    const row = meta.find((k) => k.key === 'OPENROUTER_API_KEY');
    expect(row.tracking_status).toBe('ok');
    expect(row.account_api).toBe(true);
    expect(row.usage_api).toBe(true);
  });

  it('OpenAI project key without admin costs is ERROR under strict mode', async () => {
    await setSecret(brain, 'OPENAI_API_KEY', 'sk-proj-test', {
      provider: 'openai',
      skip_integration_research: true,
    });
    vi.mocked(throttledFetch)
      .mockResolvedValueOnce(jsonResponse(200, { data: [{ id: 'gpt-4' }] }))
      .mockResolvedValueOnce(jsonResponse(403, { error: 'forbidden' }));
    const r = await syncSecretAccount(brain, 'OPENAI_API_KEY', { strict: true });
    expect(r.tracking_status).toBe('error');
    expect(r.key_valid).toBe(true);
    expect(r.error).toMatch(/Admin API key/i);
  });

  it('tracking_exempt yields exempt status', async () => {
    await setSecret(brain, 'BRAVE_SEARCH_API_KEY', 'brave-x', {
      provider: 'brave',
      skip_integration_research: true,
    });
    await syncSecretAccount(brain, 'BRAVE_SEARCH_API_KEY', { force_exempt: true });
    const health = await getTrackingHealth(brain);
    expect(health.healthy).toBe(true);
    expect(health.exempt).toBe(1);
  });

  it('never-synced keys are tracking errors', async () => {
    await setSecret(brain, 'SOME_RANDOM_KEY', 'value-x', { skip_integration_research: true });
    const health = await getTrackingHealth(brain);
    expect(health.healthy).toBe(false);
    expect(health.errors).toBeGreaterThanOrEqual(1);
  });

  it('self-hosted mailcow is auto-ok at $0', async () => {
    await setSecret(brain, 'MAILCOW_API_KEY', 'mc-x', {
      provider: 'mailcow',
      skip_integration_research: true,
    });
    const r = await syncSecretAccount(brain, 'MAILCOW_API_KEY');
    expect(r.tracking_status).toBe('ok');
    expect(r.subscription?.monthly_cost_usd).toBe(0);
  });

  it('syncAllSecretAccounts reports unhealthy when errors remain', async () => {
    await setSecret(brain, 'OPENAI_API_KEY', 'sk-proj-x', {
      provider: 'openai',
      skip_integration_research: true,
    });
    vi.mocked(throttledFetch)
      .mockResolvedValue(jsonResponse(200, { data: [] }));
    // models ok, costs fail
    vi.mocked(throttledFetch).mockImplementation(async (url) => {
      if (String(url).includes('organization/costs')) {
        return jsonResponse(403, {});
      }
      return jsonResponse(200, { data: [] });
    });
    const report = await syncAllSecretAccounts(brain, { strict: true });
    expect(report.healthy).toBe(false);
    expect(report.errors).toBeGreaterThanOrEqual(1);
  });
});
