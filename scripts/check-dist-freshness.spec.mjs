/**
 * The situation this guard exists for: 3.23.0 and 3.23.1 published the mesh
 * access UI as source next to a dashboard bundle built five days earlier, so
 * the dashboard the package actually serves did not have the feature the
 * release was about. `frontend/dist/` is gitignored but listed in `files`, so
 * the tarball silently takes whatever build is on the publishing machine.
 */
import { mkdtemp, mkdir, rm, writeFile, utimes } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { checkDistFreshness, defaultTargets, newestUnder } from './check-dist-freshness.mjs';

let root;

/** Writes a file and pins its mtime, so a case reads as a timeline. */
async function writeAt(relPath, mtime) {
  const full = path.join(root, relPath);
  await mkdir(path.dirname(full), { recursive: true });
  await writeFile(full, 'x');
  await utimes(full, mtime, mtime);
  return full;
}

const AUG_13 = new Date('2026-08-13T12:05:00Z');
const AUG_15 = new Date('2026-08-15T14:27:00Z');

beforeEach(async () => {
  root = await mkdtemp(path.join(tmpdir(), 'dist-freshness-'));
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

describe('checkDistFreshness', () => {
  // The exact 3.23.1 shape: new source, old bundle.
  it('refuses a bundle older than the sources', async () => {
    await writeAt('frontend/dist/assets/index-old.js', AUG_13);
    await writeAt('frontend/src/pages/MeshPage.tsx', AUG_15);

    const result = await checkDistFreshness(defaultTargets(root));

    expect(result.ok).toBe(false);
    expect(result.reason).toBe('stale-bundle');
    expect(result.source.path).toContain('MeshPage.tsx');
    expect(result.bundle.path).toContain('index-old.js');
  });

  it('accepts a bundle built after the sources', async () => {
    await writeAt('frontend/src/pages/MeshPage.tsx', AUG_13);
    await writeAt('frontend/dist/assets/index-new.js', AUG_15);

    const result = await checkDistFreshness(defaultTargets(root));

    expect(result).toMatchObject({ ok: true, reason: 'current' });
  });

  // A publish with no bundle at all serves an empty dashboard, which is worse
  // than a stale one and reads as a different failure.
  it('refuses a publish with no bundle', async () => {
    await writeAt('frontend/src/pages/MeshPage.tsx', AUG_15);

    const result = await checkDistFreshness(defaultTargets(root));

    expect(result).toMatchObject({ ok: false, reason: 'missing-bundle' });
  });

  // The bundle is rebuilt from more than src/: an index.html or a vite config
  // change alters the output without touching a single source file.
  it('treats index.html and the vite config as sources', async () => {
    await writeAt('frontend/dist/assets/index.js', AUG_13);
    await writeAt('frontend/src/main.tsx', AUG_13);
    await writeAt('frontend/vite.config.ts', AUG_15);

    const result = await checkDistFreshness(defaultTargets(root));

    expect(result.ok).toBe(false);
    expect(result.source.path).toContain('vite.config.ts');
  });

  it('is unbothered by sources that do not exist', async () => {
    await writeAt('frontend/src/main.tsx', AUG_13);
    await writeAt('frontend/dist/assets/index.js', AUG_15);
    // no index.html, no vite.config.ts, no frontend/package.json

    const result = await checkDistFreshness(defaultTargets(root));

    expect(result.ok).toBe(true);
  });
});

describe('newestUnder', () => {
  it('reports the newest file in a tree, not the first', async () => {
    await writeAt('tree/a.js', AUG_13);
    await writeAt('tree/nested/b.js', AUG_15);
    await writeAt('tree/c.js', AUG_13);

    const found = await newestUnder(path.join(root, 'tree'));

    expect(found.path).toContain('b.js');
  });

  // Without this, an npm install inside frontend/ would look like a source
  // edit and fail every publish thereafter.
  it('ignores node_modules', async () => {
    await writeAt('tree/a.js', AUG_13);
    await writeAt('tree/node_modules/pkg/index.js', AUG_15);

    const found = await newestUnder(path.join(root, 'tree'));

    expect(found.path).toContain('a.js');
  });

  it('returns nothing for a path that is not there', async () => {
    expect(await newestUnder(path.join(root, 'absent'))).toBeNull();
  });
});
