import { describe, it, expect, vi, beforeEach, afterEach, afterAll } from 'vitest';
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
const callLocalRuntimeRawSpy = vi.fn();
const TEST_AGENT_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'total-recall-api-'));
const OLD_AGENT_DIR = process.env.AGENT_DIR;
process.env.AGENT_DIR = TEST_AGENT_DIR;

vi.mock('../core/frontier.mjs', () => ({
  callFrontier: vi.fn(async () => 'ok'),
  callFrontierRaw: (...args) => callFrontierRawSpy(...args),
  loadFrontierConfig: () => ({ endpoint: 'http://x', model: 'test-model', temperature: 0.7, local: null })
}));

vi.mock('../core/runtime.mjs', () => ({
  callLocalRuntimeRaw: (...args) => callLocalRuntimeRawSpy(...args),
  loadRuntimeConfig: () => ({
    runtime: 'ollama',
    endpoint: 'http://local-runtime/v1/chat/completions',
    model: 'gemma4:26b',
    temperature: 0.2
  }),
  checkRuntimeHealth: vi.fn(async () => ({
    status: 'healthy',
    runtime: 'ollama',
    active_model: 'gemma4:26b'
  }))
}));

// Bypass auth — we're testing the prompt-injection logic, not the gate.
vi.mock('./auth.mjs', () => ({
  requireAuth: (req, _res, next) => next(),
  requireScope: () => (req, _res, next) => next(),
  loginHandler: (_req, res) => res.json({}),
  logoutHandler: (_req, res) => res.json({}),
  changePasswordHandler: (_req, res) => res.json({}),
  apiRateLimiter: () => (req, _res, next) => next()
}));

vi.mock('./tools.mjs', () => ({
  AVAILABLE_TOOLS: [],
  handleToolCall: vi.fn()
}));

const { apiRouter } = await import('./api.mjs');

const AGENT_DIR = TEST_AGENT_DIR;
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
  afterAll(() => {
    if (OLD_AGENT_DIR === undefined) delete process.env.AGENT_DIR;
    else process.env.AGENT_DIR = OLD_AGENT_DIR;
    fs.rmSync(TEST_AGENT_DIR, { recursive: true, force: true });
  });

  it('returns 400 for missing messages array', async () => {
    callFrontierRawSpy.mockReset();
    const res = await request(buildApp())
      .post('/v1/chat/completions')
      .send({});

    expect(res.status).toBe(400);
  });

  describe('integration discovery resources', () => {
    beforeEach(() => {
      fs.mkdirSync(path.dirname(INSTRUCTIONS_FILE), { recursive: true });
      fs.writeFileSync(INSTRUCTIONS_FILE, FIXTURE_INSTRUCTIONS);
      fs.mkdirSync(path.dirname(SSSS_FILE), { recursive: true });
      fs.writeFileSync(SSSS_FILE, FIXTURE_SSSS);
      const refsDir = path.join(path.dirname(SSSS_FILE), 'references');
      fs.mkdirSync(refsDir, { recursive: true });
      fs.writeFileSync(path.join(refsDir, 'ssss-spec.md'), '# Spec\n\nTOTAL_RECALL_SPEC_FIXTURE_TOKEN\n');
      fs.writeFileSync(path.join(refsDir, 'authoring-principles.md'), '# Authoring\n\nTOTAL_RECALL_AUTHORING_FIXTURE_TOKEN\n');
    });

    afterEach(() => {
      fs.rmSync(TEST_AGENT_DIR, { recursive: true, force: true });
      fs.mkdirSync(TEST_AGENT_DIR, { recursive: true });
      callFrontierRawSpy.mockReset();
      callLocalRuntimeRawSpy.mockReset();
    });

    it('serves a well-known discovery manifest without requiring an API prefix', async () => {
      const res = await request(buildApp())
        .get('/.well-known/total-recall.json');

      expect(res.status).toBe(200);
      expect(res.body.name).toBe('total-recall');
      expect(res.body.endpoints.chat_completions).toContain('/v1/chat/completions');
      expect(res.body.endpoints.models).toContain('/v1/models');
      expect(res.body.resources.ssss_spec).toContain('/api/ssss/spec');
      expect(res.body.auth.type).toBe('bearer_pat');
    });

    it('lists Total Recall catalog models through /v1/models', async () => {
      const res = await request(buildApp()).get('/v1/models');

      expect(res.status).toBe(200);
      expect(res.body.object).toBe('list');
      const ids = res.body.data.map(model => model.id);
      expect(ids).toContain('total-recall/gemma4');
      const gemma = res.body.data.find(model => model.id === 'total-recall/gemma4');
      expect(gemma.aliases).toContain('gpt-4o-compatible');
      expect(gemma.metadata.runtime_model).toBe('gemma4:26b');
    });

    it('serves SSSS resource manifest and individual resources', async () => {
      const manifest = await request(buildApp()).get('/api/ssss');
      expect(manifest.status).toBe(200);
      expect(manifest.body.resources.instructions.sha256).toBeTruthy();
      expect(manifest.body.resources.references.map(ref => ref.name)).toContain('authoring-principles');

      const instructions = await request(buildApp()).get('/api/ssss/instructions');
      expect(instructions.status).toBe(200);
      expect(instructions.body.content).toContain('TOTAL_RECALL_INSTRUCTIONS_FIXTURE_TOKEN');
      expect(instructions.body.sha256).toMatch(/^[a-f0-9]{64}$/);

      const spec = await request(buildApp()).get('/api/ssss/spec');
      expect(spec.status).toBe(200);
      expect(spec.body.content).toContain('TOTAL_RECALL_SPEC_FIXTURE_TOKEN');

      const reference = await request(buildApp()).get('/api/ssss/references/authoring-principles');
      expect(reference.status).toBe(200);
      expect(reference.body.content).toContain('TOTAL_RECALL_AUTHORING_FIXTURE_TOKEN');
    });

    it('normalizes known Total Recall model aliases before calling the local runtime', async () => {
      fs.mkdirSync(path.join(AGENT_DIR, 'config'), { recursive: true });
      fs.writeFileSync(path.join(AGENT_DIR, 'config', 'runtime.yml'), 'runtime: ollama\n');
      callLocalRuntimeRawSpy.mockResolvedValue({
        role: 'assistant',
        content: 'local runtime response',
        tool_calls: undefined
      });

      const res = await request(buildApp())
        .post('/v1/chat/completions')
        .send({
          model: 'total-recall/gemma4',
          messages: [{ role: 'user', content: 'Hello local brain' }]
        });

      expect(res.status).toBe(200);
      expect(callLocalRuntimeRawSpy).toHaveBeenCalledTimes(1);
      const [, activeConfig] = callLocalRuntimeRawSpy.mock.calls[0];
      expect(activeConfig.model).toBe('gemma4:26b');
      expect(res.body.model).toBe('total-recall/gemma4');
    });
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
