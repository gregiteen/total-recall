import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import express from 'express';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// Capture every message array that the API hands to the frontier so we can
// assert that the SSSS + INSTRUCTIONS.md content was injected into the system
// prompt before forwarding.
const callFrontierRawSpy = vi.fn();

vi.mock('../core/frontier.mjs', () => ({
  callFrontier: vi.fn(async () => 'ok'),
  callFrontierRaw: (...args) => callFrontierRawSpy(...args),
  loadFrontierConfig: () => ({ endpoint: 'http://x', model: 'test-model', temperature: 0.7, local: null })
}));

// Bypass auth — we're testing the prompt-injection logic, not the gate.
vi.mock('./auth.mjs', () => ({
  requireAuth: (req, _res, next) => next(),
  loginHandler: (_req, res) => res.json({}),
  logoutHandler: (_req, res) => res.json({}),
  apiRateLimiter: () => (req, _res, next) => next()
}));

vi.mock('./tools.mjs', () => ({
  AVAILABLE_TOOLS: [],
  handleToolCall: vi.fn()
}));

const { apiRouter } = await import('./api.mjs');

const AGENT_DIR = path.join(os.homedir(), '.agent');
const INSTRUCTIONS_FILE = path.join(AGENT_DIR, 'INSTRUCTIONS.md');
const SSSS_FILE = path.join(AGENT_DIR, 'skills', 'ssss', 'SKILL.md');

const FIXTURE_INSTRUCTIONS = '# Test Instructions Marker\n\nTOTAL_RECALL_INSTRUCTIONS_FIXTURE_TOKEN\n';
const FIXTURE_SSSS = '# SSSS Test Marker\n\nTOTAL_RECALL_SSSS_FIXTURE_TOKEN\n';

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use(cookieParser());
  app.use(apiRouter);
  return app;
}

describe('API Proxy', () => {
  it('returns 400 for missing messages array', async () => {
    callFrontierRawSpy.mockReset();
    const res = await request(buildApp())
      .post('/v1/chat/completions')
      .send({});

    expect(res.status).toBe(400);
  });

  describe('memory injection (Phase 5 AC)', () => {
    let savedInstructions = null;
    let savedSsss = null;

    beforeEach(() => {
      callFrontierRawSpy.mockReset();
      callFrontierRawSpy.mockResolvedValue({
        role: 'assistant',
        content: 'mocked frontier response',
        tool_calls: undefined
      });

      // Snapshot any existing files and write our fixtures.
      if (fs.existsSync(INSTRUCTIONS_FILE)) {
        savedInstructions = fs.readFileSync(INSTRUCTIONS_FILE, 'utf8');
      }
      fs.mkdirSync(path.dirname(INSTRUCTIONS_FILE), { recursive: true });
      fs.writeFileSync(INSTRUCTIONS_FILE, FIXTURE_INSTRUCTIONS);

      if (fs.existsSync(SSSS_FILE)) {
        savedSsss = fs.readFileSync(SSSS_FILE, 'utf8');
      }
      fs.mkdirSync(path.dirname(SSSS_FILE), { recursive: true });
      fs.writeFileSync(SSSS_FILE, FIXTURE_SSSS);
    });

    afterEach(() => {
      if (savedInstructions !== null) {
        fs.writeFileSync(INSTRUCTIONS_FILE, savedInstructions);
        savedInstructions = null;
      } else {
        try { fs.unlinkSync(INSTRUCTIONS_FILE); } catch {}
      }
      if (savedSsss !== null) {
        fs.writeFileSync(SSSS_FILE, savedSsss);
        savedSsss = null;
      } else {
        try { fs.unlinkSync(SSSS_FILE); } catch {}
      }
    });

    it('injects INSTRUCTIONS.md and SSSS SKILL.md into the system prompt before forwarding to frontier', async () => {
      const res = await request(buildApp())
        .post('/v1/chat/completions')
        .send({ messages: [{ role: 'user', content: 'Hello brain' }] });

      expect(res.status).toBe(200);
      expect(callFrontierRawSpy).toHaveBeenCalledTimes(1);

      const [messages] = callFrontierRawSpy.mock.calls[0];
      const systemMsg = messages.find(m => m.role === 'system');
      expect(systemMsg, 'expected a system message to be prepended').toBeTruthy();

      // Both injection markers must appear in the system prompt.
      expect(systemMsg.content).toContain('TOTAL_RECALL_INSTRUCTIONS_FIXTURE_TOKEN');
      expect(systemMsg.content).toContain('TOTAL_RECALL_SSSS_FIXTURE_TOKEN');

      // And the headers our code labels them with.
      expect(systemMsg.content).toContain('=== TIER 1 HOT MEMORY INSTRUCTIONS ===');
      expect(systemMsg.content).toContain('=== STRUCTURED SEMANTIC SYNTAX SYSTEM (SSSS) DOCUMENTATION ===');
    });

    it('preserves an existing user system message by prepending the injected block', async () => {
      const res = await request(buildApp())
        .post('/v1/chat/completions')
        .send({
          messages: [
            { role: 'system', content: 'user-supplied-system-marker' },
            { role: 'user', content: 'Hi' }
          ]
        });
      expect(res.status).toBe(200);

      const [messages] = callFrontierRawSpy.mock.calls[0];
      const systemMsg = messages.find(m => m.role === 'system');
      expect(systemMsg.content).toContain('user-supplied-system-marker');
      expect(systemMsg.content).toContain('TOTAL_RECALL_INSTRUCTIONS_FIXTURE_TOKEN');
    });
  });
});
