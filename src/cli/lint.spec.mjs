import { describe, it, expect } from 'vitest';
import lint from './lint.mjs';

describe('lint.mjs', () => {
  it('exports default', () => {
    expect(lint).toBeDefined();
  });
});
