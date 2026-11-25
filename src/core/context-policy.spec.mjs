import { describe, it, expect } from 'vitest';
import { selectRules, assembleContext } from './context-policy.mjs';
const rule = (slug, tags = [], extra = {}) => ({ slug, category: 'invariants', status: 'active', tags, body: slug, ...extra });
describe('explicit context policy', () => {
  it('separates modality from activation and preserves unknown rules', () => {
    const nodes = [rule('unknown'), rule('universal', ['context:universal']), rule('publish', ['context:action:publish'], { modality: 'must' })];
    expect(selectRules(nodes, { actions: ['edit'] }).map(n => n.slug)).toEqual(['universal', 'unknown']);
    expect(selectRules(nodes, { actions: ['publish'] })).toHaveLength(3);
    expect(selectRules(nodes, { bootstrap: true }).map(n => n.slug)).toEqual(['universal']);
    expect(selectRules(nodes, { actions: ['unrecognized'] })).toHaveLength(3);
  });
  it('preserves shared-prefix identities and requires explicit same-subject supersession', () => {
    const body = 'same prefix '.repeat(30);
    const nodes = [rule('a', [], { body, subject: 'one' }), rule('b', [], { body, subject: 'two', supersedes: ['a'] })];
    expect(selectRules(nodes)).toHaveLength(2);
  });
  it('orders rules only by absolute priority, importance, then slug', () => {
    const nodes = [
      rule('zeta', [], { importance: 2 }),
      rule('alpha', [], { importance: 5 }),
      rule('mid', [], { importance: 3 }),
      rule('absolute', [], { priority: 'absolute', importance: 1 }),
      rule('default', []),
    ];
    // Missing importance defaults to 3, so 'default' ties 'mid' and both sort by slug.
    expect(selectRules(nodes).map(n => n.slug)).toEqual(['absolute', 'alpha', 'default', 'mid', 'zeta']);
  });
  it('treats no slug as special: every rule ranks by its fields alone', () => {
    const formerCritical = ['invariants-8cd098fd', 'invariants-dc116371', 'never-ask-for-a-secret-before-searching-all-tr-stores',
      'push-only-on-request', 'report-breakage-then-fix-at-the-source', 'invariants-bbbbec36', 'invariants-5d8df45d',
      'invariants-7780389f', 'rule-total-recall-for-everything-always'];
    for (const slug of formerCritical) {
      const nodes = [rule(slug, [], { importance: 1 }), rule('plain', [], { importance: 5 })];
      expect(selectRules(nodes).map(n => n.slug)).toEqual(['plain', slug]);
      const absolute = [rule(slug), rule('plain', [], { priority: 'absolute' })];
      expect(selectRules(absolute).map(n => n.slug)).toEqual(['plain', slug]);
    }
  });
  it('is stable regardless of input order', () => {
    const nodes = [rule('c', [], { importance: 2 }), rule('a', [], { importance: 2 }), rule('b', [], { priority: 'absolute' }),
      rule('d', [], { importance: 4 }), rule('e', [], { importance: 2 })];
    const forward = selectRules(nodes).map(n => n.slug);
    const reverse = selectRules([...nodes].reverse()).map(n => n.slug);
    expect(forward).toEqual(['b', 'd', 'a', 'c', 'e']);
    expect(reverse).toEqual(forward);
  });
  it('does not drop any required text or falsely claim compliance', () => {
    const result = assembleContext([{ id: 'required', text: 'x'.repeat(100), required: true }], { total: 10 });
    expect(result.ready).toBe(false);
    expect(result.context).toBe('x'.repeat(100));
    expect(result.stats.required_ids).toEqual(['required']);
  });
  it('accounts complete render and excludes optional contributions as units', () => {
    const result = assembleContext([{ id: 'a', text: '## Rules\n\nabc', required: true }, { id: 'plugin', text: 'x'.repeat(100) }], { total: 10 });
    expect(result.stats.total_tokens).toBe(Math.ceil(result.context.length / 4));
    expect(result.stats.excluded_ids).toEqual(['plugin']);
    expect(result.ready).toBe(true);
    const duplicate = assembleContext([{ id: 'plugin:a', text: 'identical' }, { id: 'plugin:a', text: 'identical' }]);
    expect(duplicate.stats.contributions).toHaveLength(1);
  });
  it.each(['read', 'edit', 'test', 'build', 'publish', 'deploy', 'secrets', 'network', 'memory', 'skills', 'project'])('covers all applicable required IDs for %s', action => {
    const nodes = [rule('unknown'), rule('universal', ['context:universal']), rule('specific', [`context:action:${action}`]),
      rule('other-project', [], { project: 'foreign' }), rule('expired', [], { expires_at: '2020-01-01' })];
    const result = selectRules(nodes, { actions: [action], projectRoot: '/fixture/current' });
    expect(new Set(result.map(n => n.slug))).toEqual(new Set(['unknown', 'universal', 'specific']));
  });
});
