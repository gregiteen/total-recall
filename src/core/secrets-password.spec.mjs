import { describe, expect, it, vi } from 'vitest';
import { secretsPassword } from './secrets-store.mjs';

// The store opens with the environment's password when there is one, and only
// falls back to the Keychain entry `secret rekey` maintains when there is not.
describe('secretsPassword', () => {
  it('prefers TR_SECRETS_PASSWORD, then TR_MASTER_PASSWORD, without touching the Keychain', () => {
    const readKeychain = vi.fn(() => 'from-keychain');
    expect(secretsPassword({ env: { TR_SECRETS_PASSWORD: 'a', TR_MASTER_PASSWORD: 'b' }, readKeychain })).toBe('a');
    expect(secretsPassword({ env: { TR_MASTER_PASSWORD: 'b' }, readKeychain })).toBe('b');
    expect(readKeychain).not.toHaveBeenCalled();
  });

  it('falls back to the Keychain when the environment has no password', () => {
    expect(secretsPassword({ env: {}, readKeychain: () => 'from-keychain' })).toBe('from-keychain');
  });

  it('returns null when neither has one', () => {
    expect(secretsPassword({ env: {}, readKeychain: () => null })).toBeNull();
  });

  it('TR_SECRETS_NO_KEYCHAIN=1 disables the fallback', () => {
    const readKeychain = vi.fn(() => 'from-keychain');
    expect(secretsPassword({ env: { TR_SECRETS_NO_KEYCHAIN: '1' }, readKeychain })).toBeNull();
    expect(readKeychain).not.toHaveBeenCalled();
  });
});
