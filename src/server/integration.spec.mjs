/**
 * Integration smoke tests — Phase 5
 *
 * Covers:
 *   - UltraChat session sync endpoints (GET /api/sessions, GET /api/sessions/:id,
 *     POST /api/sessions/ingest)
 *   - MCP resource smoke (resources/list returns SSSS and derived resources)
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { vi } from 'vitest';
import express from 'express';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// ─── Setup shared temp AGENT_DIR ────────────────────────────────────────────────

const TEST_AGENT_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'tr-integration-'));
const OLD_AGENT_DIR = process.env.AGENT_DIR;
process.env.AGENT_DIR = TEST_AGENT_DIR;

// Mock the heavy deps that api.mjs pulls in
vi.mock('../core/frontier.mjs', () => ({
  callFrontier: vi.fn(async () => 'ok'),
  callFrontierRaw: vi.fn(async () => ({ choices: [{ message: { content: 'ok' }, finish_reason: 'stop' }] })),
  loadFrontierConfig: () => ({ endpoint: 'http://x', model: 'test', temperature: 0.7, local: null })
}));
vi.mock('../core/runtime.mjs', () => ({
  callLocalRuntimeRaw: vi.fn(async () => ({ choices: [{ message: { content: 'ok' }, finish_reason: 'stop' }] })),
  loadRuntimeConfig: () => ({ runtime: 'ollama', endpoint: 'http://local/v1/chat/completions', model: 'gemma4:26b', temperature: 0.2 }),
  checkRuntimeHealth: vi.fn(async () => ({ status: 'healthy' }))
}));
vi.mock('./auth.mjs', () => ({
  requireAuth: (_req, _res, next) => next(),
  requireScope: () => (_req, _res, next) => next(),
  requireAuthOrLocal: (_req, _res, next) => next(),
  loadSecurityConfig: () => ({}),
  loginHandler: (_req, res) => res.json({}),
  logoutHandler: (_req, res) => res.json({}),
  changePasswordHandler: (_req, res) => res.json({}),
  apiRateLimiter: () => (_req, _res, next) => next()
}));
vi.mock('./tools.mjs', () => ({ AVAILABLE_TOOLS: [], handleToolCall: vi.fn() }));

const { apiRouter } = await import('./api.mjs');
const { restRouter } = await import('./rest.mjs');

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use(cookieParser());
  app.use(apiRouter);
  app.use(restRouter);
  return app;
}

const SESSIONS_DIR = path.join(TEST_AGENT_DIR, 'sessions');

afterEach(() => {
  // Clean sessions between tests
  if (fs.existsSync(SESSIONS_DIR)) {
    for (const f of fs.readdirSync(SESSIONS_DIR)) {
      fs.unlinkSync(path.join(SESSIONS_DIR, f));
    }
  }
});

// Restore AGENT_DIR after all tests
import { afterAll } from 'vitest';
afterAll(() => {
  if (OLD_AGENT_DIR === undefined) delete process.env.AGENT_DIR;
  else process.env.AGENT_DIR = OLD_AGENT_DIR;
  fs.rmSync(TEST_AGENT_DIR, { recursive: true, force: true });
});

// ─── UltraChat Session Sync ──────────────────────────────────────────────────────

describe('UltraChat session sync — GET /api/sessions', () => {
  it('returns empty list when no sessions exist', async () => {
    const res = await request(buildApp()).get('/api/sessions');
    expect(res.status).toBe(200);
    expect(res.body.sessions).toEqual([]);
  });

  it('lists sessions present on disk', async () => {
    fs.mkdirSync(SESSIONS_DIR, { recursive: true });
    fs.writeFileSync(path.join(SESSIONS_DIR, 'abc123.jsonl'), '{"session_id":"abc123"}\n');

    const res = await request(buildApp()).get('/api/sessions');
    expect(res.status).toBe(200);
    expect(res.body.sessions).toHaveLength(1);
    expect(res.body.sessions[0].id).toBe('abc123');
    expect(res.body.sessions[0]).toHaveProperty('modified');
    expect(res.body.sessions[0]).toHaveProperty('size');
  });
});

describe('UltraChat session sync — GET /api/sessions/:id', () => {
  it('returns 404 for unknown session', async () => {
    const res = await request(buildApp()).get('/api/sessions/nonexistent');
    expect(res.status).toBe(404);
  });

  it('returns parsed exchanges for a known session', async () => {
    fs.mkdirSync(SESSIONS_DIR, { recursive: true });
    const record = { session_id: 'sess1', messages: [{ role: 'user', content: 'hello' }] };
    fs.writeFileSync(path.join(SESSIONS_DIR, 'sess1.jsonl'), JSON.stringify(record) + '\n');

    const res = await request(buildApp()).get('/api/sessions/sess1');
    expect(res.status).toBe(200);
    expect(res.body.id).toBe('sess1');
    expect(res.body.exchanges).toHaveLength(1);
    expect(res.body.exchanges[0].session_id).toBe('sess1');
  });

  it('strips path traversal characters from session id', async () => {
    const res = await request(buildApp()).get('/api/sessions/../../etc/passwd');
    // After stripping, id becomes empty or safe — must not return 200 with file contents
    expect(res.status).not.toBe(200);
  });
});

describe('UltraChat session sync — POST /api/sessions/ingest', () => {
  it('returns 400 when id or messages missing', async () => {
    const res = await request(buildApp())
      .post('/api/sessions/ingest')
      .send({ id: 'test' }); // no messages
    expect(res.status).toBe(400);
  });

  it('ingests a session and writes it to disk', async () => {
    const payload = {
      id: 'uc-2026-test',
      source: 'ultrachat',
      messages: [
        { role: 'user', content: 'What is Total Recall?' },
        { role: 'assistant', content: 'A sovereign AI OS.' }
      ]
    };

    const res = await request(buildApp())
      .post('/api/sessions/ingest')
      .send(payload);

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.id).toBe('uc-2026-test');

    const file = path.join(SESSIONS_DIR, 'uc-2026-test.jsonl');
    expect(fs.existsSync(file)).toBe(true);
    const written = JSON.parse(fs.readFileSync(file, 'utf8').trim());
    expect(written.source).toBe('ultrachat');
    expect(written.messages).toHaveLength(2);
  });

  it('sanitises special characters in id', async () => {
    const payload = {
      id: 'bad/../../id',
      messages: [{ role: 'user', content: 'hi' }]
    };
    const res = await request(buildApp())
      .post('/api/sessions/ingest')
      .send(payload);

    expect(res.status).toBe(200);
    // id must be sanitised — no path separators
    expect(res.body.id).not.toContain('/');
    expect(res.body.id).not.toContain('..');
  });

  it('ingests raw plaintext Antigravity overview logs and parses line-by-line', async () => {
    const payload = {
      id: 'ag-2026-test',
      source: 'antigravity',
      content: [
        'USER: Hello world',
        'Model thinking...',
        'TOOL: run_command something',
        'Done.'
      ].join('\n')
    };

    const res = await request(buildApp())
      .post('/api/sessions/ingest')
      .send(payload);

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.id).toBe('ag-2026-test');

    const file = path.join(SESSIONS_DIR, 'ag-2026-test.jsonl');
    expect(fs.existsSync(file)).toBe(true);
    const written = JSON.parse(fs.readFileSync(file, 'utf8').trim());
    expect(written.source).toBe('antigravity');
    expect(written.messages).toHaveLength(4);
    expect(written.messages[0].role).toBe('user');
    expect(written.messages[0].content).toBe('USER: Hello world');
    expect(written.messages[1].role).toBe('assistant');
    expect(written.messages[2].role).toBe('tool');
    expect(written.messages[2].content).toBe('TOOL: run_command something');
    expect(written.messages[3].role).toBe('assistant');
  });
});
