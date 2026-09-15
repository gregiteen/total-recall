import { describe, it, expect } from 'vitest';
import { installPlugin } from './install.mjs';

describe('install.mjs', () => {
  it('exports installPlugin function', () => {
    expect(installPlugin).toBeDefined();
    expect(typeof installPlugin).toBe('function');
  });
});
