import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

// Real Auth owner modules from the pinned scaffold, a disposable store, and the real route.
const env = vi.hoisted(() => { process.env.TR_PACKAGE_ROOT = process.cwd(); return { root: '', authSrc: `${process.cwd()}/scaffold/.agent/skills/total-recall/plugins/auth/src` }; });
const AUTH_SRC = env.authSrc;

vi.mock('../../core/plugin-runtime.mjs', () => ({
  loadPluginModule: async (id, name) => {
    if (id !== 'auth') throw new Error(`unexpected owner ${id}`);
    return import(pathToFileURL(path.join(env.authSrc, `${name}.mjs`)).href);
  },
}));
vi.mock('../auth.mjs', () => ({ requireAuth: (r, s, n) => n(), requireScope: () => (r, s, n) => n(), loadSecurityConfig: () => ({}) }));
vi.mock('./_shared.mjs', async importOriginal => {
  const actual = await importOriginal();
  const fsm = await import('node:fs'); const osm = await import('node:os'); const pathm = await import('node:path');
  env.root = fsm.mkdtempSync(pathm.join(osm.tmpdir(), 'tr-roundtrip-'));
  fsm.mkdirSync(pathm.join(env.root, 'config'), { recursive: true });
  return { ...actual, BRAIN_DIR: env.root, CONFIG_DIR: pathm.join(env.root, 'config'),
    serverError: (res, err) => res.status(500).json({ error: err.message }), badRequest: (res, m) => res.status(400).json({ error: m }) };
});
vi.mock('../../core/runtime.mjs', () => ({ loadRuntimeConfig: vi.fn() }));

import { configRouter } from './config.mjs';
import { resolveConnectionToken, saveBackendConnection, authStoreDir } from '../../core/connection-token.mjs';
import { writeBrainConnection } from '../../core/memory-brain.mjs';

const app = express();
app.use(express.json());
app.use(configRouter);

const FIELDS = {
  google_api_key: ['GOOGLE_API_KEY', 'googleApiKey'],
  openai_api_key: ['OPENAI_API_KEY', 'openAiApiKey'],
  openrouter_api_key: ['OPENROUTER_API_KEY', 'openRouterApiKey'],
  tavily_api_key: ['TAVILY_API_KEY', 'tavilyApiKey'],
  brave_api_key: ['BRAVE_SEARCH_API_KEY', 'braveSearchApiKey'],
  exa_api_key: ['EXA_API_KEY', 'exaApiKey'],
  serper_api_key: ['SERPER_API_KEY', 'serperApiKey'],
  github_token: ['GITHUB_TOKEN', 'githubToken'],
};

describe('settings credentials are consumed by the Auth runtime configuration', () => {
  const prev = process.env.TR_SECRETS_PASSWORD;
  let owner, store;
  beforeEach(async () => {
    process.env.TR_SECRETS_PASSWORD = 'test-only-password-for-aes-gcm';
    process.env.TR_SECRETS_BRAIN = env.root;
    fs.rmSync(path.join(env.root, 'config'), { recursive: true, force: true });
    fs.mkdirSync(path.join(env.root, 'config'), { recursive: true });
    owner = await import(pathToFileURL(path.join(AUTH_SRC, 'configuration.mjs')).href);
    store = await import(pathToFileURL(path.join(AUTH_SRC, 'secrets-store.mjs')).href);
  });
  afterEach(() => { if (prev === undefined) delete process.env.TR_SECRETS_PASSWORD; else process.env.TR_SECRETS_PASSWORD = prev; delete process.env.TR_SECRETS_BRAIN; });

  it.each(Object.entries(FIELDS))('%s round-trips through the real store and runtimeConfiguration', async (alias, [canonical, field]) => {
    expect(owner.RUNTIME_CREDENTIAL_KEYS[field]).toBe(canonical);
    const save = await request(app).post('/api/config-json').send({ secrets: { [alias]: `value-${alias}` } });
    expect(save.status).toBe(200);
    expect(save.body).toEqual({ success: true, applied: ['secrets'] });
    // The actual consumer sees the saved credential.
    expect(owner.runtimeConfiguration({ brainDir: env.root })[field]).toBe(`value-${alias}`);
    // No lowercase literal key was created in the store.
    const names = (await store.listSecretsMeta(env.root)).map(r => r.key);
    expect(names).toContain(canonical);
    expect(names).not.toContain(alias);
    // Presence is reported under the public lowercase field, never the value.
    const read = await request(app).get('/api/config-json');
    expect(read.body.secrets[alias]).toBe('••••••••');
    expect(JSON.stringify(read.body)).not.toContain(`value-${alias}`);
    // Delete clears the canonical key the consumer reads.
    expect((await request(app).post('/api/config-json').send({ secrets: { [alias]: '' } })).status).toBe(200);
    expect(owner.runtimeConfiguration({ brainDir: env.root })[field]).toBeUndefined();
  });

  it('stores anthropic_api_key under ANTHROPIC_API_KEY', async () => {
    expect((await request(app).post('/api/config-json').send({ secrets: { anthropic_api_key: 'a-value' } })).status).toBe(200);
    expect((await store.getSecret(env.root, 'ANTHROPIC_API_KEY')).value).toBe('a-value');
    expect((await store.getSecret(env.root, 'anthropic_api_key')).found).toBe(false);
  });

  it('never exposes or copies a pre-existing lowercase value', async () => {
    await store.setSecret(env.root, 'google_api_key', 'legacy-lowercase-canary');
    const read = await request(app).get('/api/config-json');
    expect(read.body.secrets).toEqual({});
    expect(JSON.stringify(read.body)).not.toContain('legacy-lowercase-canary');
    await request(app).post('/api/config-json').send({ secrets: { google_api_key: 'new-value' } });
    expect((await store.getSecret(env.root, 'GOOGLE_API_KEY')).value).toBe('new-value');
    expect((await store.getSecret(env.root, 'google_api_key')).value).toBe('legacy-lowercase-canary');
  });

  it('the backend token lands on the key runtimeConfiguration exposes as totalRecallToken', async () => {
    expect((await request(app).post('/api/config-json').send({ brain: { url: 'https://backend.test', token: 'tr_backend_canary' } })).status).toBe(200);
    expect(owner.runtimeConfiguration({ brainDir: env.root }).totalRecallToken).toBe('tr_backend_canary');
    expect((await request(app).get('/api/config-json')).body.brain.has_token).toBe(true);
  });

  it('rejects an unknown or canonical-cased field', async () => {
    const res = await request(app).post('/api/config-json').send({ secrets: { GOOGLE_API_KEY: 'x' } });
    expect(res.status).toBe(400);
  });

  describe('backend token endpoint binding', () => {
    const brainJson = () => path.join(env.root, 'config', 'brain.json');
    const resolveFor = url => owner.connectionToken({ brainDir: env.root, url, legacyBrainJson: [brainJson()] });
    const post = body => request(app).post('/api/config-json').send(body);

    it('a saved token follows only the endpoint it was saved for', async () => {
      expect((await post({ brain: { url: 'https://a.test', token: 'tr_bound_to_a' } })).status).toBe(200);
      expect(resolveFor('https://a.test')).toMatchObject({ token: 'tr_bound_to_a', source: 'auth' });
      // Changing only the public URL must not hand the old credential to the new endpoint.
      expect((await post({ brain: { url: 'https://b.test' } })).status).toBe(200);
      expect(resolveFor('https://b.test')).toMatchObject({ token: null });
      expect(resolveFor(undefined)).toMatchObject({ token: null });
      // It is still bound to the endpoint it was saved for, and goes nowhere else.
      expect(resolveFor('https://a.test')).toMatchObject({ token: 'tr_bound_to_a', source: 'auth' });
    });

    it('a new token with a new URL binds to the new endpoint', async () => {
      await post({ brain: { url: 'https://a.test', token: 'tr_old' } });
      expect((await post({ brain: { url: 'https://b.test', token: 'tr_new' } })).status).toBe(200);
      expect(resolveFor('https://b.test')).toMatchObject({ token: 'tr_new', source: 'auth' });
      expect(resolveFor('https://a.test')).toMatchObject({ token: null });
    });

    it('a token saved without any URL stays unbound and is never forwarded', async () => {
      expect((await post({ brain: { token: 'tr_no_endpoint' } })).status).toBe(400);
      expect(owner.runtimeConfiguration({ brainDir: env.root }).totalRecallToken).toBeUndefined();
    });

    it('rewriting the brain.json URL out of band does not rebind an Auth token', async () => {
      await post({ brain: { url: 'https://a.test', token: 'tr_bound_to_a' } });
      fs.writeFileSync(brainJson(), JSON.stringify({ url: 'https://evil.test' }));
      expect(resolveFor('https://evil.test')).toMatchObject({ token: null });
    });

    it('a failed brain.json write after the token was saved leaves the binding on the saved endpoint', async () => {
      await post({ brain: { url: 'https://a.test', token: 'tr_bound_to_a' } });
      fs.rmSync(brainJson());
      fs.mkdirSync(brainJson()); // the brain write now fails
      const res = await post({ brain: { url: 'https://b.test', token: 'tr_new' } });
      expect(res.status).toBe(500);
      expect(res.body).toMatchObject({ applied: ['secrets'], failed: 'brain' });
      fs.rmSync(brainJson(), { recursive: true });
      // The token was bound to b.test by Auth at save time, so it can never reach a.test or an unbound url.
      fs.writeFileSync(brainJson(), JSON.stringify({ url: 'https://a.test' }));
      expect(resolveFor('https://a.test')).toMatchObject({ token: null });
      fs.writeFileSync(brainJson(), JSON.stringify({ url: 'https://b.test' }));
      expect(resolveFor('https://b.test')).toMatchObject({ token: 'tr_new' });
    });

    it('a failed Auth write leaves the previous token and binding untouched', async () => {
      await post({ brain: { url: 'https://a.test', token: 'tr_bound_to_a' } });
      const before = fs.readFileSync(brainJson(), 'utf8');
      process.env.TR_SECRETS_PASSWORD = 'a-different-password-entirely';
      const res = await post({ brain: { url: 'https://b.test', token: 'tr_new' } });
      process.env.TR_SECRETS_PASSWORD = 'test-only-password-for-aes-gcm';
      expect(res.status).toBe(503);
      expect(fs.readFileSync(brainJson(), 'utf8')).toBe(before);
      expect(resolveFor('https://a.test')).toMatchObject({ token: 'tr_bound_to_a' });
    });

    it('a legacy brain.json token is preserved and served only for its own file URL, with no Auth token', async () => {
      fs.writeFileSync(brainJson(), JSON.stringify({ url: 'https://old.test', token: 'tr_legacy' }));
      const before = fs.readFileSync(brainJson(), 'utf8');
      expect(resolveFor('https://old.test')).toMatchObject({ token: 'tr_legacy', source: 'legacy' });
      expect(resolveFor('https://other.test')).toMatchObject({ token: null });
      expect(fs.readFileSync(brainJson(), 'utf8')).toBe(before);
    });
  });

  describe('settings, connect and relay share one Auth store', () => {
    let other;
    beforeEach(() => {
      // A server filesystem (BRAIN_DIR) that differs from the host's Auth store.
      other = fs.mkdtempSync(path.join(os.tmpdir(), 'tr-auth-store-'));
      fs.mkdirSync(path.join(other, 'config'), { recursive: true });
      process.env.TR_SECRETS_BRAIN = other;
    });
    afterEach(() => fs.rmSync(other, { recursive: true, force: true }));
    const brainJson = () => path.join(env.root, 'config', 'brain.json');

    it('settings writes to TR_SECRETS_BRAIN, never the server brain directory, and consumers read the same store', async () => {
      expect(authStoreDir()).toBe(other);
      const res = await request(app).post('/api/config-json').send({ brain: { url: 'https://a.test', token: 'tr_shared_store' }, secrets: { google_api_key: 'g-value' } });
      expect(res.status).toBe(200);
      expect(fs.existsSync(path.join(env.root, 'config', 'secrets.enc'))).toBe(false);
      expect(owner.runtimeConfiguration({ brainDir: other }).googleApiKey).toBe('g-value');
      // The default store of the connection consumers (relay, connect, status, startup) is the same one.
      const seen = await resolveConnectionToken({ url: 'https://a.test', legacyBrainJson: [brainJson()] });
      expect(seen).toMatchObject({ token: 'tr_shared_store', source: 'auth' });
      expect((await request(app).get('/api/config-json')).body.brain.has_token).toBe(true);
    });

    it('connect/setup save an explicit token through Auth and keep brain.json public', async () => {
      const brainDir = path.join(env.root);
      fs.writeFileSync(brainJson(), JSON.stringify({ name: 'demo', tags: ['x'] }));
      const file = await saveBackendConnection(brainDir, { url: 'https://a.test', token: 'tr_connect_token', provider: 'p' });
      expect(file).toBe(brainJson());
      const written = JSON.parse(fs.readFileSync(brainJson(), 'utf8'));
      expect(written).toEqual({ name: 'demo', tags: ['x'], url: 'https://a.test', provider: 'p' });
      expect(fs.readFileSync(brainJson(), 'utf8')).not.toContain('tr_connect_token');
      expect(await resolveConnectionToken({ url: 'https://a.test', legacyBrainJson: [brainJson()] })).toMatchObject({ token: 'tr_connect_token', source: 'auth' });
      // Never to another endpoint.
      expect(await resolveConnectionToken({ url: 'https://b.test', legacyBrainJson: [brainJson()] })).toMatchObject({ token: null });
    });

    it('a failed Auth save writes no public config', async () => {
      fs.writeFileSync(brainJson(), JSON.stringify({ name: 'demo' }));
      process.env.TR_SECRETS_PASSWORD = 'a-different-password-entirely';
      fs.writeFileSync(path.join(other, 'config', 'secrets.enc'), 'not a real store');
      await expect(saveBackendConnection(env.root, { url: 'https://a.test', token: 'tr_x' })).rejects.toThrow();
      process.env.TR_SECRETS_PASSWORD = 'test-only-password-for-aes-gcm';
      expect(JSON.parse(fs.readFileSync(brainJson(), 'utf8'))).toEqual({ name: 'demo' });
    });

    it('refuses an endpoint change on a legacy-token brain.json before saving anything', async () => {
      fs.writeFileSync(brainJson(), JSON.stringify({ url: 'https://old.test', token: 'tr_legacy' }));
      await expect(saveBackendConnection(env.root, { url: 'https://new.test', token: 'tr_new' })).rejects.toThrow(/legacy token/);
      expect(JSON.parse(fs.readFileSync(brainJson(), 'utf8'))).toEqual({ url: 'https://old.test', token: 'tr_legacy' });
      expect(fs.existsSync(path.join(other, 'config', 'secrets.enc'))).toBe(false);
      // The same endpoint is allowed, and the legacy token is preserved in place, not copied to Auth.
      await saveBackendConnection(env.root, { url: 'https://old.test', provider: 'p' });
      expect(JSON.parse(fs.readFileSync(brainJson(), 'utf8'))).toEqual({ url: 'https://old.test', token: 'tr_legacy', provider: 'p' });
      expect(fs.existsSync(path.join(other, 'config', 'secrets.enc'))).toBe(false);
    });

    it('requires a url to bind a token and never accepts a token in the public writer', async () => {
      await expect(saveBackendConnection(env.root, { token: 'tr_x' })).rejects.toThrow(/needs a backend URL/);
      expect(() => writeBrainConnection(env.root, { url: 'https://a.test', token: 'tr_x' })).toThrow(/Auth/);
    });
  });
});
