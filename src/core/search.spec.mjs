import { describe, it, expect } from 'vitest';
import { semanticSearch } from './search.mjs';

describe('search.mjs', () => {
  it('exports semanticSearch', () => {
    expect(semanticSearch).toBeDefined();
  });
});
