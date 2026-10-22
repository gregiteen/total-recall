import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import path from 'node:path';
import fs from 'node:fs';

vi.mock('./config.mjs', async importOriginal => ({
  ...await importOriginal(),
  googleApiKey: 'auth-fixture-key',
  openAiApiKey: undefined
}));

vi.mock('./logger.mjs', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

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
  harvestAllCliVerbs,
  hashVerb,
  buildCliSemanticIndex,
  loadCliSemanticIndex,
  queryCliSemanticIndex
} from './cli-semantic-index.mjs';

const tempDir = path.join(process.cwd(), '.agent/memory-derived-cli-test');

describe('CLI Semantic Index', () => {
  beforeEach(() => {
    fs.mkdirSync(tempDir, { recursive: true });
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
    const firstBuild = await buildCliSemanticIndex({
      derivedDir: tempDir,
      projectRoot: process.cwd(),
      force: true
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
      force: false
    });
    expect(secondBuild.skipped).toBe(firstBuild.total);
    expect(secondBuild.built).toBe(0);
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
});
