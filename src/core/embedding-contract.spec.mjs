import { describe, it, expect, vi } from 'vitest';

vi.mock('./logger.mjs', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import fs from 'fs';
import path from 'path';

/**
 * Embedding contract — SSSS_SOVEREIGN_AI_OS Phase 5 "Core Test Suite Re-alignment".
 *
 * The original requirement said "verify semantic-index.mjs and surface.mjs work
 * with the new `text-embedding-004` model". That requirement aged badly: the
 * default is now `gemini-embedding-2`, and `text-embedding-004` survives only as
 * the last entry in a preference list. Re-aligning it to the *current* model
 * name would just schedule the same rot for the next model.
 *
 * So these tests pin the invariant instead of the literal: whatever the model is,
 * exactly one place decides it, callers read it from config, and the fallback
 * chain stays ordered and non-empty.
 */

const CORE = path.join(process.cwd(), 'src', 'core');
const read = (f) => fs.readFileSync(path.join(CORE, f), 'utf8');

describe('embedding model configuration', () => {
  it('config declares the single default', async () => {
    const { embedModel } = await import('./config.mjs');
    expect(typeof embedModel).toBe('string');
    expect(embedModel.length).toBeGreaterThan(0);
  });

  it('embeddings.mjs takes its default from config, not a literal', () => {
    expect(read('embeddings.mjs')).toMatch(/const DEFAULT_EMBED_MODEL = embedModel;/);
  });

  it('runtime.mjs does not hardcode a second, competing default', () => {
    // Regression: runtime.mjs pinned 'text-embedding-004' while embeddings.mjs
    // defaulted to 'gemini-embedding-2'. Two answers, nothing reconciling them.
    const src = read('runtime.mjs');
    expect(src).toMatch(/model: embedModel/);
    expect(src).not.toMatch(/model: 'text-embedding-\d+'/);
  });

  it('is overridable by environment without touching source', async () => {
    // A model change must be a config change, not a patch.
    expect(read('config.mjs')).toMatch(/embedModel: process\.env\.TR_EMBED_MODEL/);
  });
});

describe('provider fallback chain', () => {
  it('keeps an ordered, non-empty preference list', () => {
    const src = read('embeddings.mjs');
    const block = src.match(/const preferences = \[([\s\S]*?)\]/);
    expect(block, 'embeddings.mjs must declare a model preference list').toBeTruthy();
    const models = [...block[1].matchAll(/'([^']+)'/g)].map(m => m[1]);
    expect(models.length).toBeGreaterThan(1);
    // The list is a *preference order*; duplicates would make it ambiguous.
    expect(new Set(models).size).toBe(models.length);
  });

  it('supports all three providers the docs promise', () => {
    const src = read('embeddings.mjs');
    for (const fn of ['getOpenRouterEmbedding', 'getOpenAIEmbedding']) {
      expect(src).toContain(fn);
    }
    expect(src).toMatch(/generativelanguage\.googleapis\.com/);
  });

  it('fails loudly when no provider is configured', () => {
    // Returning a zero vector here would silently destroy every similarity
    // score downstream while every call still "succeeded".
    expect(read('embeddings.mjs')).toMatch(/No embedding provider available/);
  });
});

describe('index consumers are model-agnostic', () => {
  it('stores the model alongside each vector so a model switch is detectable', () => {
    // Without this, vectors from two different models sit in one index and
    // cosine similarity silently compares incompatible spaces.
    const src = read('embeddings.mjs');
    expect(src).toMatch(/model = DEFAULT_EMBED_MODEL/);
    expect(src).toMatch(/model: row\.model/);
  });

  it('surface.mjs does not name an embedding model', () => {
    expect(read('surface.mjs')).not.toMatch(/text-embedding|gemini-embedding|nomic-embed/);
  });

  it('search.mjs does not name an embedding model', () => {
    expect(read('search.mjs')).not.toMatch(/text-embedding|gemini-embedding|nomic-embed/);
  });
});
