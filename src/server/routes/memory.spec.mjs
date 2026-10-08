// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import express from 'express';

const mocks = vi.hoisted(() => ({
  getNodes: vi.fn(),
  semanticSearch: vi.fn(),
  writeNode: vi.fn(),
  invalidate: vi.fn(),
}));

vi.mock('../auth.mjs', () => ({
  requireAuth: (req, _res, next) => { req.user = { id: 'test' }; next(); },
  requireScope: () => (_req, _res, next) => next(),
}));
vi.mock('../../core/vault-cache.mjs', () => ({ getNodes: mocks.getNodes, invalidate: mocks.invalidate }));
vi.mock('../../core/search.mjs', () => ({ semanticSearch: mocks.semanticSearch }));
vi.mock('../../core/surface.mjs', () => ({ compileSurface: vi.fn() }));
vi.mock('../../core/embeddings.mjs', () => ({
  buildEmbeddingsIndex: vi.fn(),
  buildSessionEmbeddingsIndex: vi.fn(),
}));
vi.mock('../../core/conflict-detector.mjs', () => ({ detectAndResolve: vi.fn() }));
vi.mock('../../core/validated-write.mjs', () => ({ writeNodeValidatedAsync: mocks.writeNode }));
vi.mock('../../core/research-queue.mjs', () => ({ listQueue: vi.fn(), updateQueueItem: vi.fn() }));

import { memoryRouter } from './memory.mjs';
import { VAULT_DIR } from './_shared.mjs';

const app = express();
app.use(express.json());
app.use(memoryRouter);

describe('memory mutations and selected brain isolation', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    mocks.getNodes.mockReturnValue([]);
    mocks.writeNode.mockReset().mockResolvedValue({ success: true });
    mocks.invalidate.mockClear();
  });
  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
  });

  it('returns a successful replacement after persisting and invalidating the same vault', async () => {
    const res = await request(app).put('/api/memory/replaced').send({
      title: 'Replacement', category: 'facts', content: 'The new content',
    });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ slug: 'replaced', content: 'The new content' });
    expect(mocks.writeNode).toHaveBeenCalledWith(expect.objectContaining({ slug: 'replaced' }), VAULT_DIR);
    expect(mocks.invalidate).toHaveBeenCalledWith(VAULT_DIR);
  });

  it.each(['post', 'put', 'patch', 'delete'])('rejects %s on an unavailable brain before any write', async (method) => {
    const url = method === 'post' ? '/api/memory' : '/api/memory/replaced';
    const res = await request(app)[method](`${url}?brain=project:__missing_isolation_fixture__`).send({
      slug: 'replaced', title: 'Replacement', category: 'facts', content: 'Must not persist',
    });
    expect(res.status).toBe(404);
    expect(mocks.writeNode).not.toHaveBeenCalled();
    expect(mocks.invalidate).not.toHaveBeenCalled();
  });

  it.each(['/api/memory', '/api/memory/stats', '/api/memory/replaced'])('rejects unavailable selected brains for %s', async (url) => {
    const res = await request(app).get(`${url}?brain=global,project:__missing_isolation_fixture__`);
    expect(res.status).toBe(404);
  });
});

describe('GET /api/memory sort', () => {
  beforeEach(() => {
    mocks.getNodes.mockReturnValue([
      { slug: 'old', title: 'Old', created: '2026-01-01T00:00:00Z', updated: '2026-09-20T00:00:00Z', body: 'a' },
      { slug: 'newest', title: 'Newest', created: '2026-09-21T00:00:00Z', updated: '2026-09-21T00:00:00Z', body: 'b' },
      { slug: 'mid', title: 'Mid', created: '2026-05-01T00:00:00Z', updated: '2026-05-01T00:00:00Z', body: 'c' },
    ]);
  });

  it('sort=recent orders by creation, newest first', async () => {
    const res = await request(app).get('/api/memory?sort=recent&limit=2');
    expect(res.status).toBe(200);
    expect(res.body.total).toBe(3);
    expect(res.body.nodes.map(n => n.slug)).toEqual(['newest', 'mid']);
  });

  it('sort=updated orders by last update, so a re-stamped old node rises', async () => {
    const res = await request(app).get('/api/memory?sort=updated');
    expect(res.body.nodes.map(n => n.slug)).toEqual(['newest', 'old', 'mid']);
  });

  it('without sort keeps vault order', async () => {
    const res = await request(app).get('/api/memory');
    expect(res.body.nodes.map(n => n.slug)).toEqual(['old', 'newest', 'mid']);
  });
});

describe('POST /api/memory/search/semantic', () => {
  it('strips internal path fields and exposes content + similarity', async () => {
    mocks.semanticSearch.mockResolvedValue([
      {
        type: 'vault', slug: 'n1', title: 'Node', body: 'the text', score: 0.49, similarity: 0.61,
        _filePath: '/Users/someone/.agent/skills/total-recall/memory-vault/facts/n1.md',
        _filepath: '/Users/someone/…/n1.md',
      },
      { type: 'session', session_id: 's1', snippet: 'hi', score: 0.4 },
    ]);
    const res = await request(app)
      .post('/api/memory/search/semantic')
      .send({ query: 'anything', top_k: 5, include_sessions: false });

    expect(res.status).toBe(200);
    const [vault, session] = res.body.results;
    expect(vault).toMatchObject({ slug: 'n1', content: 'the text', similarity: 0.61 });
    for (const r of res.body.results) {
      expect(Object.keys(r).filter(k => k.startsWith('_'))).toEqual([]);
    }
    expect(JSON.stringify(res.body)).not.toContain('/Users/');
    expect(session.content).toBeUndefined();
  });

  it('forwards include_sessions=false to the search core', async () => {
    mocks.semanticSearch.mockClear();
    mocks.semanticSearch.mockResolvedValue([{ type: 'vault', slug: 'x', body: '', score: 1 }]);
    await request(app).post('/api/memory/search/semantic').send({ query: 'q', include_sessions: false });
    expect(mocks.semanticSearch.mock.calls[0][1].includeSessions).toBe(false);
  });
});
