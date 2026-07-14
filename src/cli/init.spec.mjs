import { describe, it, expect } from 'vitest';
import init from './init.mjs';

describe('init.mjs', () => {
  it('exports default', () => {
    expect(init).toBeDefined();
  });
});
