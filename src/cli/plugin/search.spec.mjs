import { describe, it, expect } from 'vitest';
import { searchPlugins } from './search.mjs';

describe('search.mjs', () => {
  it('exports searchPlugins function', () => {
    expect(searchPlugins).toBeDefined();
    expect(typeof searchPlugins).toBe('function');
  });
});
