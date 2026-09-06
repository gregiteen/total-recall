import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { compileEvolvingContext } from './evolving-context.mjs';
import { loadSectionCache } from './context-cache.mjs';

describe('compileEvolvingContext', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'evolving-context-test-'));
  });

  afterEach(() => {
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch {}
  });

  const sampleNodes = [
    {
      category: 'user-projects',
      slug: 'project-alpha',
      title: 'Alpha Science Pipeline',
      description: 'Decentralized compute engine',
      source: { repo_path: '/repos/alpha' },
      enables: ['superconducting-logic'],
      status: 'active'
    },
    {
      category: 'benchmarks',
      slug: 'record-coherence',
      title: 'Qubit Coherence Time',
      source: {
        metric_name: 't2_coherence_ms',
        current_record: '120',
        unit: 'ms',
        previous_record: '80',
        verification_status: 'verified_peer_reviewed',
        doi: '10.1038/s41567-026-001'
      },
      status: 'active'
    },
    {
      category: 'frontier-capabilities',
      slug: 'room-temp-nv-spin',
      title: 'Room-Temperature Diamond Spin Coherence',
      description: 'Achieved 10-second coherence at 300K',
      timestamp: '2026-09-01T12:00:00Z',
      source: { epistemic_tier: 2, empirical_modality: 'experimental', doi: '10.1038/s41586-026-002' },
      enables: ['room-temp-quantum-repeater'],
      status: 'active'
    }
  ];

  it('compiles context, records cache misses on first run, and creates evolving-context.md', async () => {
    const res = await compileEvolvingContext({
      derivedDir: tmpDir,
      nodes: sampleNodes
    });

    expect(res.cacheMisses).toBe(3); // projects, benchmarks, breakthroughs
    expect(res.cacheHits).toBe(0);
    expect(res.content).toContain('Alpha Science Pipeline');
    expect(res.content).toContain('Qubit Coherence Time');
    expect(res.content).toContain('Room-Temperature Diamond Spin Coherence');

    const written = fs.readFileSync(path.join(tmpDir, 'evolving-context.md'), 'utf8');
    expect(written).toBe(res.content);

    const cache = loadSectionCache(tmpDir);
    expect(cache.user_projects).toBeDefined();
    expect(cache.benchmark_ledger).toBeDefined();
    expect(cache.breakthroughs).toBeDefined();
  });

  it('leverages section-level cache hits on subsequent identical compilation', async () => {
    // First compile
    await compileEvolvingContext({
      derivedDir: tmpDir,
      nodes: sampleNodes
    });

    // Second compile with same nodes
    const secondRes = await compileEvolvingContext({
      derivedDir: tmpDir,
      nodes: sampleNodes
    });

    expect(secondRes.cacheHits).toBe(3);
    expect(secondRes.cacheMisses).toBe(0);
  });

  it('only recomputes the dirty section when a single category node is added', async () => {
    await compileEvolvingContext({
      derivedDir: tmpDir,
      nodes: sampleNodes
    });

    const updatedNodes = [
      ...sampleNodes,
      {
        category: 'benchmarks',
        slug: 'record-fidelity',
        title: 'Gate Fidelity',
        source: {
          metric_name: 'two_qubit_fidelity',
          current_record: '99.99',
          unit: '%'
        },
        status: 'active'
      }
    ];

    const thirdRes = await compileEvolvingContext({
      derivedDir: tmpDir,
      nodes: updatedNodes
    });

    expect(thirdRes.cacheHits).toBe(2); // projects and breakthroughs remain cached
    expect(thirdRes.cacheMisses).toBe(1); // benchmarks recomputed
    expect(thirdRes.content).toContain('two_qubit_fidelity');
  });

  it('enforces budget constraints and respects sliding window limit', async () => {
    const historicalBreakthroughs = Array.from({ length: 10 }, (_, i) => ({
      category: 'frontier-capabilities',
      slug: `breakthrough-${i}`,
      title: `Breakthrough ${i}`,
      timestamp: `2026-08-${String(i + 1).padStart(2, '0')}T00:00:00Z`,
      description: `Description for ${i}`,
      status: 'active'
    }));

    const res = await compileEvolvingContext({
      derivedDir: tmpDir,
      nodes: historicalBreakthroughs,
      slidingWindowLimit: 3
    });

    // Only 3 most recent breakthroughs should be included
    expect(res.content).toContain('Breakthrough 9');
    expect(res.content).toContain('Breakthrough 8');
    expect(res.content).toContain('Breakthrough 7');
    expect(res.content).not.toContain('Breakthrough 0');
  });
});
