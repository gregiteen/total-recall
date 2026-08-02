import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';

vi.mock('./logger.mjs', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import fs from 'fs';
import os from 'os';
import path from 'path';
import { fastSearch } from './fast-recall.mjs';
import { buildMemoryLayerIndex, MEMORY_LAYERS, inferMemoryLayer } from './memory-layers.mjs';

/**
 * Performance benchmarks — SSSS_SOVEREIGN_AI_OS Phase 5.
 *
 * Requirement: "Log semantic search latency, ensuring local cache hits stay
 * under 50ms."
 *
 * Only the *local cache* path is measured. Anything that calls an embedding
 * provider is network-bound and its latency says nothing about this codebase;
 * asserting a wall-clock bound on it would produce a test that fails on a slow
 * connection and passes on a fast one, which is worse than no test.
 */

const BUDGET_MS = 50;
const NODE_COUNT = 2000;

// Deliberately modest. An earlier version ran 50 iterations across three
// benchmarks and pegged the CPU long enough to destabilise the wall-clock
// assertions in throttled-fetch.spec.mjs — the exact contention `fileParallelism:
// false` exists to prevent. A benchmark that makes the rest of the suite flaky is
// a net negative no matter what it measures: nobody can tell a real regression
// from noise. 12 samples still separates ~8ms from a 50ms budget decisively.
const ITERATIONS = 12;

let derivedDir;
let vaultDir;

/** Percentile over a sorted-in-place copy — p95, not mean, is what a budget is about. */
function percentile(samples, p) {
  const sorted = [...samples].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))];
}

function measure(fn, iterations = ITERATIONS) {
  // Warm up: the first call pays for lazy module init and cold file reads, which
  // is not what "cache hit" means.
  for (let i = 0; i < 3; i++) fn();
  const samples = [];
  for (let i = 0; i < iterations; i++) {
    const t0 = performance.now();
    fn();
    samples.push(performance.now() - t0);
  }
  return { p50: percentile(samples, 0.5), p95: percentile(samples, 0.95), max: Math.max(...samples) };
}

beforeAll(() => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'tr-perf-'));
  derivedDir = path.join(root, 'memory-derived');
  vaultDir = path.join(root, 'memory-vault');
  fs.mkdirSync(derivedDir, { recursive: true });
  fs.mkdirSync(vaultDir, { recursive: true });

  const categories = ['facts', 'patterns', 'decisions', 'invariants', 'concepts'];
  const lines = [];
  for (let i = 0; i < NODE_COUNT; i++) {
    lines.push(JSON.stringify({
      slug: `perf-node-${i}`,
      title: `Performance fixture node ${i} about deployment and caching`,
      category: categories[i % categories.length],
      importance: (i % 5) + 1,
      modality: i % 3 === 0 ? 'must' : 'should',
      tags: [`tag-${i % 20}`, 'perf'],
      body: `Node ${i} body text mentioning vault, embeddings, and semantic search.`,
      x_memory_layer: MEMORY_LAYERS[i % MEMORY_LAYERS.length],
    }));
  }
  fs.writeFileSync(path.join(derivedDir, 'memory-layers.jsonl'), lines.join('\n'));
});

afterAll(() => {
  try { fs.rmSync(path.dirname(derivedDir), { recursive: true, force: true }); } catch { /* temp dir */ }
});

describe('local cache hit latency', () => {
  it(`fastSearch over ${NODE_COUNT} nodes stays under ${BUDGET_MS}ms at p95`, () => {
    const stats = measure(() => fastSearch('deployment caching', { derivedDir, vaultDir, top_k: 5 }));
    // eslint-disable-next-line no-console -- the requirement is explicitly to LOG latency
    console.log(`[bench] fastSearch p50=${stats.p50.toFixed(2)}ms p95=${stats.p95.toFixed(2)}ms max=${stats.max.toFixed(2)}ms (n=${NODE_COUNT})`);
    expect(stats.p95).toBeLessThan(BUDGET_MS);
  });

  it('stays under budget with filters applied', () => {
    // Filters run per-line inside the same scan, so a filtered query must not be
    // dramatically slower than an unfiltered one.
    const stats = measure(() => fastSearch('vault', {
      derivedDir, vaultDir, top_k: 5, category: 'facts', modality: 'must', importance: 3,
    }));
    // eslint-disable-next-line no-console -- benchmark output
    console.log(`[bench] fastSearch+filters p50=${stats.p50.toFixed(2)}ms p95=${stats.p95.toFixed(2)}ms`);
    expect(stats.p95).toBeLessThan(BUDGET_MS);
  });

  it('returns nothing rather than throwing when the cache is absent', () => {
    // A missing index is a cold brain, not an error — and must not be slow either.
    const empty = fs.mkdtempSync(path.join(os.tmpdir(), 'tr-perf-empty-'));
    const t0 = performance.now();
    expect(fastSearch('anything', { derivedDir: empty, vaultDir })).toEqual([]);
    expect(performance.now() - t0).toBeLessThan(BUDGET_MS);
  });

  it('builds the memory-layer routing index under budget', () => {
    const nodes = Array.from({ length: NODE_COUNT }, (_, i) => ({
      slug: `n-${i}`,
      category: 'facts',
      importance: (i % 5) + 1,
      x_memory_layer: MEMORY_LAYERS[i % MEMORY_LAYERS.length],
    }));
    const stats = measure(() => buildMemoryLayerIndex(nodes), 5);
    // eslint-disable-next-line no-console -- benchmark output
    console.log(`[bench] buildMemoryLayerIndex p50=${stats.p50.toFixed(2)}ms p95=${stats.p95.toFixed(2)}ms (n=${NODE_COUNT})`);
    expect(stats.p95).toBeLessThan(BUDGET_MS);
  });

  it('routes every node to a valid layer', () => {
    // Guards the benchmark itself: an index built over nodes that all fall into
    // one layer would be fast for the wrong reason.
    const layers = new Set(MEMORY_LAYERS.map(l => inferMemoryLayer({ x_memory_layer: l })));
    expect(layers.size).toBe(MEMORY_LAYERS.length);
  });
});
