import { describe, it, expect } from 'vitest';
import share from './share.mjs';

describe('share.mjs', () => {
  it('exports default', () => {
    expect(share).toBeDefined();
  });
});
