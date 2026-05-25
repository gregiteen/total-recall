/**
 * Rate-limiter wiring tests — Phase 1 of codebase-hardening-pass.
 *
 * Unlike integration.spec.mjs / api.spec.mjs (which mock auth.mjs and
 * disable the limiters), this spec exercises the real `sandboxRateLimiter`,
 * `ingestRateLimiter`, and `apiRateLimiter` against a minimal Express app
 * so we can verify they actually return 429s past their thresholds.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import express from 'express';
import request from 'supertest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const TEST_AGENT_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'tr-ratelimit-'));
process.env.AGENT_DIR = TEST_AGENT_DIR;

// Write a security.yml with tight limits so we can hit them quickly.
const SEC_DIR = path.join(TEST_AGENT_DIR, 'skills', 'total-recall', 'config');
fs.mkdirSync(SEC_DIR, { recursive: true });
fs.writeFileSync(
  path.join(SEC_DIR, 'security.yml'),
  [
    'rate_limits:',
    '  api_requests_per_minute: 3',
    '  sandbox_requests_per_minute: 2',
    '  ingest_requests_per_minute: 4',
  ].join('\n')
);

let apiRateLimiter, sandboxRateLimiter, ingestRateLimiter;
beforeAll(async () => {
  ({ apiRateLimiter, sandboxRateLimiter, ingestRateLimiter } = await import('./auth.mjs'));
});

function buildApp(limiter) {
  const app = express();
  app.use(express.json());
  app.get('/ping', limiter, (_req, res) => res.json({ ok: true }));
  return app;
}

describe('apiRateLimiter', () => {
  it('returns 429 once api_requests_per_minute is exceeded', async () => {
    const app = buildApp(apiRateLimiter());
    const codes = [];
    for (let i = 0; i < 5; i++) {
      const r = await request(app).get('/ping');
      codes.push(r.status);
    }
    // First 3 succeed, remainder 429.
    expect(codes.slice(0, 3)).toEqual([200, 200, 200]);
    expect(codes.slice(3).every(c => c === 429)).toBe(true);
  });
});

describe('sandboxRateLimiter', () => {
  it('returns 429 once sandbox_requests_per_minute is exceeded', async () => {
    const app = buildApp(sandboxRateLimiter());
    const codes = [];
    for (let i = 0; i < 4; i++) {
      const r = await request(app).get('/ping');
      codes.push(r.status);
    }
    expect(codes.slice(0, 2)).toEqual([200, 200]);
    expect(codes.slice(2).every(c => c === 429)).toBe(true);
  });
});

describe('ingestRateLimiter', () => {
  it('returns 429 once ingest_requests_per_minute is exceeded', async () => {
    const app = buildApp(ingestRateLimiter());
    const codes = [];
    for (let i = 0; i < 6; i++) {
      const r = await request(app).get('/ping');
      codes.push(r.status);
    }
    expect(codes.slice(0, 4)).toEqual([200, 200, 200, 200]);
    expect(codes.slice(4).every(c => c === 429)).toBe(true);
  });
});
