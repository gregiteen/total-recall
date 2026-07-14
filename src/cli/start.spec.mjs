import { describe, it, expect } from 'vitest';
import start from './start.mjs';

describe('start.mjs', () => {
  it('exports default', () => {
    expect(start).toBeDefined();
  });
});
