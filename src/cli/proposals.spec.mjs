import { describe, it, expect } from 'vitest';
import proposals from './proposals.mjs';

describe('proposals.mjs', () => {
  it('exports default', () => {
    expect(proposals).toBeDefined();
  });
});
