import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { fastSearch } from './fast-recall.mjs';
import fs from 'node:fs';
import path from 'node:path';

describe('fast-recall', () => {
  const derivedDir = path.join(process.cwd(), '.test-derived');
  const layersPath = path.join(derivedDir, 'memory-layers.jsonl');

  beforeEach(() => {
    fs.mkdirSync(derivedDir, { recursive: true });
  });

  afterEach(() => {
    fs.rmSync(derivedDir, { recursive: true, force: true });
  });

  it('returns empty array if memory-layers.jsonl is missing', () => {
    expect(fastSearch('test', { derivedDir })).toEqual([]);
  });

  it('searches and filters nodes correctly', () => {
    fs.writeFileSync(layersPath, [
      JSON.stringify({ slug: 'test-node-1', title: 'Test Node 1', category: 'fact', tags: ['test'] }),
      JSON.stringify({ slug: 'test-node-2', title: 'Another Node', category: 'rule', tags: ['other'] }),
      JSON.stringify({ slug: 'mismatch', title: 'Unrelated', category: 'fact', tags: [] }),
    ].join('\n'));

    // Text match
    let res = fastSearch('test', { derivedDir });
    expect(res).toHaveLength(2); // test-node-1 and test-node-2 both contain "test" in the slug
    expect(res[0].slug).toBe('test-node-1');

    // Category filter
    res = fastSearch('node', { derivedDir, category: 'rule' });
    expect(res).toHaveLength(1);
    expect(res[0].slug).toBe('test-node-2');
  });
});
