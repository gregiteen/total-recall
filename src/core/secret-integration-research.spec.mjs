import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('./logger.mjs', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  parseAiJson,
  gatherCodeUsageContext,
  inferSecretIntegrationWithAi,
  buildIntegrationResearchBrief,
  maybeEnqueueIntegrationResearch,
} from './secret-integration-research.mjs';

vi.mock('./research-queue.mjs', () => ({
  addToQueue: vi.fn((item) => ({ id: 'q1', ...item, status: 'pending' })),
  loadQueue: vi.fn(() => []),
  updateQueueItem: vi.fn(),
}));

const SRC_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)));

describe('secret-integration-research (AI-only)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('parses JSON from model output with surrounding noise', () => {
    const parsed = parseAiJson(
      'Sure.\n{"researchable":true,"topic":"Foo API","notes":"bar","priority":"low","confidence":0.9}\n',
    );
    expect(parsed.researchable).toBe(true);
    expect(parsed.topic).toBe('Foo API');
  });

  it('uses AI decision to build a product brief (no catalog/patterns)', async () => {
    const callRuntime = vi.fn(async () =>
      JSON.stringify({
        researchable: true,
        skip_reason: null,
        product_name: 'Headscale',
        product_slug: 'headscale',
        kind: 'api_key',
        topic: 'Headscale HTTP API authentication and primary endpoints',
        notes: 'Use official Headscale docs. Do not search for the env var name.',
        priority: 'low',
        confidence: 0.92,
      }),
    );

    const brief = await buildIntegrationResearchBrief(
      'HEADSCALE_API_KEY',
      {},
      { callRuntime, codeContext: 'src/server/routes/headscale.mjs: Authorization Bearer' },
    );

    expect(callRuntime).toHaveBeenCalled();
    expect(brief).not.toBeNull();
    expect(brief.topic).toMatch(/Headscale/i);
    expect(brief.topic).not.toMatch(/HEADSCALE_API_KEY/);
  });

  it('skips enqueue when AI says not researchable', async () => {
    const callRuntime = vi.fn(async () =>
      JSON.stringify({
        researchable: false,
        skip_reason: 'Password for webmail, not a public API',
        product_name: null,
        kind: 'password',
        topic: null,
        notes: null,
        priority: 'low',
        confidence: 0.95,
      }),
    );

    const result = await maybeEnqueueIntegrationResearch(
      '/tmp/brain',
      'PORTFOLIO_WEBMAIL_PASSWORD',
      {},
      { callRuntime, codeContext: '(none)' },
    );

    expect(result.enqueued).toBe(false);
    expect(result.skipped).toMatch(/Password|webmail/i);
  });

  it('infers from injected callRuntime without hardcoded provider lists', async () => {
    const callRuntime = vi.fn(async (prompt) => {
      expect(prompt).toContain('MY_WEIRD_VENDOR_API_KEY');
      expect(prompt).toContain('api.weirdvendor.example');
      return JSON.stringify({
        researchable: true,
        product_name: 'Weird Vendor',
        kind: 'api_key',
        topic: 'Weird Vendor public API auth and endpoints',
        notes: 'Base URL seen in code: api.weirdvendor.example',
        priority: 'medium',
        confidence: 0.8,
      });
    });

    const inference = await inferSecretIntegrationWithAi('MY_WEIRD_VENDOR_API_KEY', {
      callRuntime,
      codeContext:
        'src/foo.mjs: fetch("https://api.weirdvendor.example/v1", { headers: { Authorization }})',
    });

    expect(inference.researchable).toBe(true);
    expect(inference.product_name).toBe('Weird Vendor');
    expect(inference.source).toBe('ai');
  });

  it('gatherCodeUsageContext returns a string', () => {
    const ctx = gatherCodeUsageContext('THIS_KEY_SHOULD_NOT_EXIST_ZZZ_999', {
      roots: [SRC_DIR],
      maxHits: 3,
    });
    expect(typeof ctx).toBe('string');
    expect(ctx.length).toBeGreaterThan(5);
  });
});
