import { describe, it, expect } from 'vitest';
import { loadSectionCache, saveSectionCache, computeSectionHash } from './context-cache.mjs';

describe('context-cache.mjs', () => {
  it('exports caching functions', () => {
    expect(loadSectionCache).toBeDefined();
    expect(saveSectionCache).toBeDefined();
    expect(computeSectionHash).toBeDefined();
  });
});
