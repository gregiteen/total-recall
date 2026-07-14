import { describe, it, expect } from 'vitest';
import { runOpenWikiIngest } from './ingest-openwiki.mjs';

describe('ingest-openwiki.mjs', () => {
  it('exports runOpenWikiIngest', () => {
    expect(runOpenWikiIngest).toBeDefined();
  });
});
