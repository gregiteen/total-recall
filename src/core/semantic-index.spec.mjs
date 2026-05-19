import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  cosineSimilarity,
  generateEmbedding,
  loadEmbeddingsIndex,
  buildSemanticIndex,
  semanticSearch,
} from './semantic-index.mjs';

let tmpDir;
beforeEach(() => { tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tr-semantic-')); });
afterEach(() => { fs.rmSync(tmpDir, { recursive: true, force: true }); });

// ─── cosineSimilarity ────────────────────────────────────────────────────────────

describe('cosineSimilarity', () => {
  it('returns 1 for identical vectors', () => {
    expect(cosineSimilarity([1, 0, 0], [1, 0, 0])).toBeCloseTo(1);
  });

  it('returns 0 for orthogonal vectors', () => {
    expect(cosineSimilarity([1, 0], [0, 1])).toBeCloseTo(0);
  });

  it('returns 0 for empty or mismatched vectors', () => {
    expect(cosineSimilarity([], [])).toBe(0);
    expect(cosineSimilarity([1], [1, 2])).toBe(0);
    expect(cosineSimilarity(null, [1])).toBe(0);
  });
});

// ─── generateEmbedding ───────────────────────────────────────────────────────────

describe('generateEmbedding', () => {
  it('returns null when Ollama is unreachable', async () => {
    const result = await generateEmbedding('test', { endpoint: 'http://127.0.0.1:19999' });
    expect(result).toBeNull();
  });
});

// ─── loadEmbeddingsIndex ─────────────────────────────────────────────────────────

describe('loadEmbeddingsIndex', () => {
  it('returns empty map when file does not exist', () => {
    const index = loadEmbeddingsIndex(tmpDir);
    expect(index.size).toBe(0);
  });

  it('loads embeddings from disk', () => {
    fs.writeFileSync(
      path.join(tmpDir, 'embeddings.jsonl'),
      JSON.stringify({ slug: 'node-a', embedding: [0.1, 0.2, 0.3] }) + '\n' +
      JSON.stringify({ slug: 'node-b', embedding: [0.4, 0.5, 0.6] }) + '\n'
    );
    const index = loadEmbeddingsIndex(tmpDir);
    expect(index.size).toBe(2);
    expect(index.get('node-a')).toEqual([0.1, 0.2, 0.3]);
  });

  it('skips corrupt lines without throwing', () => {
    fs.writeFileSync(path.join(tmpDir, 'embeddings.jsonl'), 'not-json\n');
    const index = loadEmbeddingsIndex(tmpDir);
    expect(index.size).toBe(0);
  });
});

// ─── buildSemanticIndex ──────────────────────────────────────────────────────────

describe('buildSemanticIndex', () => {
  it('reports unavailable when Ollama is unreachable', async () => {
    const nodes = [{ slug: 'n1', title: 'Test', content: 'hello' }];
    const result = await buildSemanticIndex(nodes, tmpDir, { endpoint: 'http://127.0.0.1:19999' });
    expect(result.unavailable).toBe(true);
    expect(result.indexed).toBe(0);
  });

  it('skips all nodes when index is already complete', async () => {
    // Pre-populate the index so there is nothing new to embed
    fs.writeFileSync(
      path.join(tmpDir, 'embeddings.jsonl'),
      JSON.stringify({ slug: 'n1', embedding: [1, 0] }) + '\n'
    );
    const nodes = [{ slug: 'n1', title: 'Test', content: 'hello' }];
    const result = await buildSemanticIndex(nodes, tmpDir, { endpoint: 'http://127.0.0.1:19999' });
    // No new nodes to embed → skipped, not unavailable
    expect(result.indexed).toBe(0);
    expect(result.skipped).toBe(1);
    expect(result.unavailable).toBe(false);
  });
});

// ─── semanticSearch ──────────────────────────────────────────────────────────────

describe('semanticSearch', () => {
  it('returns empty array when no embeddings index exists', async () => {
    const results = await semanticSearch('query', tmpDir, { endpoint: 'http://127.0.0.1:19999' });
    expect(results).toEqual([]);
  });

  it('returns empty array when Ollama is unreachable even with an index', async () => {
    fs.writeFileSync(
      path.join(tmpDir, 'embeddings.jsonl'),
      JSON.stringify({ slug: 'n1', embedding: [1, 0] }) + '\n'
    );
    const results = await semanticSearch('hello', tmpDir, { endpoint: 'http://127.0.0.1:19999' });
    expect(results).toEqual([]);
  });

  it('ranks nodes by cosine similarity when embeddings are mocked', async () => {
    // Write a pre-built index so we can mock generateEmbedding for the query only
    fs.writeFileSync(
      path.join(tmpDir, 'embeddings.jsonl'),
      JSON.stringify({ slug: 'close', embedding: [1, 0, 0] }) + '\n' +
      JSON.stringify({ slug: 'far',   embedding: [0, 1, 0] }) + '\n'
    );

    // Mock fetch so generateEmbedding returns [1, 0, 0] for the query
    const origFetch = global.fetch;
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ embedding: [1, 0, 0] })
    });

    const results = await semanticSearch('test query', tmpDir, { threshold: 0 });
    global.fetch = origFetch;

    expect(results[0].slug).toBe('close');
    expect(results[0].score).toBeCloseTo(1);
    expect(results[1].slug).toBe('far');
    expect(results[1].score).toBeCloseTo(0);
  });
});
