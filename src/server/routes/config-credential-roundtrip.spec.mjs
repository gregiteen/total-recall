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
    fs.rmSync(path.join(env.root, 'config'), { recursive: true, force: true });
    fs.mkdirSync(path.join(env.root, 'config'), { recursive: true });
    owner = await import(pathToFileURL(path.join(AUTH_SRC, 'configuration.mjs')).href);
    store = await import(pathToFileURL(path.join(AUTH_SRC, 'secrets-store.mjs')).href);
  });
  afterEach(() => { if (prev === undefined) delete process.env.TR_SECRETS_PASSWORD; else process.env.TR_SECRETS_PASSWORD = prev; });

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
    expect((await request(app).post('/api/config-json').send({ brain: { token: 'tr_backend_canary' } })).status).toBe(200);
    expect(owner.runtimeConfiguration({ brainDir: env.root }).totalRecallToken).toBe('tr_backend_canary');
    expect((await request(app).get('/api/config-json')).body.brain.has_token).toBe(true);
  });

  it('rejects an unknown or canonical-cased field', async () => {
    const res = await request(app).post('/api/config-json').send({ secrets: { GOOGLE_API_KEY: 'x' } });
    expect(res.status).toBe(400);
  });
});
