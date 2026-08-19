import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';

// vi.mock is hoisted above the imports, which is the only way to stub auth here:
// embeddings.mjs does `router.use('/api/embeddings', requireAuth)` at module
// scope, so the router captures the real middleware the moment it is imported.
// A vi.spyOn in beforeEach replaces the module export long after that binding
// was taken, leaving the routes still guarded — every request came back 401.
vi.mock('../auth.mjs', async (importOriginal) => ({
  ...(await importOriginal()),
  requireAuth: (req, res, next) => next(),
  requireScope: () => (req, res, next) => next(),
}));

import embeddingsRouter from './embeddings.mjs';
import * as ollamaEmbeddings from '../../core/ollama-embeddings.mjs';

describe('routes: embeddings', () => {
  let app;

  beforeEach(() => {
    vi.restoreAllMocks();

    app = express();
    app.use(express.json());
    app.use(embeddingsRouter);
  });

  it('GET /api/embeddings/provider returns provider info', async () => {
    vi.spyOn(ollamaEmbeddings, 'getOllamaProviderStatus').mockResolvedValue({
      reachable: true,
      selected: 'nomic-embed-text',
      models: [{ name: 'nomic-embed-text', dims: 768, supported: true }],
    });

    const res = await request(app).get('/api/embeddings/provider');
    expect(res.status).toBe(200);
    expect(res.body.local.selected).toBe('nomic-embed-text');
    expect(Array.isArray(res.body.fallbacks)).toBe(true);
  });

  it('POST /api/embeddings/rediscover resets discovery and returns status', async () => {
    vi.spyOn(ollamaEmbeddings, 'resetOllamaDiscovery').mockImplementation(() => {});
    vi.spyOn(ollamaEmbeddings, 'getOllamaProviderStatus').mockResolvedValue({
      reachable: true,
      selected: 'all-minilm',
    });

    const res = await request(app).post('/api/embeddings/rediscover');
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.local.selected).toBe('all-minilm');
  });

  it('POST /api/embeddings/model validates requested model format', async () => {
    const res = await request(app)
      .post('/api/embeddings/model')
      .send({ model: 12345 });
    expect(res.status).toBe(400);
    expect(res.body.error).toContain('must be a string');
  });
});
