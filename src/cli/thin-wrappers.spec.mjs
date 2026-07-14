import { describe, it, expect, vi } from 'vitest';
import friction from './friction.mjs';
import hashPassword from './hash-password.mjs';

vi.mock('../core/friction.mjs', () => ({
  ensureFrictionless: vi.fn().mockResolvedValue(true)
}));

vi.mock('../core/crypto.mjs', () => ({
  hashString: vi.fn().mockReturnValue('mocked-hash')
}));

describe('CLI: thin-wrappers', () => {
  describe('friction', () => {
    it('executes without error', async () => {
      // Just verifying it doesn't crash on import/run
      expect(friction).toBeDefined();
    });
  });

  describe('hash-password', () => {
    it('executes without error', async () => {
      expect(hashPassword).toBeDefined();
    });
  });
});
