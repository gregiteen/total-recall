import { describe, it, expect, vi, beforeEach, afterEach, afterAll } from 'vitest';
import express from 'express';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// Capture every message array that the API hands to the local runtime so we can
// assert that the SSSS + INSTRUCTIONS.md content was injected into the system
// prompt before forwarding.
const callLocalRuntimeRawSpy = vi.fn();
const TEST_AGENT_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'total-recall-api-'));
const OLD_AGENT_DIR = process.env.AGENT_DIR;
process.env.AGENT_DIR = TEST_AGENT_DIR;

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

vi.mock('./auth.mjs', () => ({
  requireAuth: (req, _res, next) => next(),
  requireScope: () => (req, _res, next) => next(),
  requireAuthOrLocal: (req, _res, next) => next(),
  loadSecurityConfig: () => ({}),
  loginHandler: (_req, res) => res.json({}),
  logoutHandler: (_req, res) => res.json({}),
  changePasswordHandler: (_req, res) => res.json({}),
  apiRateLimiter: () => (req, _res, next) => next(),
  sandboxRateLimiter: () => (req, _res, next) => next(),
  ingestRateLimiter: () => (req, _res, next) => next(),
  requireSandboxEnabled: (_req, _res, next) => next()
}));

vi.mock('./tools.mjs', () => ({
  AVAILABLE_TOOLS: [],
  handleToolCall: vi.fn()
}));

const { apiRouter } = await import('./api.mjs');
const { restRouter } = await import('./rest.mjs');

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
  app.use(restRouter);
  return app;
}

describe('API Proxy', () => {
  afterAll(() => {
    if (OLD_AGENT_DIR === undefined) delete process.env.AGENT_DIR;
    else process.env.AGENT_DIR = OLD_AGENT_DIR;
    fs.rmSync(TEST_AGENT_DIR, { recursive: true, force: true });
  });

  it('returns 400 for missing messages array', async () => {
    callLocalRuntimeRawSpy.mockReset();
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
      callLocalRuntimeRawSpy.mockReset();
    });

    it('serves a well-known discovery manifest without requiring an API prefix', async () => {
      const res = await request(buildApp())
        .get('/.well-known/total-recall.json');

      expect(res.status).toBe(200);
      expect(res.body.name).toBe('Total Recall');
      expect(res.body.version).toBe('3.0.0');
      expect(res.body.api).toContain('/v1');
      expect(res.body.auth.type).toBe('bearer');
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
      callLocalRuntimeRawSpy.mockReset();
      callLocalRuntimeRawSpy.mockResolvedValue({
        role: 'assistant',
        content: 'mocked local response',
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

    it('injects INSTRUCTIONS.md and SSSS SKILL.md into the system prompt before forwarding to local runtime', async () => {
      const res = await request(buildApp())
        .post('/v1/chat/completions')
        .send({ messages: [{ role: 'user', content: 'Hello brain' }] });

      expect(res.status).toBe(200);
      expect(callLocalRuntimeRawSpy).toHaveBeenCalledTimes(1);

      const [messages] = callLocalRuntimeRawSpy.mock.calls[0];
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

      const [messages] = callLocalRuntimeRawSpy.mock.calls[0];
      const systemMsg = messages.find(m => m.role === 'system');
      expect(systemMsg.content).toContain('user-supplied-system-marker');
      expect(systemMsg.content).toContain('TOTAL_RECALL_INSTRUCTIONS_FIXTURE_TOKEN');
    });
  });

  describe('Chat threads & session IDs', () => {
    const sessionsDir = path.join(TEST_AGENT_DIR, 'sessions');

    beforeEach(() => {
      fs.mkdirSync(sessionsDir, { recursive: true });
    });

    afterEach(() => {
      fs.rmSync(sessionsDir, { recursive: true, force: true });
    });

    it('honors x-session-id header and sessionId query parameters for history loading', async () => {
      // 1. Create a dummy session file
      const sessionFile = path.join(sessionsDir, 'custom-thread.jsonl');
      const dummyRecord = {
        messages: [
          { role: 'user', content: 'hello custom query' },
          { role: 'assistant', content: 'hi query prompt' }
        ],
        timestamp: new Date().toISOString()
      };
      fs.writeFileSync(sessionFile, JSON.stringify(dummyRecord) + '\n');

      // 2. Fetch via Query Param
      const resQuery = await request(buildApp())
        .get('/v1/chat/history?sessionId=custom-thread');
      expect(resQuery.status).toBe(200);
      expect(resQuery.body.messages).toHaveLength(2);
      expect(resQuery.body.messages[0].content).toBe('hello custom query');

      // 3. Fetch via Header
      const resHeader = await request(buildApp())
        .get('/v1/chat/history')
        .set('x-session-id', 'custom-thread');
      expect(resHeader.status).toBe(200);
      expect(resHeader.body.messages).toHaveLength(2);
      expect(resHeader.body.messages[0].content).toBe('hello custom query');
    });

    it('lists chat threads via GET /v1/chat/threads and extracts prompt titles', async () => {
      // 1. Create thread-1
      const thread1File = path.join(sessionsDir, 'thread-1.jsonl');
      const record1 = {
        messages: [
          { role: 'user', content: 'What is deep learning?' },
          { role: 'assistant', content: 'AI technique' }
        ],
        timestamp: new Date(Date.now() - 60000).toISOString()
      };
      fs.writeFileSync(thread1File, JSON.stringify(record1) + '\n');

      // 2. Create thread-2 with longer content to test truncation
      const thread2File = path.join(sessionsDir, 'thread-2.jsonl');
      const record2 = {
        messages: [
          { role: 'user', content: 'A very long user prompt that exceeds the forty five character limit definitely' },
          { role: 'assistant', content: 'truncated' }
        ],
        timestamp: new Date().toISOString()
      };
      fs.writeFileSync(thread2File, JSON.stringify(record2) + '\n');

      // 3. Create relay file (should be ignored)
      fs.writeFileSync(path.join(sessionsDir, 'relay-something.jsonl'), '{}');

      // 4. Create empty file (should be ignored)
      fs.writeFileSync(path.join(sessionsDir, 'empty-one.jsonl'), '');

      const res = await request(buildApp()).get('/v1/chat/threads');
      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(2);

      // Verify sorting (thread-2 should be first since it has a newer timestamp)
      expect(res.body[0].id).toBe('thread-2');
      expect(res.body[0].title).toBe('A very long user prompt that exceeds the fort...');
      expect(res.body[0].turns).toBe(1);

      expect(res.body[1].id).toBe('thread-1');
      expect(res.body[1].title).toBe('What is deep learning?');
      expect(res.body[1].turns).toBe(1);
    });

    it('deletes a chat thread and sweeps embeddings via DELETE /v1/chat/threads/:id', async () => {
      const threadId = 'delete-target';
      const file = path.join(sessionsDir, `${threadId}.jsonl`);
      fs.writeFileSync(file, '{"messages":[]}\n');

      expect(fs.existsSync(file)).toBe(true);

      const res = await request(buildApp())
        .delete(`/v1/chat/threads/${threadId}`);
      
      expect(res.status).toBe(200);
      expect(res.body.deleted).toBe(true);
      expect(res.body.id).toBe(threadId);

      // File should be physically gone
      expect(fs.existsSync(file)).toBe(false);
    });
  });

  describe('Grounding context and suggested discussions (Topical Chats)', () => {
    const vaultDir = path.join(TEST_AGENT_DIR, 'memory-vault');

    beforeEach(() => {
      fs.mkdirSync(vaultDir, { recursive: true });
      callLocalRuntimeRawSpy.mockReset();
      callLocalRuntimeRawSpy.mockResolvedValue({
        role: 'assistant',
        content: 'grounded mock response',
        tool_calls: undefined
      });
    });

    afterEach(() => {
      fs.rmSync(vaultDir, { recursive: true, force: true });
    });

    it('injects grounding nodes into the system prompt before forwarding to local runtime', async () => {
      const { writeNode } = await import('../core/vault.mjs');
      writeNode({
        slug: 'my-project-recall',
        category: 'facts',
        type: 'memory',
        title: 'Project Recall Research',
        status: 'active',
        body: 'The details of the project recall memory system.'
      }, vaultDir);

      const res = await request(buildApp())
        .post('/v1/chat/completions')
        .send({
          messages: [{ role: 'user', content: 'Tell me about the project' }],
          groundingNodes: ['my-project-recall']
        });

      expect(res.status).toBe(200);
      expect(callLocalRuntimeRawSpy).toHaveBeenCalledTimes(1);

      const [messages] = callLocalRuntimeRawSpy.mock.calls[0];
      const systemMsg = messages.find(m => m.role === 'system');
      expect(systemMsg).toBeTruthy();
      expect(systemMsg.content).toContain('=== ACTIVE GROUNDING BRAIN NODES ===');
      expect(systemMsg.content).toContain('my-project-recall');
      expect(systemMsg.content).toContain('Project Recall Research');
      expect(systemMsg.content).toContain('The details of the project recall memory system.');
    });

    it('returns proactive suggested discussions matching structure constraints', async () => {
      const { writeNode } = await import('../core/vault.mjs');
      
      writeNode({
        slug: 'fact-node',
        category: 'facts',
        type: 'memory',
        title: 'Fact Master Node',
        status: 'active',
        body: 'Vibrant facts of the system.'
      }, vaultDir);

      writeNode({
        slug: 'concept-node',
        category: 'concepts',
        type: 'memory',
        title: 'Concept Sandbox',
        status: 'active',
        body: 'Dynamic ideas of the brain.'
      }, vaultDir);

      writeNode({
        slug: 'draft-node',
        category: 'patterns',
        type: 'memory',
        title: 'Unfinished Pattern',
        status: 'draft',
        body: 'Drafting structure details.'
      }, vaultDir);

      const res = await request(buildApp())
        .get('/v1/chat/suggestions');

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body).toHaveLength(3);

      const [factS, conceptS, draftS] = res.body;

      expect(factS.type).toBe('fact');
      expect(factS.title).toContain('Fact Master Node');
      expect(factS.nodes).toContain('fact-node');

      expect(conceptS.type).toBe('concept');
      expect(conceptS.title).toContain('Concept Sandbox');
      expect(conceptS.nodes).toContain('concept-node');

      expect(draftS.type).toBe('question');
      expect(draftS.title).toContain('Unfinished Pattern');
      expect(draftS.nodes).toContain('draft-node');
    });

    it('falls back to default suggestions when memory-vault is empty', async () => {
      const res = await request(buildApp())
        .get('/v1/chat/suggestions');

      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(3);
      expect(res.body[0].title).toBe('🧠 Sovereign OS Operations');
      expect(res.body[1].title).toBe('💡 Custom Agent Skills');
      expect(res.body[2].title).toBe('❓ Brain Health & Scaling');
    });
  });

  describe('fallback tool calling parsing', () => {
    it('successfully triggers tool calls when fallback tool call is in message content', async () => {
      // Setup local config and mock health so we enter the local path
      fs.mkdirSync(path.join(AGENT_DIR, 'config'), { recursive: true });
      fs.writeFileSync(path.join(AGENT_DIR, 'config', 'runtime.yml'), 'runtime: ollama\n');
      
      let callCount = 0;
      callLocalRuntimeRawSpy.mockImplementation(async () => {
        callCount++;
        if (callCount === 1) {
          // In the first call, return a message with fallback tool call in content
          return {
            role: 'assistant',
            content: 'Let me look that up.\n<tool_call>{"name": "search_web", "arguments": {"query": "Vast.ai Cloud"}}</tool_call>',
            tool_calls: undefined
          };
        } else {
          // In the second call, return the final response
          return {
            role: 'assistant',
            content: 'Here are the search results: Vast.ai is a cloud GPU platform.',
            tool_calls: undefined
          };
        }
      });

      const handleToolCallSpy = vi.spyOn(await import('./tools.mjs'), 'handleToolCall');
      handleToolCallSpy.mockResolvedValue('Search result: Vast.ai offers on-demand GPUs.');

      const res = await request(buildApp())
        .post('/v1/chat/completions')
        .send({
          model: 'total-recall/gemma4',
          messages: [{ role: 'user', content: 'What is Vast.ai?' }]
        });

      expect(res.status).toBe(200);
      expect(callCount).toBe(2);
      expect(handleToolCallSpy).toHaveBeenCalledTimes(1);
      const toolCallArg = handleToolCallSpy.mock.calls[0][0];
      expect(toolCallArg.function.name).toBe('search_web');
      expect(JSON.parse(toolCallArg.function.arguments).query).toBe('Vast.ai Cloud');
      expect(res.body.choices[0].message.content).toBe('Here are the search results: Vast.ai is a cloud GPU platform.');

      handleToolCallSpy.mockRestore();
    });
  });
});

