import { describe, it, expect, vi } from 'vitest';
vi.mock('./logger.mjs', () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } }));
import { compileContext, previewContext, capsuleResponse } from './context-compiler.mjs';
import { ruleFingerprint } from './context-policy.mjs';
describe('context compiler required coverage', () => {
  it('keeps all required categories and reports a complete-render overflow', async () => {
    const nodes = ['invariants', 'preferences', 'anti-patterns'].map((category, i) => ({ slug: `n${i}`, category, status: 'active', body: 'constraint '.repeat(100), modality: 'must' }));
    const result = await compileContext({ nodes, budget: { total: 10 } });
    expect(result.ready).toBe(false);
    expect(result.stats.required_ids).toHaveLength(3);
    expect(result.context.match(/constraint/g)).toHaveLength(300);
    expect(result.stats.total_tokens).toBe(Math.ceil(result.context.length / 4));
  });
  it('keeps conditional rules out of an unrelated action but preserves unknown ones', async () => {
    const nodes = [{ slug: 'unknown', category: 'invariants', status: 'active', body: 'always' }, { slug: 'publish', category: 'invariants', status: 'active', body: 'publish only', tags: ['context:action:publish'] }];
    const result = await compileContext({ nodes, actions: ['edit'] });
    expect(result.stats.required_ids).toEqual(['project:unknown']);
    expect(result.context).not.toContain('publish only');
  });
  it('exports a local preview', () => expect(typeof previewContext).toBe('function'));
  it('does not auto-fill a routing capsule with supporting documents', async () => {
    const nodes = [{ slug: 'rule', category: 'invariants', status: 'active', body: 'Keep data.' },
      { slug: 'manual', category: 'facts', status: 'active', body: 'deployment '.repeat(500) }];
    expect((await compileContext({ nodes, query: 'deployment' })).context).not.toContain('manual');
    expect((await compileContext({ nodes, query: 'deployment', includeKnowledge: true })).context).toContain('manual');
  });
  it('uses explicit curation only while the canonical source still matches', async () => {
    const rule = { slug: 'release', category: 'invariants', status: 'active', body: 'Full release constraint.', _layer: 'global' };
    const policy = { slug: 'routing', category: 'decisions', status: 'active', tags: ['context:policy'],
      body: JSON.stringify({ rules: { 'global:release': { source_hash: ruleFingerprint(rule), actions: ['publish'], directive: 'Release constraint.' } } }) };
    expect((await compileContext({ nodes: [rule, policy], actions: ['read'] })).context).toBe('');
    expect((await compileContext({ nodes: [rule, policy], actions: ['publish'] })).context).toContain('Release constraint.');
    expect((await compileContext({ nodes: [{ ...rule, body: 'Changed release constraint.' }, policy], actions: ['read'] })).context).toContain('Changed release constraint.');
    expect((await compileContext({ nodes: [rule, policy], actions: ['unknown'] })).context).toContain('Release constraint.');
  });
  it('rejects invalid, conflicting and expired curation conservatively', async () => {
    const rule = { slug: 'r', category: 'invariants', status: 'active', body: 'Never lose this.' };
    const policy = extra => ({ slug: 'routing', category: 'decisions', status: 'active', tags: ['context:policy'],
      body: JSON.stringify({ rules: { 'project:r': { source_hash: ruleFingerprint(rule), actions: ['publish'], directive: 'Keep this.' } } }), ...extra });
    for (const nodes of [[rule, policy({ expires_at: '2020-01-01' })], [rule, policy({ body: '{}' })],
      [rule, policy({}), policy({ slug: 'conflict' })]]) {
      expect((await compileContext({ nodes, actions: ['read'] })).context).toContain('Never lose this.');
    }
  });
  it('requires a reason and matching source for explicit local exclusions', async () => {
    const rule = { slug: 'foreign', category: 'invariants', status: 'active', body: 'Other product rule.' };
    const policy = reason => ({ slug: 'routing', category: 'decisions', status: 'active', tags: ['context:policy'],
      body: JSON.stringify({ rules: { 'project:foreign': { source_hash: ruleFingerprint(rule), enabled: false, reason } } }) });
    expect((await compileContext({ nodes: [rule, policy('Different product; explicitly disabled locally.')], actions: ['read'] })).context).toBe('');
    expect((await compileContext({ nodes: [rule, policy('')], actions: ['read'] })).context).toContain('Other product rule.');
    expect((await compileContext({ nodes: [{ ...rule, body: 'Changed rule.' }, policy('Different product.')], actions: ['read'] })).context).toContain('Changed rule.');
  });
  it('budgets serialized output and leaves inventories behind an explicit debug flag', async () => {
    const result = await compileContext({ nodes: [{ slug: 'r', category: 'invariants', status: 'active', body: 'Keep data.' }] });
    result.stats.excluded_ids = Array.from({ length: 1000 }, (_, i) => `unused-${i}`);
    const compact = capsuleResponse(result, { total: 300 });
    expect(compact.ready).toBe(true);
    expect(compact.stats.excluded_ids).toBeUndefined();
    expect(compact.stats.total_tokens).toBe(Math.ceil((JSON.stringify(compact).length + 1) / 4));
    const debug = capsuleResponse(result, { total: 300, debug: true });
    expect(debug.ready).toBe(false);
    expect(debug.context).toBe(result.context);
    expect(debug.stats.overflow_tokens).toBeGreaterThan(0);
  });
});
