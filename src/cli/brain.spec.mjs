import { describe, it, expect } from 'vitest';
import brain from './brain.mjs';

describe('brain.mjs', () => {
  it('exports default', () => {
    expect(brain).toBeDefined();
  });
});
