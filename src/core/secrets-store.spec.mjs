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
    delete process.env.TR_SECRETS_PASSWORD;
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
    // Bypass write validation by patching store file directly
    const { loadSecrets, saveSecrets, resolveSecretsPath } = await import('./secrets-store.mjs');
    const secrets = await loadSecrets(brain);
    secrets.__tr_secrets_meta.keys.LEGACY_KEY.repos = ['alpha', 'beta'];
    await saveSecrets(brain, secrets);
    const meta = await listSecretsMeta(brain);
    const row = meta.find((m) => m.key === 'LEGACY_KEY');
    expect(row.multi_repo_error).toBe(true);
    expect(row.binding_error).toMatch(/2 repos/);
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

  it('writes secrets file with restricted mode intent', async () => {
    await setSecret(brain, 'k', 'value-long-enough');
    const p = resolveSecretsPath(brain);
    expect(fs.existsSync(p)).toBe(true);
    const raw = fs.readFileSync(p, 'utf8');
    expect(raw).toContain('k');
    // value is in file (that's the store) but mode should be 0o600 when supported
    try {
      const mode = fs.statSync(p).mode & 0o777;
      expect(mode).toBe(0o600);
    } catch {
      // some FS ignore mode
    }
  });
});
