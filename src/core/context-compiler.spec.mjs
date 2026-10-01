import { describe, it, expect, vi } from 'vitest';
vi.mock('./logger.mjs', () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } }));
import { compileContext, previewContext } from './context-compiler.mjs';
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
});
