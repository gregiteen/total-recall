import { describe, it, expect } from 'vitest';
import keyCommand from './key.mjs';

describe('key.mjs', () => {
  it('exports default', () => {
    expect(keyCommand).toBeDefined();
  });
});
