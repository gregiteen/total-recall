import { describe, it, expect } from 'vitest';
import hashPassword from './hash-password.mjs';

describe('hash-password.mjs', () => {
  it('exports default', () => {
    expect(hashPassword).toBeDefined();
  });
});
