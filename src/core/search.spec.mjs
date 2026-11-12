// @vitest-environment node
import { describe, it, expect, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  nodes: [
    { slug: 'match', title: 'Kubernetes rollout notes', body: 'blue green deploys' },
    { slug: 'other', title: 'Sourdough starter', body: 'feed daily' },
  ],
  index: {
    match: { embedding: [1, 0] },
    other: { embedding: [0, 1] },
  },
}));

vi.mock('./vault-cache.mjs', () => ({ getNodes: () => mocks.nodes }));
vi.mock('./embeddings.mjs', () => ({
  getEmbedding: async () => [0.8, 0.6],
  cosineSimilarity: (a, b) => {
    const dot = a.reduce((s, v, i) => s + v * b[i], 0);
    const norm = (v) => Math.sqrt(v.reduce((s, x) => s + x * x, 0));
    return dot / (norm(a) * norm(b));
  },
  loadEmbeddingsIndex: () => mocks.index,
  loadSessionEmbeddingsIndex: () => ({}),
}));

import { semanticSearch } from './search.mjs';

describe('semanticSearch', () => {
  it('applies the optional ranking stage before top-k and preserves metadata filters', async () => {
    const rankResults = vi.fn(results => [...results].reverse());
    const result = await semanticSearch('deploys', { vaultDir: '/v', derivedDir: '/d', top_k: 1,
      includeSessions: false, rankResults });
    expect(rankResults.mock.calls[0][0]).toHaveLength(2);
    expect(result[0].slug).toBe('other');
    expect((await semanticSearch('deploys', { vaultDir: '/v', derivedDir: '/d', top_k: 1,
      includeSessions: false }))[0].slug).toBe('match');
    expect(await semanticSearch('deploys', { vaultDir: '/v', derivedDir: '/d', category: 'missing',
      includeSessions: false, rankResults })).toHaveLength(0);
  });
  it('attaches raw cosine similarity to vault results alongside the rank-fused score', async () => {
    const results = await semanticSearch('deploys', { vaultDir: '/v', derivedDir: '/d', top_k: 5, includeSessions: false });
    const bySlug = Object.fromEntries(results.map(r => [r.slug, r]));

    expect(bySlug.match.similarity).toBeCloseTo(0.8, 3);
    expect(bySlug.other.similarity).toBeCloseTo(0.6, 3);
    // RRF score is rank-based and must not be confused with similarity.
    expect(typeof bySlug.match.score).toBe('number');
    expect(results[0].slug).toBe('match');
  });
});
