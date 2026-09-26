import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { secretsPassword, readTrEnvFilePassword } from './secrets-store.mjs';

const noFile = () => null;

// The store opens with the environment's password when there is one, and only
// falls back to the Keychain entry `secret rekey` maintains when there is not.
describe('secretsPassword', () => {
  it('prefers TR_SECRETS_PASSWORD, then TR_MASTER_PASSWORD, without touching the Keychain', () => {
    const readKeychain = vi.fn(() => 'from-keychain');
    expect(secretsPassword({ env: { TR_SECRETS_PASSWORD: 'a', TR_MASTER_PASSWORD: 'b' }, readKeychain, readEnvFile: noFile })).toBe('a');
    expect(secretsPassword({ env: { TR_MASTER_PASSWORD: 'b' }, readKeychain, readEnvFile: noFile })).toBe('b');
    expect(readKeychain).not.toHaveBeenCalled();
  });

  it('falls back to the Keychain when the environment has no password', () => {
    expect(secretsPassword({ env: {}, readKeychain: () => 'from-keychain', readEnvFile: noFile })).toBe('from-keychain');
  });

  it('returns null when neither has one', () => {
    expect(secretsPassword({ env: {}, readKeychain: () => null, readEnvFile: noFile })).toBeNull();
  });

  it('TR_SECRETS_NO_KEYCHAIN=1 disables the fallback', () => {
    const readKeychain = vi.fn(() => 'from-keychain');
    expect(secretsPassword({ env: { TR_SECRETS_NO_KEYCHAIN: '1' }, readKeychain, readEnvFile: noFile })).toBeNull();
    expect(readKeychain).not.toHaveBeenCalled();
  });
});

describe('secretsPassword env-file fallback', () => {
  it('uses the env file only when the environment and the Keychain have nothing', () => {
    const readEnvFile = vi.fn(() => 'from-file');
    expect(secretsPassword({ env: { TR_SECRETS_PASSWORD: 'a' }, readKeychain: () => 'k', readEnvFile })).toBe('a');
    expect(secretsPassword({ env: {}, readKeychain: () => 'k', readEnvFile })).toBe('k');
    expect(readEnvFile).not.toHaveBeenCalled();
    expect(secretsPassword({ env: {}, readKeychain: () => null, readEnvFile })).toBe('from-file');
  });

  it('still reads the env file when the Keychain fallback is disabled', () => {
    expect(secretsPassword({ env: { TR_SECRETS_NO_KEYCHAIN: '1' }, readKeychain: () => 'k', readEnvFile: () => 'from-file' })).toBe('from-file');
  });
});

describe('readTrEnvFilePassword', () => {
  const withFile = (content, mode) => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tr-env-'));
    const file = path.join(dir, 'tr.env');
    fs.writeFileSync(file, content);
    fs.chmodSync(file, mode);
    return { file, cleanup: () => fs.rmSync(dir, { recursive: true, force: true }) };
  };

  it.each([
    ["export TR_SECRETS_PASSWORD='quoted value'\n", 'quoted value'],
    ['TR_SECRETS_PASSWORD="double"\n', 'double'],
    ['# comment\nOTHER=1\nTR_SECRETS_PASSWORD=plain\n', 'plain'],
  ])('parses %j', (content, expected) => {
    const { file, cleanup } = withFile(content, 0o600);
    try {
      expect(readTrEnvFilePassword({ TR_ENV_FILE: file })).toBe(expected);
    } finally {
      cleanup();
    }
  });

  it('ignores a file other users can read', () => {
    const { file, cleanup } = withFile('TR_SECRETS_PASSWORD=leaky\n', 0o644);
    try {
      expect(readTrEnvFilePassword({ TR_ENV_FILE: file })).toBeNull();
    } finally {
      cleanup();
    }
  });

  it('returns null for a missing file or one without the key', () => {
    expect(readTrEnvFilePassword({ TR_ENV_FILE: path.join(os.tmpdir(), 'tr-env-does-not-exist') })).toBeNull();
    const { file, cleanup } = withFile('OTHER=1\n', 0o600);
    try {
      expect(readTrEnvFilePassword({ TR_ENV_FILE: file })).toBeNull();
    } finally {
      cleanup();
    }
  });
});
