import { describe, it, expect } from 'vitest';
import generatePat from './generate-pat.mjs';

describe('generate-pat.mjs', () => {
  it('exports default', () => {
    expect(generatePat).toBeDefined();
  });
});
