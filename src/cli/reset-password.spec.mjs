import { describe, it, expect } from 'vitest';
import resetPassword from './reset-password.mjs';

describe('reset-password.mjs', () => {
  it('exports default', () => {
    expect(resetPassword).toBeDefined();
  });
});
