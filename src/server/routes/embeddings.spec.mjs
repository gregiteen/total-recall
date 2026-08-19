import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';
import embeddingsRouter from './embeddings.mjs';
import * as ollamaEmbeddings from '../../core/ollama-embeddings.mjs';
import * as authModule from '../auth.mjs';

describe('routes: embeddings', () => {
  let app;

  beforeEach(() => {
    vi.restoreAllMocks();
    // Mock requireAuth and requireScope to pass through in tests
    vi.spyOn(authModule, 'requireAuth').mockImplementation((req, res, next) => next());
    vi.spyOn(authModule, 'requireScope').mockReturnValue((req, res, next) => next());

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
