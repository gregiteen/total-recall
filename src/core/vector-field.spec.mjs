// @vitest-environment node
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createFieldFixture } from '../../fixtures/vector-field/brain.mjs';
import { compileField, sampleField, loadField, rankWithField, fieldStats } from './vector-field.mjs';
import { readAccess, recordAccess } from './access-ledger.mjs';
import { getEmbedding } from './embeddings.mjs';

vi.mock('./logger.mjs', () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } }));
vi.mock('./embeddings.mjs', async importOriginal => ({
  ...await importOriginal(), getEmbedding: vi.fn(async () => [1, ...Array(767).fill(0)]),
}));

describe('vector field compilation and live ledger ranking', () => {
  let root, fixture;
  beforeEach(() => {
    vi.clearAllMocks();
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'tr-field-'));
    fixture = createFieldFixture(root);
    vi.spyOn(Date, 'now').mockReturnValue(Date.parse('2026-11-09T20:00:00Z'));
  });
  afterEach(() => { vi.restoreAllMocks(); fs.rmSync(root, { recursive: true, force: true }); });

  it('compiles only existing active vectors from embeddings.db into the supplied derived directory', async () => {
    const before = fs.readFileSync(path.join(fixture.derivedDir, 'embeddings.db'));
    const field = await compileField(fixture);
    expect(field.points.map(point => point.slug).sort()).toEqual([
      'a-stale-guide', 'b-current-guide', 'c-recovery-policy', 'd-storage-guide',
    ]);
    expect(field.meta).toMatchObject({ embedded_new: 0, embedded_cached: 4, missing_embeddings: 1 });
    expect(field.dimensions).toBe(768);
    expect(getEmbedding).not.toHaveBeenCalled();
    expect(fs.readFileSync(path.join(fixture.derivedDir, 'embeddings.db'))).toEqual(before);
    expect(loadField(fixture.derivedDir)).toEqual(field);
    expect(fieldStats(fixture.derivedDir)).toMatchObject({ compiled: true, points: 4 });
    expect(sampleField).toBeTypeOf('function');
    expect(fs.existsSync(path.join(fixture.derivedDir, 'query-log.jsonl'))).toBe(false);
  });

  it('preserves both halves of the covariance matrix and self coupling', async () => {
    const field = await compileField(fixture);
    field.covariance.forEach((row, i) => row.forEach((value, j) => {
      expect(value).toBeCloseTo(field.covariance[j][i], 6);
      if (i === j) expect(value).toBe(1);
    }));
    expect(field.covariance[1][0]).toBeGreaterThan(.9);
  });

  it('refreshes HTTP field samples from the ledger and records returned memories in that ledger', async () => {
    const field = await compileField(fixture);
    recordAccess(fixture.derivedDir, ['a-stale-guide'], new Date('2026-11-09T12:00:00Z'));
    const before = readAccess(fixture.derivedDir);
    const { results } = await sampleField({ query: 'rollback', field, derivedDir: fixture.derivedDir, topK: 4 });
    expect(getEmbedding).toHaveBeenCalledExactlyOnceWith('rollback');
    const used = results.find(result => result.slug === 'a-stale-guide');
    expect(used).toMatchObject({ access_count: 1, velocity: .1, trajectory: .1, time_since_access_hours: 0 });
    for (const result of results) {
      expect(readAccess(fixture.derivedDir)[result.slug].count).toBe((before[result.slug]?.count || 0) + 1);
    }
    expect(fs.existsSync(path.join(fixture.derivedDir, 'query-log.jsonl'))).toBe(false);
  });

  it('feeds count, velocity, trajectory, novelty and active-day decay from the ledger', async () => {
    const field = await compileField(fixture);
    const current = field.points.find(point => point.slug === 'b-current-guide');
    expect(current).toMatchObject({ access_count: 10, velocity: 1, trajectory: 1, time_since_access: 0 });
    expect(current.last_accessed).toBe(Date.parse('2026-11-09T12:00:00Z'));
    expect(current.novelty).toBeLessThan(1);
    expect(field.points[0].time_since_access).toBe(3 * 86400000);
    const candidates = [{ slug: 'a-stale-guide', score: .6 }, { slug: current.slug, score: .6 }];
    const ranked = rankWithField(candidates, { field, derivedDir: fixture.derivedDir });
    expect(ranked[0].slug).toBe(current.slug);
    const score = ranked[0].score;
    recordAccess(fixture.derivedDir, ['a-stale-guide'], new Date('2026-11-10T12:00:00Z'));
    const refreshed = rankWithField(candidates, { field, derivedDir: fixture.derivedDir, now: Date.parse('2026-11-10T20:00:00Z') });
    expect(refreshed.find(result => result.slug === current.slug).score).toBeLessThan(score);
    expect(candidates[0].score).toBe(.6);
  });

  it('preserves sessions and candidates without vectors, and never writes access', async () => {
    const field = await compileField(fixture);
    const before = readAccess(fixture.derivedDir);
    const results = [{ slug: 'e-unembedded', score: .7 }, { type: 'session', key: 's', score: .9 }];
    expect(rankWithField(results, { field, derivedDir: fixture.derivedDir })).toEqual([results[1], results[0]]);
    expect(readAccess(fixture.derivedDir)).toEqual(before);
  });

  it('does not reuse another brain with the same field mtime; corrupt and absent fields are explicit', async () => {
    await compileField(fixture);
    const other = path.join(root, 'other'); fs.mkdirSync(other);
    const file = path.join(other, 'vector-field.json');
    fs.writeFileSync(file, JSON.stringify({ points: [], covariance: [], slugIndex: [] }));
    const first = path.join(fixture.derivedDir, 'vector-field.json');
    fs.utimesSync(first, 1000, 1000); fs.utimesSync(file, 1000, 1000);
    expect(loadField(fixture.derivedDir).points).toHaveLength(4);
    expect(loadField(other).points).toHaveLength(0);
    fs.writeFileSync(file, '{ broken'); expect(loadField(other)).toBeNull();
    fs.writeFileSync(file, JSON.stringify({ points: [{}], covariance: [] })); expect(loadField(other)).toBeNull();
    expect(loadField(path.join(root, 'absent'))).toBeNull();
    expect(() => rankWithField([], {})).toThrow('not compiled');
  });

  it('handles missing embeddings without creating a database or calling a provider', async () => {
    const derivedDir = path.join(root, 'empty');
    const field = await compileField({ vaultDir: fixture.vaultDir, derivedDir });
    expect(field.points).toEqual([]);
    expect(field.meta.missing_embeddings).toBe(5);
    expect(fs.existsSync(path.join(derivedDir, 'embeddings.db'))).toBe(false);
  });
});
