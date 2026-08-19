import { describe, it, expect } from 'vitest';
import {
  parseEnvText,
  maskSecret,
  inferProvider,
  candidatesFromPaste,
  isCandidateKey,
} from './env-import.mjs';

describe('env-import', () => {
  it('parses dotenv text', () => {
    const map = parseEnvText(`
# comment
OPENAI_API_KEY=sk-test-123
export ANTHROPIC_API_KEY="sk-ant-abc"
EMPTY=
NOT_A_SECRET=hello
`);
    expect(map.OPENAI_API_KEY).toBe('sk-test-123');
    expect(map.ANTHROPIC_API_KEY).toBe('sk-ant-abc');
    expect(map.EMPTY).toBeUndefined();
  });

  it('masks secrets', () => {
    expect(maskSecret('sk-abcdefghij')).toContain('…');
    expect(maskSecret('short')).toBe('••••••••');
  });

  it('infers provider labels generically (not a whitelist)', () => {
    expect(inferProvider('OPENAI_API_KEY')).toBe('openai');
    expect(inferProvider('ANTHROPIC_API_KEY')).toBe('anthropic');
    // Generic slug from name segments — not a product whitelist
    expect(inferProvider('MY_CUSTOM_VENDOR_API_KEY')).toMatch(/^my/);
    expect(inferProvider('WEIRD_THING_TOKEN')).toMatch(/^weird/);
    expect(inferProvider('BRAND_NEW_SERVICE_SECRET')).toBeTruthy();
  });

  it('isCandidateKey is pattern-based only', () => {
    expect(isCandidateKey('OPENAI_API_KEY')).toBe(true);
    expect(isCandidateKey('SOME_RANDOM_API_KEY')).toBe(true);
    expect(isCandidateKey('FOO_TOKEN')).toBe(true);
    expect(isCandidateKey('DB_PASSWORD')).toBe(true);
    expect(isCandidateKey('PATH')).toBe(false);
    expect(isCandidateKey('NODE_ENV')).toBe(false);
    expect(isCandidateKey('HOSTNAME')).toBe(false);
    expect(isCandidateKey('APP_NAME')).toBe(false); // no secret suffix
  });

  it('candidatesFromPaste keeps any secret-shaped key, not a known list', () => {
    const { candidates, pairs } = candidatesFromPaste(`
OPENAI_API_KEY=sk-xyz-longenough
PATH=/usr/bin
MY_BRAND_NEW_API_KEY=secretvalue123
CUSTOM_WEBHOOK_SECRET=whsec_abc
`);
    expect(pairs.OPENAI_API_KEY).toBe('sk-xyz-longenough');
    expect(pairs.MY_BRAND_NEW_API_KEY).toBe('secretvalue123');
    expect(pairs.CUSTOM_WEBHOOK_SECRET).toBe('whsec_abc');
    expect(pairs.PATH).toBeUndefined();
    expect(candidates.every((c) => c.masked && !String(c.masked).includes('sk-xyz'))).toBe(true);
  });
});

describe('store-control keys are never importable', () => {
  // TR_SECRETS_PASSWORD is exported into every shell by ~/.zshenv from the
  // Keychain, so it appears in the env scan like any other credential. Before
  // this guard, `secret import-env --all` — the command the help text
  // recommends — wrote the store's own master password into the store it
  // encrypts: unreadable without the value it holds, and the one credential
  // protecting everything else parked next to what it protects.
  it('rejects the secrets-store master password', () => {
    expect(isCandidateKey('TR_SECRETS_PASSWORD')).toBe(false);
    expect(isCandidateKey('tr_secrets_password')).toBe(false);
  });

  it('rejects the other store-control variables', () => {
    expect(isCandidateKey('TR_SECRETS_KEY_CACHE')).toBe(false);
    expect(isCandidateKey('TR_REMOTE_VAULT_TOKEN')).toBe(false);
  });

  it('still accepts ordinary credentials', () => {
    expect(isCandidateKey('OPENAI_API_KEY')).toBe(true);
    expect(isCandidateKey('STRIPE_SECRET_KEY')).toBe(true);
    expect(isCandidateKey('TR_MESH_SYNC_TOKEN')).toBe(true);
  });
});
