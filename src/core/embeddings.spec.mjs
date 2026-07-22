import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

vi.mock('./logger.mjs', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import path from 'node:path';
import fs from 'node:fs';

vi.mock('./throttled-fetch.mjs', () => ({
  throttledFetch: vi.fn(async () => ({
    ok: true,
    json: async () => ({
      embedding: { values: new Array(768).fill(0.1) },
      data: [{ embedding: new Array(768).fill(0.1) }],
      models: [{ name: 'models/gemini-embedding-2' }],
    }),
    text: async () => '',
  })),
}));

import {
  getEmbedding,
  cosineSimilarity,
  buildEmbeddingsIndex,
  loadEmbeddingsIndex,
  saveEmbeddingToIndex,
  removeEmbeddingFromIndex,
  buildSessionEmbeddingsIndex,
  loadSessionEmbeddingsIndex
} from './embeddings.mjs';

const tempDir = path.join(process.cwd(), '.agent/memory-derived-test');

describe('embeddings module (sqlite-vss)', () => {
  beforeEach(() => {
    fs.mkdirSync(tempDir, { recursive: true });
    process.env.GOOGLE_API_KEY = 'test';
  });

  afterEach(() => {
    vi.restoreAllMocks();
    delete process.env.GOOGLE_API_KEY;
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('generates mock embeddings', async () => {
    const vec = await getEmbedding('Hello world');
    expect(vec.length).toBe(768);
  });

  it('builds vault embeddings index and saves to db', async () => {
    const nodes = [
      { slug: 'node1', title: 'Test 1', body: 'Content 1' },
      { slug: 'node2', title: 'Test 2', body: 'Content 2' },
    ];
    
    const res = await buildEmbeddingsIndex(nodes, tempDir, { force: true });
    expect(res.built).toBe(2);

    const index = loadEmbeddingsIndex(tempDir);
    expect(Object.keys(index)).toHaveLength(2);
    expect(index['node1'].embedding).toBeDefined();
    
    // Add one manually
    saveEmbeddingToIndex(tempDir, 'node3', new Array(768).fill(0.2));
    const index2 = loadEmbeddingsIndex(tempDir);
    expect(Object.keys(index2)).toHaveLength(3);
    
    // Remove one manually
    removeEmbeddingFromIndex(tempDir, 'node1');
    const index3 = loadEmbeddingsIndex(tempDir);
    expect(Object.keys(index3)).toHaveLength(2);
    expect(index3['node1']).toBeUndefined();
  });
  
  it('calculates cosine similarity correctly', () => {
    const a = [1, 0, 0];
    const b = [1, 0, 0];
    const c = [0, 1, 0];
    
    expect(cosineSimilarity(a, b)).toBeCloseTo(1.0);
    expect(cosineSimilarity(a, c)).toBeCloseTo(0.0);
  });
});
