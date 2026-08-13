import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';

import {
  normalizeBaseUrl,
  embeddingWidth,
  canEmbed,
  listOllamaModels,
  selectEmbeddingModel,
  getOllamaEmbedding,
  resolveOllamaEndpoint,
  resetOllamaDiscovery,
} from './ollama-embeddings.mjs';

/**
 * Real shapes captured from a live Ollama server. gemma4 is the important one:
 * it is a chat model that nonetheless publishes several *.embedding_length
 * keys, one of which happens to equal a common embedding width.
 */
const NOMIC = {
  capabilities: ['embedding'],
  details: { family: 'nomic-bert' },
  model_info: { 'nomic-bert.embedding_length': 768 },
};

const GEMMA = {
  capabilities: ['completion', 'vision', 'audio', 'tools', 'thinking'],
  details: { family: 'gemma4' },
  model_info: {
    'gemma4.audio.embedding_length': 1024,
    'gemma4.embedding_length': 2560,
    'gemma4.embedding_length_per_layer_input': 256,
    'gemma4.vision.embedding_length': 768,
  },
};

/** Minimal fake of the Ollama HTTP surface. */
function mockOllama({ models = [], show = {}, embedding = null, tagsStatus = 200 } = {}) {
  return vi.fn(async (url, options) => {
    const u = String(url);
    if (u.endsWith('/api/tags')) {
      return {
        ok: tagsStatus === 200,
        status: tagsStatus,
        json: async () => ({ models }),
        text: async () => '',
      };
    }
    if (u.endsWith('/api/show')) {
      const { model } = JSON.parse(options.body);
      const info = show[model];
      return {
        ok: Boolean(info),
        status: info ? 200 : 404,
        json: async () => info,
        text: async () => '',
      };
    }
    if (u.endsWith('/api/embeddings')) {
      return {
        ok: embedding !== null,
        status: embedding !== null ? 200 : 500,
        json: async () => ({ embedding }),
        text: async () => 'server error',
      };
    }
    throw new Error(`unexpected fetch: ${u}`);
  });
}

beforeEach(() => {
  resetOllamaDiscovery();
  delete process.env.TR_OLLAMA_URL;
  delete process.env.OLLAMA_HOST;
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('normalizeBaseUrl', () => {
  it('accepts the three forms OLLAMA_HOST appears in', () => {
    expect(normalizeBaseUrl('http://1.2.3.4:11434')).toBe('http://1.2.3.4:11434');
    expect(normalizeBaseUrl('1.2.3.4:11434')).toBe('http://1.2.3.4:11434');
    expect(normalizeBaseUrl('1.2.3.4')).toBe('http://1.2.3.4:11434');
  });

  it('returns null for junk rather than a malformed URL', () => {
    expect(normalizeBaseUrl('')).toBeNull();
    expect(normalizeBaseUrl(null)).toBeNull();
    expect(normalizeBaseUrl('   ')).toBeNull();
  });
});

describe('capability and width detection', () => {
  it('reads the family-scoped width', () => {
    expect(embeddingWidth(NOMIC)).toBe(768);
  });

  it('does not mistake a vision tower width for the model width', () => {
    // gemma4.vision.embedding_length is 768. A loose regex over *.embedding_length
    // would match it and select a chat model that cannot embed at all.
    expect(embeddingWidth(GEMMA)).toBe(2560);
  });

  it('trusts declared capabilities over model naming', () => {
    expect(canEmbed(NOMIC)).toBe(true);
    expect(canEmbed(GEMMA)).toBe(false);
    expect(canEmbed({})).toBe(false);
  });
});

describe('selectEmbeddingModel — no hardcoded model names', () => {
  it('picks the embedding-capable model of matching width', async () => {
    vi.stubGlobal(
      'fetch',
      mockOllama({
        models: [
          { name: 'gemma4:latest', size: 9_608_000_000 },
          { name: 'nomic-embed-text:latest', size: 274_000_000 },
        ],
        show: { 'gemma4:latest': GEMMA, 'nomic-embed-text:latest': NOMIC },
      }),
    );
    const chosen = await selectEmbeddingModel('http://x:11434', { dims: 768 });
    expect(chosen).toBe('nomic-embed-text:latest');
  });

  it('returns null when nothing on the server can embed at the vault width', async () => {
    vi.stubGlobal(
      'fetch',
      mockOllama({ models: [{ name: 'gemma4:latest' }], show: { 'gemma4:latest': GEMMA } }),
    );
    // Falling back to a hosted provider is correct here; guessing is not.
    expect(await selectEmbeddingModel('http://x:11434', { dims: 768 })).toBeNull();
  });

  it('rejects an embedding model whose width does not match the index', async () => {
    const wide = {
      capabilities: ['embedding'],
      details: { family: 'other' },
      model_info: { 'other.embedding_length': 1536 },
    };
    vi.stubGlobal('fetch', mockOllama({ models: [{ name: 'wide:latest' }], show: { 'wide:latest': wide } }));
    expect(await selectEmbeddingModel('http://x:11434', { dims: 768 })).toBeNull();
  });

  it('prefers the smallest viable model for recall latency', async () => {
    const small = { ...NOMIC };
    vi.stubGlobal(
      'fetch',
      mockOllama({
        models: [
          { name: 'big-embed:latest', size: 5_000_000_000 },
          { name: 'small-embed:latest', size: 100_000_000 },
        ],
        show: { 'big-embed:latest': small, 'small-embed:latest': small },
      }),
    );
    expect(await selectEmbeddingModel('http://x:11434', { dims: 768 })).toBe('small-embed:latest');
  });

  it('honours an operator pin, but only if it can actually embed', async () => {
    vi.stubGlobal(
      'fetch',
      mockOllama({
        models: [{ name: 'gemma4:latest' }, { name: 'nomic-embed-text:latest' }],
        show: { 'gemma4:latest': GEMMA, 'nomic-embed-text:latest': NOMIC },
      }),
    );
    // A stale pin at a model that cannot embed must fall through to discovery
    // rather than hard-failing the whole recall path.
    const chosen = await selectEmbeddingModel('http://x:11434', { dims: 768, preferred: 'gemma4' });
    expect(chosen).toBe('nomic-embed-text:latest');
  });
});

describe('getOllamaEmbedding', () => {
  it('returns the vector on the happy path', async () => {
    vi.stubGlobal('fetch', mockOllama({ embedding: new Array(768).fill(0.1) }));
    const v = await getOllamaEmbedding('hello', { baseUrl: 'http://x:11434', model: 'm', dims: 768 });
    expect(v).toHaveLength(768);
  });

  it('throws rather than storing a wrong-width vector', async () => {
    // Silently accepting this would corrupt the vss0 index with unsearchable rows.
    vi.stubGlobal('fetch', mockOllama({ embedding: new Array(1536).fill(0.1) }));
    await expect(
      getOllamaEmbedding('hello', { baseUrl: 'http://x:11434', model: 'm', dims: 768 }),
    ).rejects.toThrow(/1536 dims, vault requires 768/);
  });

  it('surfaces a server error instead of returning an empty vector', async () => {
    vi.stubGlobal('fetch', mockOllama({ embedding: null }));
    await expect(
      getOllamaEmbedding('hello', { baseUrl: 'http://x:11434', model: 'm', dims: 768 }),
    ).rejects.toThrow(/Ollama embedding error 500/);
  });
});

describe('resolveOllamaEndpoint — no hardcoded hosts', () => {
  it('uses an explicitly configured endpoint', async () => {
    process.env.TR_OLLAMA_URL = 'http://configured:11434';
    vi.stubGlobal('fetch', mockOllama({ models: [{ name: 'any' }] }));
    expect(await resolveOllamaEndpoint()).toBe('http://configured:11434');
  });

  it('returns null when nothing answers, so hosted providers still run', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('ECONNREFUSED'); }));
    expect(await resolveOllamaEndpoint()).toBeNull();
  });

  it('treats a non-Ollama HTTP responder as not an endpoint', async () => {
    process.env.TR_OLLAMA_URL = 'http://someproxy:11434';
    vi.stubGlobal('fetch', mockOllama({ tagsStatus: 404 }));
    expect(await resolveOllamaEndpoint()).toBeNull();
  });
});

describe('listOllamaModels', () => {
  it('returns null on a non-JSON or failing endpoint rather than throwing', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('boom'); }));
    expect(await listOllamaModels('http://x:11434')).toBeNull();
  });
});
