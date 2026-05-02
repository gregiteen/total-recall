/**
 * crypto.test.mjs — Tests for config encryption/decryption
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

describe('config encryption', () => {
  it('round-trips encrypt → decrypt', async () => {
    const { encrypt, decrypt } = await import('../core/crypto.mjs');
    const plaintext = 'export default { repos: [], secret: "sk-test-123" };';
    const password = 'mypassword42';

    const blob = encrypt(plaintext, password);
    assert.ok(blob.startsWith('TOTALRECALL:'));

    const decrypted = decrypt(blob, password);
    assert.equal(decrypted, plaintext);
  });

  it('rejects wrong password', async () => {
    const { encrypt, decrypt } = await import('../core/crypto.mjs');
    const blob = encrypt('sensitive data', 'correctpassword');

    assert.throws(
      () => decrypt(blob, 'wrongpassword'),
      /Wrong password or corrupt data/
    );
  });

  it('detects encrypted blobs', async () => {
    const { encrypt, isEncrypted } = await import('../core/crypto.mjs');
    const blob = encrypt('test', 'pw');

    assert.equal(isEncrypted(blob), true);
    assert.equal(isEncrypted('export default {}'), false);
    assert.equal(isEncrypted(''), false);
    assert.equal(isEncrypted(null), false);
  });

  it('handles multiline config bundles', async () => {
    const { encrypt, decrypt } = await import('../core/crypto.mjs');
    const bundle = [
      '--- CONFIG.MJS ---',
      'export default { repos: ["~/project1"] };',
      '--- DOTENV ---',
      'TOTAL_RECALL_SLACK_WEBHOOK=https://hooks.slack.com/test',
      'TOTAL_RECALL_OPENAI_KEY=sk-test',
    ].join('\n');

    const blob = encrypt(bundle, 'bundlepass');
    const decrypted = decrypt(blob, 'bundlepass');
    assert.equal(decrypted, bundle);
    assert.ok(decrypted.includes('--- CONFIG.MJS ---'));
    assert.ok(decrypted.includes('--- DOTENV ---'));
    assert.ok(decrypted.includes('sk-test'));
  });

  it('produces different ciphertext each time (random salt/IV)', async () => {
    const { encrypt } = await import('../core/crypto.mjs');
    const blob1 = encrypt('same data', 'samepass');
    const blob2 = encrypt('same data', 'samepass');
    assert.notEqual(blob1, blob2);
  });
});
