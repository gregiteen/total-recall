import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import fs from 'node:fs';

// Mock dependencies
vi.mock('../auth.mjs', () => ({
  requireAuth: (req, res, next) => { req.user = { id: 'test' }; next(); },
  requireAuthOrLocal: (req, res, next) => { req.user = { id: 'test' }; next(); },
  requireScope: () => (req, res, next) => next(),
}));

vi.mock('../../core/runtime.mjs', () => ({
  loadRuntimeConfig: vi.fn(() => ({ model: 'test-model', runtime: 'local' })),
  findBinaryInPath: vi.fn(() => null),
}));

vi.mock('./_shared.mjs', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    MODEL_CATALOG_DIR: '/mock/catalog',
    CONFIG_DIR: '/mock/config',
    AGENT_DIR: '/mock/agent',
  };
});

import modelsRouter from './models.mjs';

const app = express();
app.use(express.json());
app.use(modelsRouter);

describe('Models Router', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(fs, 'existsSync').mockReturnValue(false);
    vi.spyOn(fs, 'readdirSync').mockReturnValue([]);
  });

  describe('GET /v1/models', () => {
    it('returns OpenAI-compatible model list with fallback when catalog is empty', async () => {
      const res = await request(app).get('/v1/models');
      expect(res.status).toBe(200);
      expect(res.body.object).toBe('list');
      expect(Array.isArray(res.body.data)).toBe(true);
      expect(res.body.data[0].id).toBe('test-model');
    });

    it('returns catalog models when MODEL.md files exist', async () => {
      vi.spyOn(fs, 'existsSync').mockReturnValue(true);
      vi.spyOn(fs, 'readdirSync').mockReturnValue([
        Object.assign('MODEL.md', { isDirectory: () => false, isFile: () => true, name: 'MODEL.md' })
      ]);
      vi.spyOn(fs, 'readFileSync').mockReturnValue('---\nname: my-model\nprovider: openai\n---\n');

      const res = await request(app).get('/v1/models');
      expect(res.status).toBe(200);
      expect(res.body.object).toBe('list');
    });
  });

  describe('GET /api/openrouter-models', () => {
    it('returns 500 when OpenRouter fetch fails', async () => {
      global.fetch = vi.fn().mockRejectedValue(new Error('Network error'));

      const res = await request(app).get('/api/openrouter-models');
      expect(res.status).toBe(500);
      expect(res.body.error).toMatch(/Network error/);
    });

    it('returns sorted models on success', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          data: [
            { id: 'openai/gpt-4', name: 'GPT-4', pricing: {}, created: 1000 },
            { id: 'anthropic/claude-3', name: 'Claude 3', pricing: {}, created: 2000 },
          ]
        })
      });

      const res = await request(app).get('/api/openrouter-models');
      expect(res.status).toBe(200);
      expect(res.body.models).toHaveLength(2);
      // anthropic comes before openai alphabetically
      expect(res.body.models[0].id).toBe('anthropic/claude-3');
    });
  });

  describe('GET /api/gemini-models', () => {
    it('returns fallback models when no API key', async () => {
      delete process.env.GOOGLE_API_KEY;
      delete process.env.GEMINI_API_KEY;

      const res = await request(app).get('/api/gemini-models');
      expect(res.status).toBe(200);
      expect(res.body.source).toBe('missing_key');
      expect(Array.isArray(res.body.models)).toBe(true);
    });
  });

  describe('GET /api/claude-models', () => {
    it('returns empty list when no ANTHROPIC_API_KEY', async () => {
      delete process.env.ANTHROPIC_API_KEY;

      const res = await request(app).get('/api/claude-models');
      expect(res.status).toBe(200);
      expect(res.body.source).toBe('missing_key');
      expect(res.body.models).toEqual([]);
    });
  });

  describe('GET /api/openai-models', () => {
    it('returns empty list when no OPENAI_API_KEY', async () => {
      delete process.env.OPENAI_API_KEY;

      const res = await request(app).get('/api/openai-models');
      expect(res.status).toBe(200);
      expect(res.body.source).toBe('missing_key');
      expect(res.body.models).toEqual([]);
    });
  });
});
