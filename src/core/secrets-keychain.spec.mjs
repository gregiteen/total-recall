/**
 * The Keychain as a master-password carrier.
 *
 * `security` is stubbed throughout: these tests are about the contract with it,
 * not about macOS. The property that matters most is that the password reaches
 * the process on stdin and never through argv — argv is readable by every
 * process on the machine via `ps`, so a secret placed there is disclosed to the
 * whole box for the lifetime of the call.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { spawnSync } from 'node:child_process';
import {
  DEFAULT_KEYCHAIN_SERVICE,
  describeKeychainCarrier,
  keychainAvailable,
  readKeychainPassword,
  writeKeychainPassword,
} from './secrets-keychain.mjs';

vi.mock('node:child_process', () => {
  const mockedSpawnSync = vi.fn();
  return { spawnSync: mockedSpawnSync, default: { spawnSync: mockedSpawnSync } };
});

const PASSWORD = 'a-master-password-of-sufficient-length-000000';

describe('secrets keychain carrier', () => {
  beforeEach(() => vi.clearAllMocks());

  it('reads the stored password and strips the trailing newline security adds', () => {
    vi.mocked(spawnSync).mockReturnValue({ status: 0, stdout: `${PASSWORD}\n` });
    expect(readKeychainPassword({ service: 'svc', account: 'someone' })).toBe(PASSWORD);
  });

  it('reports no entry rather than throwing when there is none', () => {
    vi.mocked(spawnSync).mockReturnValue({ status: 44, stdout: '', stderr: 'not found' });
    expect(readKeychainPassword({ service: 'svc', account: 'someone' })).toBeNull();
  });

  // The whole reason this module shells out the way it does.
  it('passes the password on stdin and never in argv', () => {
    vi.mocked(spawnSync).mockReturnValue({ status: 0, stdout: '' });
    writeKeychainPassword({ service: 'svc', account: 'someone', password: PASSWORD });

    const [, args, options] = vi.mocked(spawnSync).mock.calls[0];
    expect(args).not.toContain(PASSWORD);
    expect(args.join(' ')).not.toContain(PASSWORD);
    // `-w` with no value is what makes security prompt and read stdin.
    expect(args.at(-1)).toBe('-w');
    expect(options.input).toContain(PASSWORD);
  });

  it('updates in place so a second write is not a duplicate entry', () => {
    vi.mocked(spawnSync).mockReturnValue({ status: 0, stdout: '' });
    writeKeychainPassword({ service: 'svc', account: 'someone', password: PASSWORD });
    expect(vi.mocked(spawnSync).mock.calls[0][1]).toContain('-U');
  });

  it('refuses to store an empty password', () => {
    expect(() => writeKeychainPassword({ service: 'svc', password: '' })).toThrow(/empty/i);
    expect(spawnSync).not.toHaveBeenCalled();
  });

  it('surfaces a failure from security instead of reporting success', () => {
    vi.mocked(spawnSync).mockReturnValue({ status: 1, stdout: '', stderr: 'denied' });
    expect(() => writeKeychainPassword({ service: 'svc', password: PASSWORD })).toThrow(/denied/);
  });

  it('is unavailable off macOS', () => {
    expect(keychainAvailable({ platform: 'linux' })).toBe(false);
    expect(spawnSync).not.toHaveBeenCalled();
  });

  it('names a carrier without revealing anything secret', () => {
    const label = describeKeychainCarrier({ service: DEFAULT_KEYCHAIN_SERVICE, account: 'someone' });
    expect(label).toBe(`keychain:${DEFAULT_KEYCHAIN_SERVICE}(someone)`);
    expect(label).not.toContain(PASSWORD);
  });
});
