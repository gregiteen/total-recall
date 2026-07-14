import { describe, it, expect } from 'vitest';
import forget from './forget.mjs';

describe('forget.mjs', () => {
  it('exports default', () => {
    expect(forget).toBeDefined();
  });
});
