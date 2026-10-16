import { describe, it, expect, vi } from 'vitest';

vi.mock('./logger.mjs', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import fs from 'fs';
import path from 'path';

/**
 * Regression guards for the silent vector-index wipe.
 *
 * A project brain sat at 520 nodes / 0 embeddings for an unknown length of time
 * while `total-recall compile` printed "Rebuilt …", "Post-build verification
 * passed: 0 drift", "Rebuild completed successfully" and exited 0. Two causes:
 *   1. `rebuild` did `fs.rmSync(derivedDir)` — deleting embeddings.db outright.
 *   2. `compileSurface` rebuilt embeddings fire-and-forget with a bare
 *      `.catch(() => {})`, so the CLI exited before a single vector was written,
 *      and `semanticResult` was a hardcoded literal no code path could update.
 */

const read = (p) => fs.readFileSync(path.join(process.cwd(), p), 'utf8');

describe('compileSurface embedding build', () => {
  const src = () => read('src/core/surface.mjs');

  it('awaits the build instead of detaching it', () => {
    // Detached, the CLI process exits first and nothing is ever written.
    expect(src()).toMatch(/await buildEmbeddingsIndex\(nodes, derivedDir\)/);
  });

  it('does not swallow embedding errors', () => {
    expect(src()).not.toMatch(/buildEmbeddingsIndex\([^)]*\)\.catch\(\(\) => \{\}\)/);
    expect(src()).toMatch(/Embedding index build FAILED/);
  });

  it('reports the real result rather than a hardcoded literal', () => {
    // `semanticIndexed` must come from the build, not from the initial value.
    expect(src()).toMatch(/indexed: built\.built/);
    expect(src()).toMatch(/semanticFailed: semanticResult\.failed/);
  });
});

describe('rebuild derived-index discard', () => {
  const src = () => read('src/cli/rebuild.mjs');

  it('never deletes the whole derived directory', () => {
    expect(src()).not.toMatch(/fs\.rmSync\(derivedDir, \{ recursive: true, force: true \}\)/);
  });

  it('preserves embeddings.db across a rebuild', () => {
    // Each vector costs a provider call; the index is content-hash incremental
    // and self-prunes, so discarding it is pure loss.
    expect(src()).toMatch(/entry\.startsWith\('embeddings\.db'\)/);
  });

  it('prints vector coverage so an empty index cannot read as success', () => {
    expect(src()).toMatch(/Vector search is OFF/);
    expect(src()).toMatch(/Embeddings: \$\{stats\.semanticIndexed\}/);
  });
});

describe('embedding provenance', () => {
  const src = () => read('src/core/embeddings.mjs');

  it('exposes the serving provider and model, not just the vector', () => {
    expect(src()).toMatch(/export async function getEmbeddingWithProvenance/);
    expect(src()).toMatch(/return \{ embedding, provider, model: servedBy \}/);
  });

  it('keeps getEmbedding returning a bare vector for existing callers', () => {
    expect(src()).toMatch(/const \{ embedding \} = await getEmbeddingWithProvenance\(text, model\);\n\s+return embedding;/);
  });

  it('stamps rows with the model that served them, never the requested default', () => {
    // Ollama answers first and reports a model discovered from the server, so a
    // row labelled with the hosted default made provenance — and whether the text
    // ever left the machine — unreadable.
    const s = src();
    expect(s).not.toMatch(/\.run\(node\.slug, model, now, contentHash, embeddingJson\)/);
    expect(s).toMatch(/\.run\(node\.slug, servedModel \|\| model, now, contentHash, embeddingJson\)/);
    expect(s).not.toMatch(/snippet, model, new Date\(\)\.toISOString\(\), JSON\.stringify\(embedding\)\)/);
    expect(s).toMatch(/snippet, servedModel \|\| model, new Date\(\)\.toISOString\(\), JSON\.stringify\(embedding\)\)/);
  });

  it('labels each provider with the model that provider actually defaults to', () => {
    const s = src();
    expect(s).toMatch(/provider = 'ollama'; servedBy = ollamaModel;/);
    expect(s).toMatch(/provider = 'openrouter'; servedBy = 'openai\/text-embedding-3-small';/);
    expect(s).toMatch(/provider = 'openai'; servedBy = 'text-embedding-3-small';/);
    // Google resolves its model internally, so record the resolved name.
    expect(s).toMatch(/provider = 'google'; servedBy = await resolveEmbeddingModel\(model\);/);
  });
});
