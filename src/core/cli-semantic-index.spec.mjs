import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';

vi.mock('./embeddings.mjs', async importOriginal => ({
  ...await importOriginal(),
  getEmbedding: vi.fn(async text => {
    const vector = new Array(768).fill(0);
    const isRemember = text.startsWith('total-recall remember:') || text === 'remember facts in vault';
    vector[isRemember ? 0 : 1] = 1;
    return vector;
  }),
}));

vi.mock('./logger.mjs', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import {
  harvestAllCliVerbs,
  hashVerb,
  buildCliSemanticIndex,
  loadCliSemanticIndex,
  queryCliSemanticIndex
} from './cli-semantic-index.mjs';

let tempDir;

describe('CLI Semantic Index', () => {
  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tr-cli-index-'));
  });

  afterEach(() => {
    vi.restoreAllMocks();
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('harvests built-in core commands and discovered plugins', () => {
    const verbs = harvestAllCliVerbs({ projectRoot: process.cwd() });
    expect(verbs.length).toBeGreaterThan(100);

    const rememberVerb = verbs.find(v => v.id === 'core:remember');
    expect(rememberVerb).toBeDefined();
    expect(rememberVerb.verb).toBe('total-recall remember');
    expect(rememberVerb.category).toBe('core');
    expect(rememberVerb.hash).toBeDefined();
  });

  it('computes deterministic hash for verbs', () => {
    const v1 = { id: 'test', verb: 'total-recall test', description: 'Desc', usage: 'Usage' };
    const v2 = { id: 'test', verb: 'total-recall test', description: 'Desc', usage: 'Usage' };
    expect(hashVerb(v1)).toBe(hashVerb(v2));
  });

  it('builds the semantic index and skips unchanged verbs', async () => {
    // Both builds read one snapshot: the live inventory changes whenever another
    // session edits a plugin manifest, and that must not fail this test.
    const snapshot = harvestAllCliVerbs({ projectRoot: process.cwd() });
    const harvest = () => snapshot;
    const firstBuild = await buildCliSemanticIndex({
      derivedDir: tempDir,
      projectRoot: process.cwd(),
      force: true,
      harvest
    });
    expect(firstBuild.total).toBeGreaterThan(100);
    expect(firstBuild.built).toBeGreaterThan(0);

    const index = loadCliSemanticIndex(tempDir);
    expect(index).toBeDefined();
    expect(index.verbs.length).toBe(firstBuild.total);

    // Second build without force should skip all unchanged
    const secondBuild = await buildCliSemanticIndex({
      derivedDir: tempDir,
      projectRoot: process.cwd(),
      force: false,
      harvest
    });
    expect(secondBuild.skipped).toBe(firstBuild.total);
    expect(secondBuild.built).toBe(0);
  });

  it('rebuilds only the verb whose content changed', async () => {
    const snapshot = harvestAllCliVerbs({ projectRoot: process.cwd() });
    await buildCliSemanticIndex({ derivedDir: tempDir, force: true, harvest: () => snapshot });
    const changed = snapshot.map((verb, i) => (i === 0 ? { ...verb, hash: 'changed' } : verb));
    const rebuilt = await buildCliSemanticIndex({ derivedDir: tempDir, force: false, harvest: () => changed });
    expect(rebuilt.built).toBe(1);
    expect(rebuilt.skipped).toBe(snapshot.length - 1);
  });

  it('queries the semantic index with hybrid search', async () => {
    await buildCliSemanticIndex({
      derivedDir: tempDir,
      projectRoot: process.cwd(),
      force: true
    });

    const results = await queryCliSemanticIndex('remember facts in vault', {
      derivedDir: tempDir,
      limit: 5
    });

    expect(results.length).toBeGreaterThan(0);
    const topResult = results[0];
    expect(topResult.verb).toBe('total-recall remember');
    expect(topResult.score).toBeGreaterThan(0.3);
  });

  it('gracefully falls back to keyword matching when embeddings are unavailable', async () => {
    const originalDisabled = process.env.TR_EMBEDDINGS_DISABLED;
    process.env.TR_EMBEDDINGS_DISABLED = '1';

    try {
      const results = await queryCliSemanticIndex('daemon worker status', {
        derivedDir: tempDir,
        limit: 5
      });
      expect(results.length).toBeGreaterThan(0);
      const daemonResult = results.find(r => r.name === 'daemon');
      expect(daemonResult).toBeDefined();
    } finally {
      if (originalDisabled === undefined) {
        delete process.env.TR_EMBEDDINGS_DISABLED;
      } else {
        process.env.TR_EMBEDDINGS_DISABLED = originalDisabled;
      }
    }
  });

  it('uses current command metadata and skips query embedding for a lexical-only index', async () => {
    const verb = { id: 'core:status', name: 'status', verb: 'total-recall status', description: 'Old daemon status.' };
    const old = { ...verb, hash: hashVerb(verb) };
    const retired = { ...old, id: 'plugin:retired:status', verb: 'total-recall retired status' };
    await buildCliSemanticIndex({ derivedDir: tempDir, semantic: false, harvest: () => [old, retired] });
    const updated = { ...verb, description: 'Current daemon status.' };
    updated.hash = hashVerb(updated);
    const embed = vi.fn(async () => new Array(768).fill(.2));
    const results = await queryCliSemanticIndex('status', { derivedDir: tempDir, harvest: () => [updated], embed });
    expect(embed).not.toHaveBeenCalled();
    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({ description: 'Current daemon status.', vectorScore: null });
  });
});
