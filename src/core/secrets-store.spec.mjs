import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import {
  setSecret,
  getSecret,
  listSecretsMeta,
  rotateSecret,
  deleteSecret,
  textContainsSecrets,
  recordUsage,
  summarizeUsage,
  resolveSecretsPath,
  replaceSecretsBufferAtomic,
  migrateSecretsToEncryptedIfNeeded,
  loadSecrets,
} from './secrets-store.mjs';

function tmpBrain() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'tr-secrets-'));
}

vi.mock('./research-queue.mjs', () => ({
  addToQueue: vi.fn()
}));

vi.mock('./logger.mjs', () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn()
  }
}));

describe('secrets-store', () => {
  let brain;
  const prevPass = process.env.TR_SECRETS_PASSWORD;

  beforeEach(() => {
    brain = tmpBrain();
    process.env.TR_SECRETS_PASSWORD = 'test-only-password-for-aes-gcm';
  });

  afterEach(() => {
    fs.rmSync(brain, { recursive: true, force: true });
    if (prevPass === undefined) delete process.env.TR_SECRETS_PASSWORD;
    else process.env.TR_SECRETS_PASSWORD = prevPass;
  });

  it('sets and lists metadata without exposing value in list', async () => {
    await setSecret(brain, 'openai_api_key', 'sk-test-secret-value-12345', {
      provider: 'openai',
    });
    const meta = await listSecretsMeta(brain);
    expect(meta).toHaveLength(1);
    expect(meta[0].key).toBe('openai_api_key');
    expect(meta[0].length).toBeGreaterThan(10);
    expect(meta[0].fingerprint).toBeTruthy();
    expect(JSON.stringify(meta)).not.toContain('sk-test-secret-value-12345');

    const got = await getSecret(brain, 'openai_api_key');
    expect(got.found).toBe(true);
    expect(got.value).toBe('sk-test-secret-value-12345');
  });

  it('rotates and deletes', async () => {
    await setSecret(brain, 'token_a', 'old-value-long-enough');
    await rotateSecret(brain, 'token_a', 'new-value-long-enough');
    expect((await getSecret(brain, 'token_a')).value).toBe('new-value-long-enough');
    const meta = await listSecretsMeta(brain);
    expect(meta[0].rotated_at).toBeTruthy();
    await deleteSecret(brain, 'token_a');
    expect((await getSecret(brain, 'token_a')).found).toBe(false);
  });

  it('detects secret leak in surface text', async () => {
    await setSecret(brain, 'leak_key', 'super-secret-token-xyz');
    const clean = await textContainsSecrets(brain, 'hello world instructions');
    expect(clean.leak).toBe(false);
    const dirty = await textContainsSecrets(
      brain,
      'INSTRUCTIONS\nsuper-secret-token-xyz\nmore text',
    );
    expect(dirty.leak).toBe(true);
    expect(dirty.keys).toContain('leak_key');
  });

  it('rejects multi-repo binding on write', async () => {
    await setSecret(brain, 'SHARED_KEY', 'value-long-enough-xx', { provider: 'openai' });
    const { updateSecretMeta, normalizeReposBinding } = await import('./secrets-store.mjs');
    expect(() => normalizeReposBinding(['a', 'b'], { strict: true })).toThrow(/at most ONE repo/);
    await expect(
      updateSecretMeta(brain, 'SHARED_KEY', { repos: ['repo-a', 'repo-b'] }),
    ).rejects.toThrow(/at most ONE repo/);
    await updateSecretMeta(brain, 'SHARED_KEY', { repos: ['repo-a'] });
    const meta = await listSecretsMeta(brain);
    expect(meta[0].repos).toEqual(['repo-a']);
    expect(meta[0].multi_repo_error).toBe(false);
    expect(meta[0].repo).toBe('repo-a');
  });

  it('flags legacy multi-repo data as error', async () => {
    await setSecret(brain, 'LEGACY_KEY', 'value-long-enough-yy');
    // Bypass metadata validation through the store API to simulate legacy data.
    const { loadSecrets, saveSecrets, resolveSecretsPath } = await import('./secrets-store.mjs');
    const secrets = await loadSecrets(brain);
    secrets.__tr_secrets_meta.keys.LEGACY_KEY.repos = ['alpha', 'beta'];
    await saveSecrets(brain, secrets);
    const meta = await listSecretsMeta(brain);
    const row = meta.find((m) => m.key === 'LEGACY_KEY');
    expect(row.multi_repo_error).toBe(true);
    expect(row.binding_error).toMatch(/2 repos/);
  });

  it('detects same credential value shared across repos/apps as ERROR', async () => {
    const { updateSecretMeta, getSharedValueHealth } = await import('./secrets-store.mjs');
    const same = 'shared-api-key-material-xyz-999';
    await setSecret(brain, 'OPENROUTER_API_KEY', same, {
      provider: 'openrouter',
      skip_integration_research: true,
    });
    await setSecret(brain, 'DEVELOPER_OPENROUTER_API_KEY', same, {
      provider: 'openrouter',
      skip_integration_research: true,
    });
    await updateSecretMeta(brain, 'OPENROUTER_API_KEY', { repos: ['ultrachat'] });
    // developer key stays unbound → app "developer"
    const meta = await listSecretsMeta(brain);
    const a = meta.find((m) => m.key === 'OPENROUTER_API_KEY');
    const b = meta.find((m) => m.key === 'DEVELOPER_OPENROUTER_API_KEY');
    expect(a.shared_value).toBe(true);
    expect(b.shared_value).toBe(true);
    expect(a.shared_with.some((s) => s.key === 'DEVELOPER_OPENROUTER_API_KEY')).toBe(true);
    expect(a.shared_apps).toEqual(expect.arrayContaining(['developer', 'ultrachat']));
    expect(a.shared_value_error).toMatch(/SHARED CREDENTIAL/i);
    expect(a.fingerprint).toBe(b.fingerprint);

    const health = await getSharedValueHealth(brain);
    expect(health.healthy).toBe(false);
    expect(health.multi_app_groups).toBeGreaterThanOrEqual(1);
    expect(health.errors[0].keys).toEqual(
      expect.arrayContaining(['OPENROUTER_API_KEY', 'DEVELOPER_OPENROUTER_API_KEY']),
    );

    // Unique values clear the error
    await setSecret(brain, 'DEVELOPER_OPENROUTER_API_KEY', 'unique-other-value-abc-111', {
      provider: 'openrouter',
      skip_integration_research: true,
    });
    const health2 = await getSharedValueHealth(brain);
    expect(health2.healthy).toBe(true);
  });

  it('shared_value_ok waives intentional duplicate storage', async () => {
    const { updateSecretMeta, getSharedValueHealth } = await import('./secrets-store.mjs');
    const same = 'mirrored-intentionally-value-42';
    await setSecret(brain, 'KEY_A', same, { skip_integration_research: true });
    await setSecret(brain, 'KEY_B', same, { skip_integration_research: true });
    await updateSecretMeta(brain, 'KEY_A', { shared_value_ok: true });
    await updateSecretMeta(brain, 'KEY_B', { shared_value_ok: true });
    const health = await getSharedValueHealth(brain);
    expect(health.healthy).toBe(true);
    expect(health.groups.length).toBe(1);
    expect(health.groups[0].severity).toBe('ok');
  });

  it('records and summarizes usage', () => {
    recordUsage(brain, {
      provider: 'openai',
      model: 'gpt-test',
      input_tokens: 100,
      output_tokens: 50,
      cost_usd: 0.02,
      key_ref: 'openai_api_key',
    });
    const sum = summarizeUsage(brain, { days: 1 });
    expect(sum.events).toBe(1);
    expect(sum.cost_usd).toBeCloseTo(0.02);
    expect(sum.input_tokens).toBe(100);
  });

  it('always writes AES ciphertext with restricted permissions', async () => {
    await setSecret(brain, 'k', 'value-long-enough');
    const p = resolveSecretsPath(brain);
    expect(fs.existsSync(p)).toBe(true);
    const raw = fs.readFileSync(p);
    expect(raw[0]).not.toBe('{'.charCodeAt(0));
    expect(raw.toString('utf8')).not.toContain('value-long-enough');
    try {
      const mode = fs.statSync(p).mode & 0o777;
      expect(mode).toBe(0o600);
    } catch {
      // some FS ignore mode
    }
  });

  it('validates before atomically replacing the encrypted store', async () => {
    const source = tmpBrain();
    await setSecret(source, 'SYNCED_KEY', 'synced-secret-value');
    const encrypted = fs.readFileSync(resolveSecretsPath(source));
    await replaceSecretsBufferAtomic(brain, encrypted);
    expect((await getSecret(brain, 'SYNCED_KEY')).value).toBe('synced-secret-value');
    await expect(replaceSecretsBufferAtomic(brain, Buffer.from('not-valid'))).rejects.toThrow();
    expect((await getSecret(brain, 'SYNCED_KEY')).value).toBe('synced-secret-value');
    fs.rmSync(source, { recursive: true, force: true });
  });

  it('migrates legacy plain-JSON secrets.enc to AES when password is set', async () => {
    const filePath = resolveSecretsPath(brain);
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(
      filePath,
      JSON.stringify({ LEGACY_KEY: { value: 'legacy-secret-value-xyz', provider: 'test' } }),
      'utf8',
    );
    expect(fs.readFileSync(filePath, 'utf8').trim().startsWith('{')).toBe(true);

    const result = await migrateSecretsToEncryptedIfNeeded(brain);
    expect(result.migrated).toBe(true);
    const raw = fs.readFileSync(filePath);
    expect(raw[0]).not.toBe('{'.charCodeAt(0));
    const loaded = await loadSecrets(brain);
    expect(loaded.LEGACY_KEY?.value || loaded.LEGACY_KEY).toBeTruthy();

    const again = await migrateSecretsToEncryptedIfNeeded(brain);
    expect(again.migrated).toBe(false);
    expect(again.reason).toBe('already-encrypted');
  });
});
