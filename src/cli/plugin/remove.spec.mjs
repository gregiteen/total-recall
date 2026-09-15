import { describe, it, expect } from 'vitest';
import { removePlugin } from './remove.mjs';

describe('remove.mjs', () => {
  it('exports removePlugin function', () => {
    expect(removePlugin).toBeDefined();
    expect(typeof removePlugin).toBe('function');
  });
});
