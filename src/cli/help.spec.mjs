import { describe, it, expect } from 'vitest';
import run from './help.mjs';

describe('help.mjs', () => {
  it('exports default', () => {
    expect(run).toBeDefined();
  });
});
