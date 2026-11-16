import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

process.env.TR_PACKAGE_ROOT = process.cwd();
const owner = await import(pathToFileURL(path.resolve('scaffold/.agent/skills/total-recall/plugins/auth/src/configuration.mjs')).href);
const store = await import(pathToFileURL(path.resolve('scaffold/.agent/skills/total-recall/plugins/auth/src/secrets-store.mjs')).href);
const { resolveConnectionToken } = await import('./connection-token.mjs');

const PASSWORD = 'test-only-password-for-aes-gcm';

describe('resolveConnectionToken against the real Auth owner', () => {
  let root, authBrain, legacyFile;
  const prev = { pw: process.env.TR_SECRETS_PASSWORD, brain: process.env.TR_SECRETS_BRAIN };
  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'tr-conn-core-'));
    authBrain = path.join(root, 'auth'); fs.mkdirSync(path.join(authBrain, 'config'), { recursive: true });
    fs.mkdirSync(path.join(root, 'legacy', 'config'), { recursive: true });
    legacyFile = path.join(root, 'legacy', 'config', 'brain.json');
    fs.writeFileSync(legacyFile, JSON.stringify({ url: 'https://brain.test', token: 'legacy-token-canary' }));
    process.env.TR_SECRETS_PASSWORD = PASSWORD;
  });
  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
    for (const [k, v] of [['TR_SECRETS_PASSWORD', prev.pw], ['TR_SECRETS_BRAIN', prev.brain]]) { if (v === undefined) delete process.env[k]; else process.env[k] = v; }
  });
  const resolve = (extra = {}) => resolveConnectionToken({ owner, authBrainDir: authBrain, url: 'https://brain.test', legacyBrainJson: [legacyFile], ...extra });

  it('uses an explicit operator token without touching the owner', async () => {
    const boom = { connectionToken: () => { throw new Error('owner must not run'); } };
    expect(await resolveConnectionToken({ explicit: 'operator', url: 'https://other.test', owner: boom })).toEqual({ token: 'operator', source: 'explicit' });
  });

  it('serves the Auth token for the configured origin and refuses another origin', async () => {
    await store.setSecret(authBrain, 'TOTAL_RECALL_TOKEN', 'auth-token');
    expect((await resolve()).token).toBe('auth-token');
    expect(await resolve({ url: 'https://elsewhere.test' })).toMatchObject({ token: null, reason: 'origin-mismatch' });
  });

  it('reads the legacy token in place when no store exists, writing nothing', async () => {
    const before = fs.readFileSync(legacyFile, 'utf8');
    expect(await resolve()).toMatchObject({ token: 'legacy-token-canary', source: 'legacy' });
    expect(fs.readFileSync(legacyFile, 'utf8')).toBe(before);
    expect(fs.readdirSync(path.join(authBrain, 'config'))).toEqual([]);
  });

  it('stops on an Auth failure and does not fall back to the legacy token', async () => {
    await store.setSecret(authBrain, 'TOTAL_RECALL_TOKEN', 'auth-token');
    process.env.TR_SECRETS_PASSWORD = 'a-different-password-entirely';
    await expect(resolve()).rejects.toThrow();
    delete process.env.TR_SECRETS_PASSWORD;
    await expect(resolve()).rejects.toThrow(/Unlock auth/);
  });

  it('selects the store from TR_SECRETS_BRAIN, never TR_BRAIN', async () => {
    await store.setSecret(authBrain, 'TOTAL_RECALL_TOKEN', 'auth-token');
    process.env.TR_SECRETS_BRAIN = authBrain;
    const prevUrl = process.env.TR_BRAIN; process.env.TR_BRAIN = 'https://brain.test';
    try { expect((await resolveConnectionToken({ owner, url: 'https://brain.test', legacyBrainJson: [legacyFile] })).token).toBe('auth-token'); }
    finally { if (prevUrl === undefined) delete process.env.TR_BRAIN; else process.env.TR_BRAIN = prevUrl; }
  });

  it('fails explicitly when the owner has no connection contract', async () => {
    await expect(resolveConnectionToken({ owner: {}, url: 'https://brain.test' })).rejects.toThrow(/no connectionToken contract/);
  });
});

describe('connection consumers hold no native legacy token read', () => {
  const files = ['status', 'sync', 'relay', 'connect', 'startup'].map(n => [n, fs.readFileSync(path.resolve(`src/cli/${n}.mjs`), 'utf8')]);
  it.each(files)('%s resolves through the Auth owner contract only', (_name, src) => {
    expect(src).toMatch(/connection-token\.mjs/);
    expect(src).not.toMatch(/(?:brainConfig|cfg|config|brainJson)\??\.token\b/);
    expect(src).not.toMatch(/totalRecallToken/);
  });
});
