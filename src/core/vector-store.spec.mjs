import { describe, it, expect, beforeEach } from 'vitest';
import { VectorStore } from './vector-store.mjs';

// No mocks needed — VectorStore is pure in-memory with no I/O.

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Reference cosine similarity used by search tests. */
function cosineSim(a, b) {
  const dot = a.reduce((sum, v, i) => sum + v * b[i], 0);
  const magA = Math.sqrt(a.reduce((s, v) => s + v * v, 0));
  const magB = Math.sqrt(b.reduce((s, v) => s + v * v, 0));
  return magA && magB ? dot / (magA * magB) : 0;
}

// ---------------------------------------------------------------------------

describe('VectorStore', () => {
  let store;

  beforeEach(() => {
    store = new VectorStore();
  });

  // -------------------------------------------------------------------------
  // constructor
  // -------------------------------------------------------------------------

  describe('constructor', () => {
    it('initialises with an empty vectors Map', () => {
      expect(store.vectors).toBeInstanceOf(Map);
      expect(store.vectors.size).toBe(0);
    });
  });

  // -------------------------------------------------------------------------
  // load
  // -------------------------------------------------------------------------

  describe('load', () => {
    it('loads entries from indexData', () => {
      const indexData = {
        'slug-a': { embedding: [1, 0, 0], chunks: [] },
        'slug-b': { embedding: [0, 1, 0], chunks: [] },
      };

      store.load(indexData);

      expect(store.vectors.size).toBe(2);
      expect(store.vectors.has('slug-a')).toBe(true);
      expect(store.vectors.has('slug-b')).toBe(true);
    });

    it('skips entries whose embedding is not an array', () => {
      const indexData = {
        good: { embedding: [1, 0], chunks: [] },
        bad: { embedding: 'not-an-array', chunks: [] },
        alsobad: { embedding: null, chunks: [] },
        missing: { chunks: [] },
      };

      store.load(indexData);

      expect(store.vectors.size).toBe(1);
      expect(store.vectors.has('good')).toBe(true);
    });

    it('clears previously loaded data before loading new indexData', () => {
      store.load({ old: { embedding: [1, 0], chunks: [] } });
      expect(store.vectors.size).toBe(1);

      store.load({ new1: { embedding: [0, 1], chunks: [] }, new2: { embedding: [1, 1], chunks: [] } });

      expect(store.vectors.has('old')).toBe(false);
      expect(store.vectors.size).toBe(2);
    });

    it('handles null gracefully without throwing', () => {
      expect(() => store.load(null)).not.toThrow();
      expect(store.vectors.size).toBe(0);
    });

    it('handles undefined gracefully without throwing', () => {
      expect(() => store.load(undefined)).not.toThrow();
      expect(store.vectors.size).toBe(0);
    });
  });

  // -------------------------------------------------------------------------
  // add
  // -------------------------------------------------------------------------

  describe('add', () => {
    it('adds a new vector entry', () => {
      store.add('doc-1', [1, 0, 0], ['chunk text']);

      expect(store.vectors.has('doc-1')).toBe(true);
      const entry = store.vectors.get('doc-1');
      expect(entry.embedding).toEqual([1, 0, 0]);
      expect(entry.chunks).toEqual(['chunk text']);
    });

    it('overwrites an existing entry for the same slug', () => {
      store.add('doc-1', [1, 0, 0], ['old chunk']);
      store.add('doc-1', [0, 1, 0], ['new chunk']);

      expect(store.vectors.size).toBe(1);
      const entry = store.vectors.get('doc-1');
      expect(entry.embedding).toEqual([0, 1, 0]);
      expect(entry.chunks).toEqual(['new chunk']);
    });

    it('does NOT add an entry when embedding is not an array', () => {
      store.add('doc-bad', 'not-an-array', []);
      expect(store.vectors.has('doc-bad')).toBe(false);
    });

    it('does NOT add an entry when embedding is null', () => {
      store.add('doc-null', null, []);
      expect(store.vectors.has('doc-null')).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // delete
  // -------------------------------------------------------------------------

  describe('delete', () => {
    it('removes an existing slug from the map', () => {
      store.add('doc-1', [1, 0], []);
      store.delete('doc-1');
      expect(store.vectors.has('doc-1')).toBe(false);
    });

    it('does not throw when deleting a slug that does not exist', () => {
      expect(() => store.delete('nonexistent')).not.toThrow();
    });
  });

  // -------------------------------------------------------------------------
  // search
  // -------------------------------------------------------------------------

  describe('search', () => {
    it('returns an empty array when the store is empty', () => {
      const results = store.search([1, 0, 0], 5, null, cosineSim);
      expect(results).toEqual([]);
    });

    it('returns null/empty when queryEmbedding is null', () => {
      store.add('doc-1', [1, 0, 0], []);
      const results = store.search(null, 5, null, cosineSim);
      expect(results == null || results.length === 0).toBe(true);
    });

    it('ranks results by descending cosine similarity', () => {
      // doc-a is nearly identical to query; doc-b is orthogonal
      const query = [1, 0, 0];
      store.add('doc-a', [1, 0, 0], []);
      store.add('doc-b', [0, 1, 0], []);
      store.add('doc-c', [0.9, 0.1, 0], []);

      const results = store.search(query, 3, null, cosineSim);

      expect(results.length).toBeGreaterThan(0);
      // First result must be the most similar slug
      expect(results[0].slug).toBe('doc-a');
      // Scores must be in descending order
      for (let i = 1; i < results.length; i++) {
        expect(results[i - 1].score).toBeGreaterThanOrEqual(results[i].score);
      }
    });

    it('limits results to topK', () => {
      store.add('a', [1, 0, 0], []);
      store.add('b', [0, 1, 0], []);
      store.add('c', [0, 0, 1], []);
      store.add('d', [1, 1, 0], []);

      const results = store.search([1, 0.5, 0], 2, null, cosineSim);

      expect(results.length).toBeLessThanOrEqual(2);
    });

    it('filterSet restricts which slugs can appear in results', () => {
      store.add('allowed', [1, 0, 0], []);
      store.add('blocked', [1, 0, 0], []); // same similarity — should still be excluded

      const filterSet = new Set(['allowed']);
      const results = store.search([1, 0, 0], 10, filterSet, cosineSim);

      const returnedSlugs = results.map((r) => r.slug);
      expect(returnedSlugs).not.toContain('blocked');
      expect(returnedSlugs).toContain('allowed');
    });

    it('returns all entries when filterSet is null (no filtering)', () => {
      store.add('x', [1, 0], []);
      store.add('y', [0, 1], []);

      const results = store.search([1, 0], 10, null, cosineSim);

      const slugs = results.map((r) => r.slug);
      expect(slugs).toContain('x');
      expect(slugs).toContain('y');
    });

    it('considers chunk embeddings and uses the max similarity (chunk beats parent)', () => {
      const query = [0, 0, 1]; // points in z direction

      // Parent embedding is far from query; chunk embedding is close
      const parentEmbedding = [1, 0, 0]; // orthogonal to query
      const chunkEmbedding = [0, 0, 1]; // identical to query

      store.add('doc-chunks', parentEmbedding, [
        { embedding: chunkEmbedding, text: 'relevant chunk' },
      ]);
      store.add('doc-no-chunks', [1, 0, 0], []); // only parent, far from query

      const results = store.search(query, 5, null, cosineSim);

      // doc-chunks should rank higher because its chunk embedding matches the query
      const chunkDoc = results.find((r) => r.slug === 'doc-chunks');
      const noChunkDoc = results.find((r) => r.slug === 'doc-no-chunks');

      expect(chunkDoc).toBeDefined();
      if (noChunkDoc) {
        expect(chunkDoc.score).toBeGreaterThan(noChunkDoc.score);
      }
    });

    it('result entries include slug and score fields', () => {
      store.add('doc-1', [1, 0], []);

      const results = store.search([1, 0], 5, null, cosineSim);

      expect(results.length).toBe(1);
      expect(results[0]).toHaveProperty('slug', 'doc-1');
      expect(results[0]).toHaveProperty('score');
      expect(typeof results[0].score).toBe('number');
    });

    it('vector most similar to query is ranked first', () => {
      const query = [3, 4, 0]; // 53° in XY plane

      // doc-close: 45° angle → higher similarity
      store.add('doc-close', [1, 1, 0], []);
      // doc-far: 90° from query
      store.add('doc-far', [0, 0, 1], []);
      // doc-exact: same direction → similarity = 1
      store.add('doc-exact', [3, 4, 0], []);

      const results = store.search(query, 10, null, cosineSim);

      expect(results[0].slug).toBe('doc-exact');
      expect(results[results.length - 1].slug).toBe('doc-far');
    });
  });
});
