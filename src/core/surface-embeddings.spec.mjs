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
