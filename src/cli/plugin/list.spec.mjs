import { describe, it, expect } from 'vitest';
import { listPlugins } from './list.mjs';

describe('list.mjs', () => {
  it('exports listPlugins function', () => {
    expect(listPlugins).toBeDefined();
    expect(typeof listPlugins).toBe('function');
  });
});
