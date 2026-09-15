import { describe, it, expect } from 'vitest';
import { run } from './index.mjs';

describe('index.mjs', () => {
  it('exports run function', () => {
    expect(run).toBeDefined();
    expect(typeof run).toBe('function');
  });
});
