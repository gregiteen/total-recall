import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import matter from 'gray-matter';
import edit, { applyEdit, findNodeFile, parseEditArgs } from './edit.mjs';

const baseNode = {
  type: 'memory',
  slug: 'anti-patterns-abc12345',
  category: 'anti-patterns',
  title: 'Old title',
  description: 'Old title',
  status: 'active',
  confidence: 1,
  importance: 3,
  created: '2026-09-01T00:00:00.000Z',
  updated: '2026-09-01T00:00:00.000Z',
  modality: 'should',
  tags: ['a'],
  body: 'Old body.',
};

describe('parseEditArgs', () => {
  it('reads the slug, body and options', () => {
    const parsed = parseEditArgs([
      'my-rule', 'New body.', '--priority', 'absolute', '-m', 'must', '-i', '5', '--tags', 'x, y', '--no-compile',
    ]);
    expect(parsed.slug).toBe('my-rule');
    expect(parsed.body).toBe('New body.');
    expect(parsed.noCompile).toBe(true);
    expect(parsed.changes).toEqual({ priority: 'absolute', modality: 'must', importance: 5, tags: ['x', 'y'] });
  });

  it('allows options without a body and bodies that start with a dash', () => {
    expect(parseEditArgs(['s', '--title', 'T']).body).toBeUndefined();
    expect(parseEditArgs(['s', '- a list item']).body).toBe('- a list item');
    expect(parseEditArgs(['s', '-']).body).toBe('-');
  });

  it('rejects invalid values and unknown options', () => {
    expect(() => parseEditArgs(['s', '--importance', '9'])).toThrow(/1 to 5/);
    expect(() => parseEditArgs(['s', '--priority', 'urgent'])).toThrow(/--priority/);
    expect(() => parseEditArgs(['s', '--modality', 'maybe'])).toThrow(/--modality/);
    expect(() => parseEditArgs(['s', '--bogus'])).toThrow(/Unknown option/);
    expect(() => parseEditArgs(['s', '--title'])).toThrow(/requires a value/);
    expect(() => parseEditArgs(['s', 'one', 'two'])).toThrow(/single argument/);
  });
});

describe('applyEdit', () => {
  const now = '2026-09-26T12:00:00.000Z';

  it('changes only the given fields and stamps updated', () => {
    const { node, changed } = applyEdit(baseNode, { body: 'New body.', changes: { importance: 5 } }, now);
    expect(changed).toEqual(['body', 'importance']);
    expect(node.body).toBe('New body.');
    expect(node.importance).toBe(5);
    expect(node.slug).toBe(baseNode.slug);
    expect(node.created).toBe(baseNode.created);
    expect(node.updated).toBe(now);
  });

  it('reports no change when nothing differs', () => {
    const { node, changed } = applyEdit(baseNode, { body: ' Old body. ', changes: { importance: 3 } }, now);
    expect(changed).toEqual([]);
    expect(node.updated).toBe(baseNode.updated);
  });

  it('keeps description in step with a title it mirrored', () => {
    const { node } = applyEdit(baseNode, { changes: { title: 'New title' } }, now);
    expect(node.description).toBe('New title');
  });

  it('sets immutable with absolute priority and clears it otherwise', () => {
    const absolute = applyEdit(baseNode, { changes: { priority: 'absolute' } }, now).node;
    expect(absolute.immutable).toBe(true);
    const normal = applyEdit(absolute, { changes: { priority: 'normal' } }, now).node;
    expect(normal.immutable).toBeUndefined();
  });
});

describe('edit command', () => {
  let home;
  let cwd;
  let prevAgentDir;
  let vaultDir;

  beforeEach(() => {
    home = fs.mkdtempSync(path.join(os.tmpdir(), 'tr-edit-'));
    prevAgentDir = process.env.AGENT_DIR;
    process.env.AGENT_DIR = path.join(home, '.agent');
    vaultDir = path.join(home, '.agent', 'skills', 'total-recall', 'memory-vault');
    fs.mkdirSync(path.join(vaultDir, 'anti-patterns'), { recursive: true });
    const { body, ...data } = baseNode;
    fs.writeFileSync(path.join(vaultDir, 'anti-patterns', `${baseNode.slug}.md`), matter.stringify(`${body}\n`, data));
    cwd = process.cwd();
    process.chdir(home);
    process.exitCode = undefined;
  });

  afterEach(() => {
    process.chdir(cwd);
    if (prevAgentDir === undefined) delete process.env.AGENT_DIR;
    else process.env.AGENT_DIR = prevAgentDir;
    fs.rmSync(home, { recursive: true, force: true });
    process.exitCode = undefined;
  });

  it('finds a node file in any category', () => {
    expect(findNodeFile(baseNode.slug, vaultDir)).toBe(path.join(vaultDir, 'anti-patterns', `${baseNode.slug}.md`));
    expect(findNodeFile('missing', vaultDir)).toBeNull();
    expect(findNodeFile('../escape', vaultDir)).toBeNull();
  });

  it('rewrites the node in place under the same slug', async () => {
    await edit([baseNode.slug, 'New body.', '--priority', 'absolute', '--global', '--no-compile']);
    expect(process.exitCode).toBeUndefined();
    const files = fs.readdirSync(path.join(vaultDir, 'anti-patterns'));
    expect(files).toEqual([`${baseNode.slug}.md`]);
    const { data, content } = matter(fs.readFileSync(path.join(vaultDir, 'anti-patterns', files[0]), 'utf8'));
    expect(content.trim()).toBe('New body.');
    expect(data.priority).toBe('absolute');
    expect(data.immutable).toBe(true);
    expect(data.created).toBe(baseNode.created);
  });

  it('fails for an unknown slug', async () => {
    await edit(['nope', 'x', '--global', '--no-compile']);
    expect(process.exitCode).toBe(1);
  });
});
