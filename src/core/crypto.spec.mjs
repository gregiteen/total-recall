// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock config and fs for the module-level side-effects in crypto.mjs
vi.mock('./config.mjs', () => ({
  brainDir: '/tmp/test-brain-crypto',
}));

vi.mock('fs', () => ({
  default: {
    existsSync: vi.fn(() => false),
    mkdirSync: vi.fn(),
    writeFileSync: vi.fn(),
    readFileSync: vi.fn(() => Buffer.alloc(0)),
  },
  existsSync: vi.fn(() => false),
  mkdirSync: vi.fn(),
  writeFileSync: vi.fn(),
  readFileSync: vi.fn(() => Buffer.alloc(0)),
}));

describe('crypto module', () => {
  let encryptSecrets, decryptSecrets, deriveKey, generateSignatureKeyPair, signPayload, verifySignature;

  beforeEach(async () => {
    const mod = await import('./crypto.mjs');
    encryptSecrets = mod.encryptSecrets;
    decryptSecrets = mod.decryptSecrets;
    deriveKey = mod.deriveKey;
    generateSignatureKeyPair = mod.generateSignatureKeyPair;
    signPayload = mod.signPayload;
    verifySignature = mod.verifySignature;
  });

  describe('deriveKey', () => {
    it('derives a 32-byte buffer from password and salt', async () => {
      const key = await deriveKey('my-password', 'some-salt');
      expect(key).toBeInstanceOf(Buffer);
      expect(key.length).toBe(32);
    }, 15000);

    it('produces different keys for different passwords', async () => {
      const k1 = await deriveKey('password1', 'salt');
      const k2 = await deriveKey('password2', 'salt');
      expect(k1.equals(k2)).toBe(false);
    }, 15000);

    it('produces different keys for different salts', async () => {
      const k1 = await deriveKey('password', 'salt1');
      const k2 = await deriveKey('password', 'salt2');
      expect(k1.equals(k2)).toBe(false);
    }, 15000);
  });

  // The KDF is deliberately expensive, so its result is cached. These cover the
  // property that makes that safe: a cache hit is only ever possible for the
  // exact (password, salt) pair that produced it. A cache that could be fooled
  // by either half would hand out a key that decrypts nothing — or worse, that
  // survives a master-password rotation.
  describe('derived-key cache', () => {
    it('returns the same key material on a repeat derivation', async () => {
      const first = await deriveKey('cache-password', 'cache-salt');
      const second = await deriveKey('cache-password', 'cache-salt');
      expect(second.equals(first)).toBe(true);
    }, 20000);

    it('does not serve a cached key to a different password', async () => {
      const mine = await deriveKey('cache-password-a', 'shared-salt');
      const theirs = await deriveKey('cache-password-b', 'shared-salt');
      expect(theirs.equals(mine)).toBe(false);
    }, 20000);

    it('does not serve a cached key after the salt changes', async () => {
      const before = await deriveKey('rotating-password', 'salt-before');
      const after = await deriveKey('rotating-password', 'salt-after');
      expect(after.equals(before)).toBe(false);
    }, 20000);

    it('still decrypts correctly once clearDerivedKeyCache() has dropped the entry', async () => {
      const mod = await import('./crypto.mjs');
      const password = 'password-survives-cache-clear';
      const encrypted = await encryptSecrets({ token: 'sk-live-xyz' }, password);
      expect(await decryptSecrets(encrypted, password)).toEqual({ token: 'sk-live-xyz' });
      mod.clearDerivedKeyCache();
      expect(await decryptSecrets(encrypted, password)).toEqual({ token: 'sk-live-xyz' });
    }, 30000);

    it('rejects the retired password after a re-encrypt, cache warm', async () => {
      const oldPassword = 'retired-master-password';
      const newPassword = 'rotated-master-password';
      const payload = { api_key: 'sk-rotate' };

      const before = await encryptSecrets(payload, oldPassword);
      expect(await decryptSecrets(before, oldPassword)).toEqual(payload);

      // Cache is now warm for the OLD password. Re-encrypting must not let it
      // decrypt the new store.
      const after = await encryptSecrets(payload, newPassword);
      await expect(decryptSecrets(after, oldPassword)).rejects.toThrow();
      expect(await decryptSecrets(after, newPassword)).toEqual(payload);
    }, 40000);
  });

  describe('encryptSecrets / decryptSecrets roundtrip', () => {
    it('roundtrips a simple object correctly', async () => {
      const original = { api_key: 'sk-abc123', count: 42 };
      const password = 'test-password-round-trip';
      const encrypted = await encryptSecrets(original, password);
      const decrypted = await decryptSecrets(encrypted, password);
      expect(decrypted).toEqual(original);
    }, 15000);

    it('encrypted output is a Buffer, not plaintext', async () => {
      const original = { secret: 'hidden-value' };
      const encrypted = await encryptSecrets(original, 'pass');
      expect(encrypted).toBeInstanceOf(Buffer);
      expect(encrypted.toString()).not.toContain('hidden-value');
    }, 15000);

    it('encrypted output length is > plaintext length (has salt + iv + tag overhead)', async () => {
      const original = { k: 'v' };
      const encrypted = await encryptSecrets(original, 'pass');
      const plainLen = JSON.stringify(original).length;
      // Overhead: 16 salt + 12 iv + 16 auth tag = 44 bytes
      expect(encrypted.length).toBeGreaterThan(plainLen + 40);
    }, 15000);

    it('produces different ciphertext for same input (random salt/iv)', async () => {
      const original = { k: 'v' };
      const enc1 = await encryptSecrets(original, 'pass');
      const enc2 = await encryptSecrets(original, 'pass');
      expect(enc1.equals(enc2)).toBe(false);
    }, 15000);

    it('throws on wrong password (auth tag mismatch)', async () => {
      const encrypted = await encryptSecrets({ x: 1 }, 'correct-password');
      await expect(decryptSecrets(encrypted, 'wrong-password')).rejects.toThrow();
    }, 15000);

    it('handles nested objects in roundtrip', async () => {
      const original = { a: { b: { c: [1, 2, 3] } }, d: true };
      const encrypted = await encryptSecrets(original, 'nested-pass');
      const decrypted = await decryptSecrets(encrypted, 'nested-pass');
      expect(decrypted).toEqual(original);
    }, 15000);
  });


  describe('Ed25519 signature keypair', () => {
    it('generates keypair with publicKey and privateKey strings', () => {
      const { publicKey, privateKey } = generateSignatureKeyPair();
      expect(typeof publicKey).toBe('string');
      expect(typeof privateKey).toBe('string');
      expect(publicKey).toContain('PUBLIC KEY');
      expect(privateKey).toContain('PRIVATE KEY');
    });

    it('signPayload + verifySignature roundtrip succeeds', () => {
      const { publicKey, privateKey } = generateSignatureKeyPair();
      const payload = 'test payload data';
      const sig = signPayload(payload, privateKey);
      const valid = verifySignature(payload, sig, publicKey);
      expect(valid).toBe(true);
    });

    it('verifySignature returns false for tampered payload', () => {
      const { publicKey, privateKey } = generateSignatureKeyPair();
      const sig = signPayload('original', privateKey);
      const valid = verifySignature('tampered', sig, publicKey);
      expect(valid).toBe(false);
    });
  });
});
