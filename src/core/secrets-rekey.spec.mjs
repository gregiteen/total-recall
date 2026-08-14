import { afterEach, describe, expect, it } from 'vitest';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { decryptSecrets, encryptSecrets } from './crypto.mjs';
import {
  generateSecretsMasterPassword,
  readMasterPasswordFromCarrier,
  rekeySecretsTransaction,
  updateMasterPasswordCarrierText,
} from './secrets-rekey.mjs';

const roots = [];

function temporaryRoot() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'tr-rekey-'));
  roots.push(root);
  return root;
}

function launchAgent(password = null) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<plist version="1.0"><dict>
  <key>EnvironmentVariables</key><dict>
    <key>AGENT_DIR</key><string>/tmp/.agent</string>
    ${password ? `<key>TR_SECRETS_PASSWORD</key><string>${password}</string>` : ''}
  </dict>
</dict></plist>\n`;
}

afterEach(() => {
  for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true });
});

describe('secrets rekey', () => {
  it('atomically re-encrypts encrypted and plaintext stores and retires the old password', async () => {
    const root = temporaryRoot();
    const oldPassword = 'old-test-master-password-000000000000';
    const newPassword = 'new-test-master-password-111111111111';
    const encryptedStore = path.join(root, 'encrypted.enc');
    const plaintextStore = path.join(root, 'plaintext.enc');
    const plistPath = path.join(root, 'brain.plist');
    const envPath = path.join(root, 'brain.env');
    const encryptedPayload = { TOKEN_A: { value: 'secret-a' }, meta: { version: 1 } };
    const plaintextPayload = { TOKEN_B: { value: 'secret-b' } };

    fs.writeFileSync(encryptedStore, await encryptSecrets(encryptedPayload, oldPassword), { mode: 0o600 });
    fs.writeFileSync(plaintextStore, JSON.stringify(plaintextPayload), { mode: 0o600 });
    fs.writeFileSync(plistPath, launchAgent(oldPassword));
    fs.writeFileSync(envPath, `PORT=3000\nTR_SECRETS_PASSWORD=${oldPassword}\n`, { mode: 0o600 });

    const result = await rekeySecretsTransaction({
      storePaths: [encryptedStore, plaintextStore],
      carriers: [
        { path: plistPath, type: 'launchd-plist' },
        { path: envPath, type: 'env' },
      ],
      oldPassword,
      newPassword,
    });

    expect(result.old_password_rejected).toBe(true);
    expect(await decryptSecrets(fs.readFileSync(encryptedStore), newPassword)).toEqual(encryptedPayload);
    expect(await decryptSecrets(fs.readFileSync(plaintextStore), newPassword)).toEqual(plaintextPayload);
    await expect(decryptSecrets(fs.readFileSync(encryptedStore), oldPassword)).rejects.toThrow();
    await expect(decryptSecrets(fs.readFileSync(plaintextStore), oldPassword)).rejects.toThrow();
    expect(readMasterPasswordFromCarrier({ path: plistPath, type: 'launchd-plist' })).toBe(newPassword);
    expect(readMasterPasswordFromCarrier({ path: envPath, type: 'env' })).toBe(newPassword);
    expect(fs.readdirSync(root).some((name) => name.includes('.backup') || name.endsWith('.tmp'))).toBe(false);
    expect(fs.statSync(encryptedStore).mode & 0o777).toBe(0o600);
  }, 20000);

  it('validates every carrier before mutating any target', async () => {
    const root = temporaryRoot();
    const oldPassword = 'old-test-master-password-000000000000';
    const otherPassword = 'different-current-password-2222222222';
    const newPassword = 'new-test-master-password-111111111111';
    const storePath = path.join(root, 'secrets.enc');
    const plistPath = path.join(root, 'brain.plist');
    const original = await encryptSecrets({ TOKEN: { value: 'secret' } }, oldPassword);
    fs.writeFileSync(storePath, original, { mode: 0o600 });
    fs.writeFileSync(plistPath, launchAgent(otherPassword));

    await expect(
      rekeySecretsTransaction({
        storePaths: [storePath],
        carriers: [{ path: plistPath, type: 'launchd-plist' }],
        oldPassword,
        newPassword,
      }),
    ).rejects.toThrow(/does not match/);

    expect(fs.readFileSync(storePath)).toEqual(original);
    expect(readMasterPasswordFromCarrier({ path: plistPath, type: 'launchd-plist' })).toBe(otherPassword);
  });

  it('can finish rekeying an orphan store after its persistent carrier was already updated', async () => {
    const root = temporaryRoot();
    const oldPassword = 'old-test-master-password-000000000000';
    const newPassword = 'new-test-master-password-111111111111';
    const storePath = path.join(root, 'orphan.enc');
    const payload = { ORPHANED_TOKEN: { value: 'still-protected' } };
    fs.writeFileSync(storePath, await encryptSecrets(payload, oldPassword), { mode: 0o600 });

    const result = await rekeySecretsTransaction({
      storePaths: [storePath],
      carriers: [],
      oldPassword,
      newPassword,
      allowStoreOnly: true,
    });

    expect(result.carriers).toEqual([]);
    expect(await decryptSecrets(fs.readFileSync(storePath), newPassword)).toEqual(payload);
    await expect(decryptSecrets(fs.readFileSync(storePath), oldPassword)).rejects.toThrow();
  });

  it('can add the master password to an existing LaunchAgent environment dictionary', () => {
    const password = generateSecretsMasterPassword();
    const updated = updateMasterPasswordCarrierText(
      launchAgent(),
      'launchd-plist',
      password,
      { allowInsert: true },
    );
    expect(updated).toContain('<key>TR_SECRETS_PASSWORD</key>');
    const pathRoot = temporaryRoot();
    const plistPath = path.join(pathRoot, 'brain.plist');
    fs.writeFileSync(plistPath, updated);
    expect(readMasterPasswordFromCarrier({ path: plistPath, type: 'launchd-plist' })).toBe(password);
    expect(Buffer.from(password, 'base64url')).toHaveLength(48);
  });

  it('generates distinct high-entropy master passwords', () => {
    const first = generateSecretsMasterPassword();
    const second = generateSecretsMasterPassword();
    expect(first).not.toBe(second);
    expect(crypto.createHash('sha256').update(first).digest()).not.toEqual(
      crypto.createHash('sha256').update(second).digest(),
    );
  });
});
