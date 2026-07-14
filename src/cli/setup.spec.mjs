import { describe, it, expect } from 'vitest';
import setup from './setup.mjs';

describe('setup.mjs', () => {
  it('exports default', () => {
    expect(setup).toBeDefined();
  });
});
