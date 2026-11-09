// @vitest-environment node
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createFieldFixture } from '../../fixtures/vector-field/brain.mjs';
import recall, { searchRecallBrain } from './recall.mjs';
import { compileField } from '../core/vector-field.mjs';
import { readAccess } from '../core/access-ledger.mjs';
import { evaluateField } from '../core/field-evaluation.mjs';

vi.mock('../core/brain-registry.mjs', () => ({ readBrainToggles: () => ({}), isBrainEnabled: () => true }));
vi.mock('../core/logger.mjs', () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } }));

const queries = JSON.parse(fs.readFileSync(new URL('../../fixtures/vector-field/queries.json', import.meta.url), 'utf8'));

describe('recall field flag and paired evaluation', () => {
  let root, fixture;
  beforeEach(async () => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'tr-recall-field-'));
    const agentDir = path.join(root, '.agent');
    vi.stubEnv('AGENT_DIR', agentDir);
    fixture = createFieldFixture(path.join(agentDir, 'skills', 'total-recall'));
    vi.spyOn(Date, 'now').mockReturnValue(Date.parse('2026-11-09T20:00:00Z'));
    await compileField(fixture);
  });
  afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); fs.rmSync(root, { recursive: true, force: true }); });

  it('keeps baseline unchanged and re-ranks before top-k with the flag, with no provider call', async () => {
    const options = { ...fixture, top_k: 1 };
    expect((await searchRecallBrain('rollback', options))[0].slug).toBe('a-stale-guide');
    const results = await searchRecallBrain('rollback', { ...options, field: true });
    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({ slug: 'b-current-guide', base_score: .6, body: 'deploy rollback' });
    expect((await searchRecallBrain('rollback', options))[0].slug).toBe('a-stale-guide');
  });

  it('preserves filters and rejects removed or archived canonical memories after ranking', async () => {
    const options = { ...fixture, field: true, top_k: 20 };
    const filtered = await searchRecallBrain('rollback', { ...options, category: 'invariants' });
    expect(filtered.map(result => result.slug)).toEqual(['c-recovery-policy']);
    const file = fixture.nodes.find(node => node.slug === 'b-current-guide')._filePath;
    fs.rmSync(file);
    const results = await searchRecallBrain('rollback', options);
    expect(results.map(result => result.slug).sort()).toEqual(['a-stale-guide', 'c-recovery-policy']);
    expect(await searchRecallBrain('deploy', { ...options, tags: ['absent'] })).toHaveLength(0);
  });

  it('fails explicitly for a requested missing field, but baseline still works', async () => {
    fs.rmSync(path.join(fixture.derivedDir, 'vector-field.json'));
    await expect(searchRecallBrain('deploy', { ...fixture, field: true })).rejects.toThrow('missing or corrupt');
    expect(await searchRecallBrain('deploy', fixture)).not.toHaveLength(0);
  });

  it('runs the compile and evaluate commands against one fixture brain without access writes', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    const before = readAccess(fixture.derivedDir);
    await recall(['--compile-field', '--project']);
    expect(JSON.parse(log.mock.calls.at(-1)[0])[0]).toMatchObject({ brain: 'project', points_compiled: 4 });
    await recall(['--evaluate-field', new URL('../../fixtures/vector-field/queries.json', import.meta.url).pathname,
      '--project', '--top-k', '1', '--format', 'json']);
    const report = JSON.parse(log.mock.calls.at(-1)[0])[0];
    expect(report).toMatchObject({ brain: 'project', mode: 'local', query_count: 4, top_k: 1, default_enabled: false });
    expect(report.baseline_hit_rate).toBe(.5);
    expect(report.field_hit_rate).toBe(.75);
    expect(report.top_k_overlap).toBe(.75);
    expect(readAccess(fixture.derivedDir)).toEqual(before);
    process.stdout.write(`U6 fixture comparison: ${JSON.stringify(report)}\n`);
  });

  it('records only the final flagged recall results in their own brain', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    await recall(['rollback', '--field', '--project', '--top-k', '1', '--format', 'json']);
    expect(JSON.parse(log.mock.calls.at(-1)[0])[0].slug).toBe('b-current-guide');
    const ledger = readAccess(fixture.derivedDir);
    expect(ledger['b-current-guide'].count).toBe(11);
    expect(ledger['a-stale-guide']).toBeUndefined();
  });

  it('uses the same fixed queries in both modes and defines metrics for short or empty results', async () => {
    const search = vi.fn(async (query, field) => query === 'empty' ? [] : [{ slug: field ? 'b' : 'a' }]);
    const report = await evaluateField([{ query: 'one', relevant: ['b'] }, { query: 'empty', relevant: ['a'] }], { search, topK: 2 });
    expect(search.mock.calls).toEqual([['one', false], ['one', true], ['empty', false], ['empty', true]]);
    expect(report).toMatchObject({ top_k_overlap: 0, baseline_hit_rate: 0, field_hit_rate: .5 });
    await expect(evaluateField([], { search })).rejects.toThrow('nonempty');
    await expect(evaluateField([{ query: 'one', relevant: [] }], { search })).rejects.toThrow('nonempty');
    await expect(evaluateField(queries, { search, topK: 0 })).rejects.toThrow('topK');
  });
});
