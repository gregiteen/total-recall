/**
 * The Keychain's part in a master-password rotation.
 *
 * A rotation used to update the carriers it could see — a LaunchAgent plist, an
 * env file — while a shell profile read the password from the Keychain, which
 * it could not. The rotation then reported success and every interactive shell
 * on the machine started failing to decrypt, with an error naming the symptom
 * and not the cause. These tests hold the Keychain to the same standard as the
 * file carriers: it moves with them, or nothing moves.
 *
 * `security` never runs here; the carrier module is stubbed with an in-memory
 * store so the transaction's ordering and rollback are what is under test.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { decryptSecrets, encryptSecrets } from './crypto.mjs';

/** service → password, standing in for the real Keychain. */
const keychain = new Map();
const writeSpy = vi.fn();

vi.mock('./secrets-keychain.mjs', () => ({
  DEFAULT_KEYCHAIN_SERVICE: 'total-recall-secrets',
  keychainAvailable: vi.fn(() => true),
  readKeychainPassword: vi.fn(({ service }) => keychain.get(service) ?? null),
  writeKeychainPassword: vi.fn((carrier) => {
    writeSpy(carrier.service);
    if (carrier.service === 'explodes') throw new Error('keychain is locked');
    keychain.set(carrier.service, carrier.password);
    return true;
  }),
  describeKeychainCarrier: (carrier) => `keychain:${carrier.service}`,
}));

const { rekeySecretsTransaction } = await import('./secrets-rekey.mjs');

const OLD = 'old-test-master-password-000000000000';
const NEW = 'new-test-master-password-111111111111';
const PAYLOAD = { TOKEN_A: { value: 'secret-a' } };

const roots = [];
function temporaryRoot() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'tr-rekey-kc-'));
  roots.push(root);
  return root;
}

async function storeAt(root) {
  const storePath = path.join(root, 'secrets.enc');
  fs.writeFileSync(storePath, await encryptSecrets(PAYLOAD, OLD), { mode: 0o600 });
  return storePath;
}

beforeEach(() => {
  keychain.clear();
  writeSpy.mockClear();
});

afterEach(() => {
  for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true });
});

describe('rekey with a Keychain carrier', () => {
  it('moves the Keychain to the new password alongside the store', async () => {
    const root = temporaryRoot();
    const storePath = await storeAt(root);
    keychain.set('total-recall-secrets', OLD);

    const result = await rekeySecretsTransaction({
      storePaths: [storePath],
      keychainCarriers: [{ service: 'total-recall-secrets' }],
      oldPassword: OLD,
      newPassword: NEW,
    });

    expect(result.keychain).toEqual([
      { service: 'total-recall-secrets', account: process.env.USER },
    ]);
    expect(keychain.get('total-recall-secrets')).toBe(NEW);
    // The store and the Keychain now agree, which is the whole point.
    expect(await decryptSecrets(fs.readFileSync(storePath), NEW)).toEqual(PAYLOAD);
  });

  // A Keychain-only setup is legitimate: the entry is a real persistent carrier,
  // so it alone should satisfy the "don't rotate into a store nobody can open"
  // guard that file carriers satisfy.
  it('counts as a persistent carrier on its own', async () => {
    const root = temporaryRoot();
    const storePath = await storeAt(root);
    keychain.set('total-recall-secrets', OLD);

    await expect(
      rekeySecretsTransaction({
        storePaths: [storePath],
        keychainCarriers: [{ service: 'total-recall-secrets' }],
        oldPassword: OLD,
        newPassword: NEW,
      }),
    ).resolves.toMatchObject({ old_password_rejected: true });
  });

  // Someone else already rotated it. Continuing would split the fleet across two
  // passwords, so nothing is touched at all.
  it('refuses before staging when the entry holds a foreign password', async () => {
    const root = temporaryRoot();
    const storePath = await storeAt(root);
    const before = fs.readFileSync(storePath);
    keychain.set('total-recall-secrets', 'someone-elses-password-2222222222222');

    await expect(
      rekeySecretsTransaction({
        storePaths: [storePath],
        keychainCarriers: [{ service: 'total-recall-secrets' }],
        oldPassword: OLD,
        newPassword: NEW,
      }),
    ).rejects.toThrow(/does not match the current master password/);

    expect(fs.readFileSync(storePath)).toEqual(before);
    expect(writeSpy).not.toHaveBeenCalled();
  });

  // The Keychain is the one participant that cannot be staged and renamed, so
  // it is written last — and if that write fails, the files it was supposed to
  // accompany have to go back.
  it('rolls the store back when the Keychain write fails', async () => {
    const root = temporaryRoot();
    const storePath = await storeAt(root);
    keychain.set('explodes', OLD);

    await expect(
      rekeySecretsTransaction({
        storePaths: [storePath],
        keychainCarriers: [{ service: 'explodes' }],
        oldPassword: OLD,
        newPassword: NEW,
      }),
    ).rejects.toThrow(/keychain is locked/);

    // The old password must still open the store, or the rotation has locked
    // the operator out of their own secrets.
    expect(await decryptSecrets(fs.readFileSync(storePath), OLD)).toEqual(PAYLOAD);
  });

  it('restores the previous Keychain value when a later carrier fails', async () => {
    const root = temporaryRoot();
    const storePath = await storeAt(root);
    keychain.set('ok', OLD);
    keychain.set('explodes', OLD);

    await expect(
      rekeySecretsTransaction({
        storePaths: [storePath],
        keychainCarriers: [{ service: 'ok' }, { service: 'explodes' }],
        oldPassword: OLD,
        newPassword: NEW,
      }),
    ).rejects.toThrow(/keychain is locked/);

    expect(keychain.get('ok')).toBe(OLD);
    expect(await decryptSecrets(fs.readFileSync(storePath), OLD)).toEqual(PAYLOAD);
  });

  // An entry left holding a password the store no longer accepts is precisely
  // the outage this carrier exists to prevent, so it cannot be swallowed — but
  // it must not hide the failure that triggered the rollback either.
  it('names entries it could not restore, without losing the original error', async () => {
    const root = temporaryRoot();
    const storePath = await storeAt(root);
    keychain.set('explodes', OLD);

    await expect(
      rekeySecretsTransaction({
        storePaths: [storePath],
        keychainCarriers: [{ service: 'explodes' }],
        oldPassword: OLD,
        newPassword: NEW,
      }),
    ).rejects.toThrow(/keychain is locked[\s\S]*could not be restored[\s\S]*explodes/);
  });
});
