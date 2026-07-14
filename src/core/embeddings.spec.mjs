/**
 * src/core/embeddings.spec.mjs
 *
 * Unit tests for the embeddings module.
 *
 * Strategy:
 *  - vi.mock('node:fs') to prevent any real disk I/O
 *  - vi.mock('./logger.mjs') to capture warn/debug calls
 *  - vi.mock('./config.mjs') to supply stable config values
 *  - Tests reset mocks between each test via beforeEach
 *
 * @vitest-environment node
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Mocks (must be hoisted before imports of the module under test) ──────────

vi.mock('./config.mjs', () => ({
  googleApiKey: null,
  embedModel: 'gemini-embedding-2',
  brainDir: '/mock/brain',
}));

vi.mock('./logger.mjs', () => ({
  logger: {
    warn: vi.fn(),
    debug: vi.fn(),
    info: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock('node:fs', async () => {
  // We start with a "file not found" baseline and override per test.
  return {
    default: {
      existsSync: vi.fn(() => false),
      statSync: vi.fn(() => ({ mtimeMs: 12345 })),
      readFileSync: vi.fn(() => '{}'),
      writeFileSync: vi.fn(),
      mkdirSync: vi.fn(),
      readdirSync: vi.fn(() => []),
      unlinkSync: vi.fn(),
    },
  };
});

// ─── Module under test (imported AFTER mocks are declared) ───────────────────

import fs from 'node:fs';
import { logger } from './logger.mjs';

import {
  cosineSimilarity,
  loadEmbeddingsIndex,
  loadSessionEmbeddingsIndex,
  nodeToEmbedText,
  chunkNodeBody,
  sessionToEmbedChunks,
  parseSessionFile,
  getCachedEmbedding,
  saveCachedEmbedding,
} from './embeddings.mjs';

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Build a minimal node object for embedding text generation. */
function makeNode(overrides = {}) {
  return {
    slug: 'test-node',
    title: 'Test Node',
    category: 'patterns',
    tags: ['foo', 'bar'],
    body: 'This is the body of the test node.',
    ...overrides,
  };
}

// ─── Test suites ──────────────────────────────────────────────────────────────

describe('Module exports', () => {
  it('exports loadEmbeddingsIndex', () => {
    expect(typeof loadEmbeddingsIndex).toBe('function');
  });

  it('exports loadSessionEmbeddingsIndex', () => {
    expect(typeof loadSessionEmbeddingsIndex).toBe('function');
  });

  it('exports cosineSimilarity', () => {
    expect(typeof cosineSimilarity).toBe('function');
  });

  it('exports nodeToEmbedText', () => {
    expect(typeof nodeToEmbedText).toBe('function');
  });

  it('exports chunkNodeBody', () => {
    expect(typeof chunkNodeBody).toBe('function');
  });

  it('exports getCachedEmbedding', () => {
    expect(typeof getCachedEmbedding).toBe('function');
  });

  it('exports saveCachedEmbedding', () => {
    expect(typeof saveCachedEmbedding).toBe('function');
  });
});

// ─────────────────────────────────────────────────────────────────────────────

describe('loadEmbeddingsIndex — empty / missing index', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Simulate missing file
    fs.existsSync.mockReturnValue(false);
  });

  it('returns {} when the index file does not exist', () => {
    const result = loadEmbeddingsIndex('/fake/derived');
    expect(result).toEqual({});
  });

  it('does not call readFileSync when file is missing', () => {
    loadEmbeddingsIndex('/fake/derived2');
    expect(fs.readFileSync).not.toHaveBeenCalled();
  });
});

// ─────────────────────────────────────────────────────────────────────────────

describe('loadEmbeddingsIndex — normal load', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fs.existsSync.mockReturnValue(true);
    fs.statSync.mockReturnValue({ mtimeMs: 99999 });
  });

  it('returns the parsed index when file is valid JSON', () => {
    const idx = {
      'slug-0': { embedding: [0.1, 0.2, 0.3], model: 'gemini-embedding-2', generated_at: new Date().toISOString() },
      'slug-1': { embedding: [0.4, 0.5, 0.6], model: 'gemini-embedding-2', generated_at: new Date().toISOString() },
      'slug-2': { embedding: [0.7, 0.8, 0.9], model: 'gemini-embedding-2', generated_at: new Date().toISOString() },
    };
    fs.readFileSync.mockReturnValue(JSON.stringify(idx));

    const result = loadEmbeddingsIndex('/fake/derived-normal');
    expect(Object.keys(result)).toHaveLength(3);
    expect(result['slug-0'].embedding).toEqual([0.1, 0.2, 0.3]);
  });

  it('returns {} when file contains corrupt JSON', () => {
    fs.readFileSync.mockReturnValue('NOT VALID JSON{{{{');
    const result = loadEmbeddingsIndex('/fake/derived-corrupt');
    expect(result).toEqual({});
  });

  it('does NOT emit a size warning for a small index', () => {
    const idx = {
      'slug-0': { embedding: [0.1], model: 'x', generated_at: new Date().toISOString() },
    };
    fs.readFileSync.mockReturnValue(JSON.stringify(idx));

    loadEmbeddingsIndex('/fake/derived-small');
    const sizeWarns = logger.warn.mock.calls.filter(c =>
      c[0]?.message?.includes('100MB')
    );
    expect(sizeWarns).toHaveLength(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────

describe('loadEmbeddingsIndex — size monitoring (100MB warning)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fs.existsSync.mockReturnValue(true);
    let callCount = 0;
    fs.statSync.mockImplementation(() => ({ mtimeMs: ++callCount * 1000 }));
  });

  it('emits a warn when serialized index exceeds 100MB', () => {
    // Build an artificially large index: 500 entries each with a 30K-element embedding
    // 500 × ~240KB ≈ 120MB serialized
    const bigEmbedding = new Array(30_000).fill(0.123456789);
    const idx = {};
    for (let i = 0; i < 500; i++) {
      idx[`slug-${i}`] = {
        embedding: bigEmbedding,
        model: 'gemini-embedding-2',
        generated_at: new Date().toISOString(),
      };
    }
    const serialized = JSON.stringify(idx);
    expect(Buffer.byteLength(serialized)).toBeGreaterThan(100 * 1024 * 1024);

    fs.readFileSync.mockReturnValue(serialized);

    loadEmbeddingsIndex('/fake/derived-big');

    const sizeWarns = logger.warn.mock.calls.filter(c =>
      c[0]?.message?.includes('100MB threshold') || c[0]?.message?.includes('exceeds 100MB')
    );
    expect(sizeWarns.length).toBeGreaterThanOrEqual(1);
    expect(sizeWarns[0][0].subsystem).toBe('embeddings');
  });
});

// ─────────────────────────────────────────────────────────────────────────────

describe('loadEmbeddingsIndex — 50K entry cap', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fs.existsSync.mockReturnValue(true);
    let callCount = 0;
    fs.statSync.mockImplementation(() => ({ mtimeMs: ++callCount * 1000 }));
  });

  it('caps at 50,000 entries and emits a warning when index exceeds the limit', () => {
    const OVER_LIMIT = 50_100;
    const idx = {};
    for (let i = 0; i < OVER_LIMIT; i++) {
      idx[`slug-${i}`] = {
        embedding: [0.1],
        model: 'gemini-embedding-2',
        generated_at: new Date().toISOString(),
      };
    }
    fs.readFileSync.mockReturnValue(JSON.stringify(idx));

    const result = loadEmbeddingsIndex('/fake/derived-huge');

    expect(Object.keys(result).length).toBeLessThanOrEqual(50_000);

    const capWarns = logger.warn.mock.calls.filter(c =>
      c[0]?.message?.includes('capping at') || c[0]?.message?.includes('50000')
    );
    expect(capWarns.length).toBeGreaterThanOrEqual(1);
    expect(capWarns[0][0].subsystem).toBe('embeddings');
  });

  it('does not warn when index is exactly at the 50K limit', () => {
    const AT_LIMIT = 50_000;
    const idx = {};
    for (let i = 0; i < AT_LIMIT; i++) {
      idx[`slug-${i}`] = { embedding: [0.1], model: 'x', generated_at: new Date().toISOString() };
    }
    fs.readFileSync.mockReturnValue(JSON.stringify(idx));

    const result = loadEmbeddingsIndex('/fake/derived-limit');
    expect(Object.keys(result).length).toBe(AT_LIMIT);

    const capWarns = logger.warn.mock.calls.filter(c =>
      c[0]?.message?.includes('capping at')
    );
    expect(capWarns).toHaveLength(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────

describe('loadSessionEmbeddingsIndex — empty / missing', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fs.existsSync.mockReturnValue(false);
  });

  it('returns {} when session index file does not exist', () => {
    const result = loadSessionEmbeddingsIndex('/fake/derived');
    expect(result).toEqual({});
  });
});

// ─────────────────────────────────────────────────────────────────────────────

describe('cosineSimilarity — ranked results', () => {
  it('returns 1.0 for identical vectors', () => {
    const v = [1, 0, 0];
    expect(cosineSimilarity(v, v)).toBeCloseTo(1.0);
  });

  it('returns 0.0 for orthogonal vectors', () => {
    expect(cosineSimilarity([1, 0], [0, 1])).toBeCloseTo(0.0);
  });

  it('returns -1.0 for opposite vectors', () => {
    expect(cosineSimilarity([1, 0], [-1, 0])).toBeCloseTo(-1.0);
  });

  it('returns 0 for mismatched length vectors', () => {
    expect(cosineSimilarity([1, 2, 3], [1, 2])).toBe(0);
  });

  it('returns 0 for null inputs', () => {
    expect(cosineSimilarity(null, [1, 2])).toBe(0);
    expect(cosineSimilarity([1, 2], null)).toBe(0);
  });

  it('returns 0 for zero vectors', () => {
    expect(cosineSimilarity([0, 0], [0, 0])).toBe(0);
  });

  it('correctly ranks candidates by similarity to a query vector', () => {
    const query  = [1, 0, 0];
    const best   = [0.99, 0.14, 0];   // nearly identical
    const medium = [0.71, 0.71, 0];   // 45 degrees away
    const worst  = [0,    1,    0];   // orthogonal

    const scores = [
      { label: 'best',   score: cosineSimilarity(query, best) },
      { label: 'medium', score: cosineSimilarity(query, medium) },
      { label: 'worst',  score: cosineSimilarity(query, worst) },
    ].sort((a, b) => b.score - a.score);

    expect(scores[0].label).toBe('best');
    expect(scores[1].label).toBe('medium');
    expect(scores[2].label).toBe('worst');
  });
});

// ─────────────────────────────────────────────────────────────────────────────

describe('nodeToEmbedText', () => {
  it('includes title, category, tags, and body', () => {
    const text = nodeToEmbedText(makeNode());
    expect(text).toContain('Title: Test Node');
    expect(text).toContain('Category: patterns');
    expect(text).toContain('Tags: foo, bar');
    expect(text).toContain('Body:');
  });

  it('falls back to slug when title is missing', () => {
    const text = nodeToEmbedText({ slug: 'my-slug' });
    expect(text).toContain('Title: my-slug');
  });

  it('omits empty fields', () => {
    const text = nodeToEmbedText({ slug: 'bare', title: 'Bare' });
    expect(text).not.toContain('Category:');
    expect(text).not.toContain('Tags:');
    expect(text).not.toContain('Body:');
  });

  it('truncates body at 2000 chars', () => {
    const longBody = 'x'.repeat(5000);
    const text = nodeToEmbedText({ slug: 'big', body: longBody });
    const bodyPart = text.split('Body: ')[1] || '';
    expect(bodyPart.length).toBeLessThanOrEqual(2000);
  });
});

// ─────────────────────────────────────────────────────────────────────────────

describe('chunkNodeBody', () => {
  it('returns [] for empty body', () => {
    expect(chunkNodeBody('')).toEqual([]);
    expect(chunkNodeBody(null)).toEqual([]);
    expect(chunkNodeBody(undefined)).toEqual([]);
  });

  it('splits on double newlines', () => {
    const body = 'First paragraph with enough text here.\n\nSecond paragraph with enough text too.';
    const chunks = chunkNodeBody(body);
    expect(chunks.length).toBe(2);
  });

  it('filters out paragraphs shorter than 50 chars', () => {
    const body = 'Short.\n\nThis paragraph is long enough to be included in the output result.';
    const chunks = chunkNodeBody(body);
    expect(chunks).toHaveLength(1);
    expect(chunks[0]).toContain('long enough');
  });
});

// ─────────────────────────────────────────────────────────────────────────────

describe('sessionToEmbedChunks', () => {
  it('returns [] for empty messages array', () => {
    expect(sessionToEmbedChunks([])).toEqual([]);
  });

  it('returns [] when all messages lack content', () => {
    expect(sessionToEmbedChunks([{ role: 'user' }, { role: 'assistant' }])).toEqual([]);
  });

  it('returns a single chunk for short sessions', () => {
    const messages = [
      { role: 'user', content: 'Hello' },
      { role: 'assistant', content: 'Hi there!' },
    ];
    const chunks = sessionToEmbedChunks(messages);
    expect(chunks).toHaveLength(1);
    expect(chunks[0]).toContain('USER: Hello');
    expect(chunks[0]).toContain('ASSISTANT: Hi there!');
  });

  it('splits into multiple chunks when content exceeds 6000 chars', () => {
    const bigContent = 'x'.repeat(7000);
    const messages = [{ role: 'user', content: bigContent }];
    const chunks = sessionToEmbedChunks(messages);
    expect(chunks.length).toBeGreaterThanOrEqual(2);
  });
});

// ─────────────────────────────────────────────────────────────────────────────

describe('parseSessionFile', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns [] when file read fails', () => {
    fs.readFileSync.mockImplementation(() => { throw new Error('ENOENT'); });
    const result = parseSessionFile('/fake/session.jsonl');
    expect(result).toEqual([]);
  });

  it('parses JSONL lines', () => {
    const lines = [
      JSON.stringify({ role: 'user', content: 'hello' }),
      JSON.stringify({ role: 'assistant', content: 'world' }),
    ].join('\n');
    fs.readFileSync.mockReturnValue(lines);
    const result = parseSessionFile('/fake/session.jsonl');
    expect(result).toHaveLength(2);
    expect(result[0].role).toBe('user');
  });

  it('unwraps { messages: [...] } envelope format', () => {
    const envelope = JSON.stringify({ messages: [{ role: 'user', content: 'hi' }] });
    fs.readFileSync.mockReturnValue(envelope);
    const result = parseSessionFile('/fake/session.json');
    expect(result).toHaveLength(1);
    expect(result[0].content).toBe('hi');
  });

  it('skips malformed lines without throwing', () => {
    const lines = [
      JSON.stringify({ role: 'user', content: 'valid' }),
      'NOT JSON {{{',
      JSON.stringify({ role: 'assistant', content: 'also valid' }),
    ].join('\n');
    fs.readFileSync.mockReturnValue(lines);
    const result = parseSessionFile('/fake/session.jsonl');
    expect(result).toHaveLength(2);
  });
});
