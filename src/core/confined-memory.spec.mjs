// @vitest-environment node
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createConfinedFact, commitConfinedFact, validateConfinedFact } from './confined-memory.mjs';
import { fastSearch } from './fast-recall.mjs';
import matter from './frontmatter.mjs';

let brain;
beforeEach(() => { brain = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'confined-fact-'))); });
afterEach(() => { vi.restoreAllMocks(); fs.rmSync(brain, { recursive: true, force: true }); });

describe('confined memory owner', () => {
  it('uses real fsync before intent/document rename and event completion', async () => {
    const order = [];
    const sync = fs.fsyncSync, rename = fs.renameSync, write = fs.writeFileSync, open = fs.openSync;
    const files = new Map();
    vi.spyOn(fs, 'openSync').mockImplementation((file, ...args) => { const fd = open(file, ...args); files.set(fd, String(file)); return fd; });
    vi.spyOn(fs, 'fsyncSync').mockImplementation(fd => { order.push(['sync', files.get(fd)]); return sync(fd); });
    vi.spyOn(fs, 'renameSync').mockImplementation((from, to) => { order.push(['rename', String(from), String(to)]); return rename(from, to); });
    vi.spyOn(fs, 'writeFileSync').mockImplementation((file, ...args) => { order.push(['write', typeof file === 'number' ? files.get(file) : String(file)]); return write(file, ...args); });
    const result = await commitConfinedFact(brain, { content: 'fsync ordering proof' });
    expect(result).toMatchObject({ committed: true, indexed: false });
    const intentRename = order.findIndex(([op, from, to]) => op === 'rename' && to.includes('.ssss-intents/'));
    const factRename = order.findIndex(([op, from, to]) => op === 'rename' && to.endsWith(`${result.slug}.md`));
    const eventWrite = order.findIndex(([op, file]) => op === 'write' && file.endsWith('confined-memory.jsonl'));
    expect(intentRename).toBeGreaterThan(0);
    expect(order[intentRename - 1]).toEqual(['sync', order[intentRename][1]]);
    expect(factRename).toBeGreaterThan(intentRename);
    expect(order[factRename - 1]).toEqual(['sync', order[factRename][1]]);
    expect(eventWrite).toBeGreaterThan(factRename);
    expect(order.slice(factRename + 1, eventWrite)).toContainEqual(['sync', path.join(brain, 'memory-vault/facts')]);
    expect(order.slice(eventWrite + 1)).toContainEqual(['sync', path.join(brain, 'memory-vault/.events/confined-memory.jsonl')]);
    expect(fs.existsSync(path.join(brain, 'memory-derived'))).toBe(false);
  });
  it('fails closed when real fsync fails instead of swallowing it', async () => {
    vi.spyOn(fs, 'fsyncSync').mockImplementation(() => { throw new Error('disk failure'); });
    await expect(commitConfinedFact(brain, { content: 'must not claim durable' })).rejects.toMatchObject({ result: { committed: 'unknown', indexed: false } });
    expect(fs.existsSync(path.join(brain, 'memory-vault/facts'))).toBe(false);
  });
  it('never reports success when the canonical event fsync fails', async () => {
    const sync = fs.fsyncSync, open = fs.openSync;
    const files = new Map();
    vi.spyOn(fs, 'openSync').mockImplementation((file, ...args) => { const fd = open(file, ...args); files.set(fd, String(file)); return fd; });
    vi.spyOn(fs, 'fsyncSync').mockImplementation(fd => {
      if (files.get(fd)?.endsWith('confined-memory.jsonl')) throw new Error('event disk failure');
      return sync(fd);
    });
    await expect(commitConfinedFact(brain, { content: 'failed event durability' })).rejects.toMatchObject({ result: { committed: 'unknown', indexed: false } });
    expect(fs.readdirSync(path.join(brain, 'memory-vault/facts'))).toEqual([]);
  });
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
