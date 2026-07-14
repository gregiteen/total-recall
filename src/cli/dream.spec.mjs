import { describe, it, expect } from 'vitest';
import dream from './dream.mjs';

describe('dream.mjs', () => {
  it('exports default', () => {
    expect(dream).toBeDefined();
  });
});
