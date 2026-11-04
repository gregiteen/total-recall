import { describe, it, expect } from 'vitest';
import { compactRules, summarizeRule } from './context-compactor.mjs';
import { estimateTokens } from './context-policy.mjs';

const header = (counts, tokens) => `compacted:true tokens:${tokens} rules:${counts.rules} full:${counts.full} summarized:${counts.summarized} referenced:${counts.referenced} duplicate:${counts.duplicate} omitted:${counts.omitted}`;
const rule = (slug, words, extra = {}) => {
  const body = `${slug} must hold. ${Array.from({ length: words }, (_, i) => `${slug}word${i}`).join(' ')}.`;
  return { slug, body, text: `## ${slug} [${slug}]\n\n${body}`, score: 0, ...extra };
};
const rules = Array.from({ length: 60 }, (_, i) => rule(`rule-${String(i).padStart(2, '0')}`, 60, { score: (60 - i) / 60 }));
const total = counts => counts.full + counts.summarized + counts.referenced + counts.duplicate + counts.omitted;

describe('compactRules', () => {
  it.each([60, 120, 500, 2000, 4000, 20000])('fits budget %i and accounts for every rule', budget => {
    const { context, counts, tokens } = compactRules(rules, { budget, header });
    expect(tokens).toBeLessThanOrEqual(budget);
    expect(estimateTokens(`${context}\n`)).toBe(tokens);
    expect(total(counts)).toBe(rules.length);
  });
  it('reports its own measured size in the header', () => {
    const { context, tokens } = compactRules(rules, { budget: 2000, header });
    expect(context.split('\n')[0]).toContain(`tokens:${tokens}`);
  });
  it('gives the top rule real text at a small budget instead of only slugs', () => {
    const { tiers } = compactRules(rules, { budget: 300, header });
    expect(['full', 'summary']).toContain(tiers['rule-00']);
  });
  it('prints everything in full when the budget allows', () => {
    const { counts } = compactRules(rules, { budget: 100000, header });
    expect(counts.full).toBe(rules.length);
  });
  it('only ever prints words from the rule', () => {
    const { context } = compactRules(rules, { budget: 2000, header });
    const source = new Set(rules.flatMap(r => r.text.split(/\s+/)));
    const printed = context.split('\n').slice(1).join(' ').replace(/Referenced:|---|\[|\]|,|…/g, ' ').split(/\s+/).filter(Boolean);
    const known = word => [...source].some(s => s.replace(/[[\]]/g, '').includes(word));
    expect(printed.filter(word => !known(word))).toEqual([]);
  });
  it('orders text by relevance, not by priority', () => {
    const absolute = rule('zz-absolute', 60, { priority: 'absolute', score: 0 });
    const relevant = rule('aa-relevant', 60, { score: 1 });
    const { tiers, context } = compactRules([absolute, relevant], { budget: 400, header });
    expect(tiers['aa-relevant']).toBe('full');
    expect(tiers['zz-absolute']).not.toBe('full');
    expect(context.indexOf('aa-relevant')).toBeLessThan(context.indexOf('zz-absolute must hold'));
  });
  it('names an absolute rule ahead of more relevant rules when slugs run out', () => {
    const absolute = rule('zz-absolute', 60, { priority: 'absolute', score: 0 });
    const { tiers } = compactRules([...rules, absolute], { budget: 110, header });
    expect(tiers['zz-absolute']).not.toBe('omitted');
  });
  it('drops a near-duplicate to a reference of the rule it repeats', () => {
    const a = rule('alpha', 40, { score: 1, vector: [1, 0] });
    const b = { ...rule('beta', 40, { score: 0.5, vector: [0.999, 0.01] }) };
    const c = rule('gamma', 40, { score: 0.2, vector: [0, 1] });
    const { tiers, context } = compactRules([a, b, c], { budget: 5000, header });
    expect(tiers.beta).toBe('duplicate');
    expect(tiers.gamma).toBe('full');
    expect(context).toContain('beta (of alpha)');
  });
  it('never collapses an absolute rule, even into another absolute rule', () => {
    const a = rule('alpha', 40, { priority: 'absolute', score: 1, vector: [1, 0] });
    const b = rule('beta', 40, { priority: 'absolute', score: 1, vector: [1, 0] });
    const c = rule('gamma', 40, { score: 0.5, vector: [1, 0] });
    const { tiers } = compactRules([a, b, c], { budget: 5000, header });
    expect([tiers.alpha, tiers.beta]).toEqual(['full', 'full']);
    expect(tiers.gamma).toBe('duplicate');
  });
  it('expands a requested rule in full ahead of ranking', () => {
    const { tiers, context } = compactRules(rules, { budget: 400, expand: ['rule-59'], header });
    expect(tiers['rule-59']).toBe('full');
    expect(context).toContain('rule-59word59');
  });
  it('complete mode summarizes absolute rules, names the rest and omits nothing', () => {
    const mixed = rules.map((item, i) => (i >= 50 ? { ...item, priority: 'absolute' } : item));
    const { context, counts, tiers, tokens } = compactRules(mixed, { budget: 2000, complete: true, header });
    expect(tokens).toBeLessThanOrEqual(2000);
    expect(counts.omitted).toBe(0);
    for (const item of mixed.filter(candidate => candidate.priority === 'absolute')) {
      expect(['full', 'summary']).toContain(tiers[item.slug]);
      expect(context).toContain(`${item.slug} must hold.`);
    }
  });
  it('complete mode reports the budget that actually holds every rule', () => {
    let required;
    try { compactRules(rules, { budget: 1, complete: true, header }); } catch (error) { required = error.requiredBudget; }
    expect(required).toBeGreaterThan(1);
    expect(compactRules(rules, { budget: required, complete: true, header }).counts.omitted).toBe(0);
  });
  it('refuses an unknown rule, a budget too small and an expansion that cannot fit', () => {
    expect(() => compactRules(rules, { budget: 400, expand: ['nope'], header })).toThrow(/nope/);
    expect(() => compactRules(rules, { budget: 2, header })).toThrow(/minimum/);
    expect(() => compactRules(rules, { budget: 60, expand: ['rule-01'], header })).toThrow(/expanded rule/);
    try { compactRules(rules, { budget: 2, header }); } catch (error) { expect(error.requiredBudget).toBeGreaterThan(2); }
  });
});

describe('summarizeRule', () => {
  it('keeps short rules whole', () => expect(summarizeRule('Never push.')).toBe('Never push.'));
  it('ends at a sentence and keeps its words', () => {
    const text = `Never push without Greg explicitly telling you to do that first, because pushing costs money. ${'More detail follows here. '.repeat(20)}`;
    expect(summarizeRule(text)).toBe('Never push without Greg explicitly telling you to do that first, because pushing costs money.');
  });
  it('does not end a sentence at e.g. or a version number', () => {
    const text = `Use a real host, e.g. the droplet at version 3.41.3 when it is available and verified by hand. ${'x '.repeat(200)}`;
    expect(summarizeRule(text)).toContain('version 3.41.3 when');
  });
  it('marks a cut with an ellipsis when no sentence fits', () => {
    const summary = summarizeRule('word '.repeat(100));
    expect(summary.endsWith('…')).toBe(true);
    expect(summary.length).toBeLessThanOrEqual(201);
  });
});
