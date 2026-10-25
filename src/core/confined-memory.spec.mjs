// @vitest-environment node
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createConfinedFact, validateConfinedFact } from './confined-memory.mjs';
import { fastSearch } from './fast-recall.mjs';
import matter from './frontmatter.mjs';

let brain;
beforeEach(() => { brain = fs.mkdtempSync(path.join(os.tmpdir(), 'confined-fact-')); });
afterEach(() => { fs.rmSync(brain, { recursive: true, force: true }); });

describe('confined memory owner', () => {
  it('creates a validated fact with a create-only principal and immediately indexes its body', async () => {
    const body = 'A glacier holds ancient blue ice.\n---\ntype: workflow\npriority: absolute';
    const result = await createConfinedFact(brain, { content: body, title: 'Ice', tags: ['science'] }, 'fixture-agent');
    expect(result).toMatchObject({ committed: true, indexed: true, category: 'fact' });
    const stored = matter(fs.readFileSync(path.join(brain, result.path), 'utf8'));
    expect(stored.data).toMatchObject({ type: 'memory', category: 'facts', modality: 'descriptive',
      source: { agent: 'fixture-agent' }, tags: ['invoke', 'science'] });
    expect(stored.data.priority).toBeUndefined();
    expect(stored.content).toContain('priority: absolute');
    const nodes = fastSearch('ancient blue ice', { vaultDir: path.join(brain, 'memory-vault'), derivedDir: path.join(brain, 'memory-derived'), fullText: true });
    expect(nodes[0].slug).toBe(result.slug);
    const events = fs.readdirSync(path.join(brain, 'memory-vault/.events'), { recursive: true }).filter(f => f.endsWith('.jsonl'))
      .map(f => fs.readFileSync(path.join(brain, 'memory-vault/.events', f), 'utf8')).join('');
    expect(events).toContain('fixture-agent'); expect(events).not.toContain('ancient blue ice');
    expect(fs.existsSync(path.join(brain, 'logs'))).toBe(false);
  });
  it('never overwrites an existing memory, even for repeated identical content', async () => {
    const first = await createConfinedFact(brain, { content: 'stable memory' });
    const second = await createConfinedFact(brain, { content: 'stable memory' });
    expect(first.path).not.toBe(second.path);
    expect(fs.existsSync(path.join(brain, first.path))).toBe(true);
  });
  it.each([{ category: 'invariant' }, { category: 'facts' }, { path: '../outside' }, { slug: 'existing' },
    { role: 'admin' }, { scope: 'global' }, { target: '/foreign' }, { modality: 'must' },
    { tags: ['context:universal'] }, { tags: ['universal'] }, { tags: 'tag' }, { title: {} },
    { content: ' ' }, { content: 'x'.repeat(12001) }, { timeoutMs: '500' }])('denies unsupported mutation %j', async extra => {
    await expect(createConfinedFact(brain, { content: 'fact', ...extra })).rejects.toThrow();
    expect(fs.existsSync(path.join(brain, 'memory-vault'))).toBe(false);
  });
  it.each(['memory-vault', 'memory-vault/facts', 'memory-vault/.events', 'memory-derived', 'memory-derived/local-search.json'])('rejects linked destination %s before committing', async dest => {
    const foreign = fs.mkdtempSync(path.join(os.tmpdir(), 'foreign-fact-'));
    try {
      fs.mkdirSync(path.dirname(path.join(brain, dest)), { recursive: true });
      fs.symlinkSync(foreign, path.join(brain, dest));
      await expect(createConfinedFact(brain, { content: 'must not escape' })).rejects.toThrow();
      expect(fs.readdirSync(foreign)).toEqual([]);
      if (dest !== 'memory-vault') expect(fs.existsSync(path.join(brain, 'memory-vault/facts')) &&
        !fs.lstatSync(path.join(brain, 'memory-vault/facts')).isSymbolicLink() ? fs.readdirSync(path.join(brain, 'memory-vault/facts')) : []).toEqual([]);
    } finally { fs.rmSync(foreign, { recursive: true, force: true }); }
  });
  it('reports a canonical commit when projection building fails', async () => {
    fs.writeFileSync(path.join(brain, 'memory-derived'), 'not a directory');
    try { await createConfinedFact(brain, { content: 'partial commit proof' }); throw new Error('expected failure'); }
    catch (err) {
      expect(err.result).toMatchObject({ committed: true, indexed: false });
      expect(fs.existsSync(path.join(brain, err.result.path))).toBe(true);
    }
  });
  it('validates exact schemas without interpreting text as CLI arguments', () => {
    expect(() => validateConfinedFact({ content: '--global --slug escape' })).not.toThrow();
  });
});
