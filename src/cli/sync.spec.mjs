import { describe, it, expect } from 'vitest';
import sync from './sync.mjs';

describe('sync.mjs', () => {
  it('exports default', () => {
    expect(sync).toBeDefined();
  });
});
