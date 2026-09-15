import { describe, it, expect } from 'vitest';
import { createPlugin } from './create.mjs';

describe('create.mjs', () => {
  it('exports createPlugin function', () => {
    expect(createPlugin).toBeDefined();
    expect(typeof createPlugin).toBe('function');
  });
});
