import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import fs from 'node:fs';

// ─── Auth mock: requireAuth enforces auth, requireScope is permissive ─────────

let authEnabled = true;
const authOwner = vi.hoisted(() => ({ listSecretsMeta: vi.fn(), setSecret: vi.fn(), deleteSecret: vi.fn() }));

vi.mock('../../core/plugin-runtime.mjs', async importOriginal => {
  const actual = await importOriginal();
  return { ...actual, loadPluginModule: vi.fn(async (id, name, ...args) => {
    return id === 'auth' && name === 'secrets-store' ? authOwner : actual.loadPluginModule(id, name, ...args);
  }) };
});

vi.mock('../auth.mjs', () => ({
  requireAuth: (req, res, next) => {
    if (!authEnabled) return res.status(401).json({ error: 'Unauthorized' });
    req.user = { id: 'test' };
    next();
  },
  requireScope: () => (req, res, next) => next(),
  loadSecurityConfig: () => ({ api: { pats: [] }, rate_limits: {} }),
}));

vi.mock('./_shared.mjs', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    BRAIN_DIR: '/tmp/mock-brain',
    CONFIG_DIR: '/tmp/mock-brain/config',
    AGENT_DIR: '/mock/agent',
    serverError: (res, err) => res.status(500).json({ error: err.message }),
    badRequest: (res, msg) => res.status(400).json({ error: msg }),
  };
});

vi.mock('../../core/runtime.mjs', () => ({
  loadRuntimeConfig: vi.fn().mockReturnValue({ model: 'test-model' }),
}));

import { configRouter } from './config.mjs';

const app = express();
app.use(express.json());
app.use(configRouter);

describe('Config Router', () => {
  beforeEach(() => {
    authEnabled = true;
    vi.clearAllMocks();
    authOwner.listSecretsMeta.mockReset().mockResolvedValue([]);
    authOwner.deleteSecret.mockReset().mockResolvedValue(false);
    authOwner.setSecret.mockReset().mockResolvedValue(undefined);
  });

  it('GET /api/config requires auth', async () => {
    authEnabled = false;
    const res = await request(app).get('/api/config');
    expect(res.status).toBe(401);
  });

  it('GET /api/config returns security and runtime shape when authenticated', async () => {
    vi.spyOn(fs, 'existsSync').mockReturnValue(false);

    const res = await request(app).get('/api/config');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('security');
    expect(res.body).toHaveProperty('runtime');
  });

  it('GET /api/config-json returns all config sections', async () => {
    vi.spyOn(fs, 'existsSync').mockReturnValue(false);

    const res = await request(app).get('/api/config-json');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('security');
    expect(res.body).toHaveProperty('budget');
    expect(res.body).toHaveProperty('brain');
    expect(res.body).toHaveProperty('secrets');
  });

  it('reads only allowed credential presence from Auth metadata', async () => {
    vi.spyOn(fs, 'existsSync').mockReturnValue(false);
    authOwner.listSecretsMeta.mockResolvedValue([
      { key: 'openai_api_key', set: true, value: 'fixture-owner-value' },
      { key: 'google_api_key', set: false },
      { key: 'unrelated-key', set: true },
    ]);
    const res = await request(app).get('/api/config-json');
    expect(res.status).toBe(200);
    expect(res.body.secrets).toEqual({ openai_api_key: '••••••••', google_api_key: '' });
    expect(JSON.stringify(res.body)).not.toContain('fixture-owner-value');
    expect(authOwner.listSecretsMeta).toHaveBeenCalledWith('/tmp/mock-brain');
  });

  it('fails without reading a native credential file when Auth is unavailable', async () => {
    vi.spyOn(fs, 'existsSync').mockReturnValue(false);
    const read = vi.spyOn(fs, 'readFileSync');
    authOwner.listSecretsMeta.mockRejectedValue(new Error('fixture-private-diagnostic'));
    const res = await request(app).get('/api/config-json');
    expect(res.status).toBe(503);
    expect(res.body).toEqual({ error: 'Auth credential metadata is unavailable.' });
    expect(read.mock.calls.some(([file]) => String(file).endsWith('secrets.enc'))).toBe(false);
    read.mockRestore();
  });

  it.each([null, {}, [{ key: 'openai_api_key', set: 'unknown' }], [null]])('rejects malformed Auth metadata: %j', async meta => {
    vi.spyOn(fs, 'existsSync').mockReturnValue(false);
    authOwner.listSecretsMeta.mockResolvedValue(meta);
    const res = await request(app).get('/api/config-json');
    expect(res.status).toBe(503);
    expect(res.body).toEqual({ error: 'Auth credential metadata is unavailable.' });
  });

  it('does not advertise success or expose diagnostics when Auth deletion fails', async () => {
    vi.spyOn(fs, 'existsSync').mockReturnValue(true);
    authOwner.deleteSecret.mockRejectedValue(new Error('fixture-private-diagnostic'));
    const res = await request(app).post('/api/config-json').send({ secrets: { openai_api_key: '' } });
    expect(res.status).toBe(503);
    expect(res.body).toEqual({ error: 'Auth credential update did not complete; verify the stored state before retrying.' });
    expect(authOwner.deleteSecret).toHaveBeenCalledWith('/tmp/mock-brain', 'openai_api_key', { action: 'delete', actor: 'settings-config' });
    expect(authOwner.setSecret).not.toHaveBeenCalled();
  });

  it('preserves masked values and sends actual changes only to Auth', async () => {
    vi.spyOn(fs, 'existsSync').mockReturnValue(true);
    const res = await request(app).post('/api/config-json').send({ secrets: { openai_api_key: '[redacted]', google_api_key: 'fixture-value' } });
    expect(res.status).toBe(200);
    expect(authOwner.setSecret).toHaveBeenCalledExactlyOnceWith('/tmp/mock-brain', 'google_api_key', 'fixture-value', { action: 'set', actor: 'settings-config' });
    expect(authOwner.deleteSecret).not.toHaveBeenCalled();
    expect(JSON.stringify(res.body)).not.toContain('fixture-value');
  });

  it('GET /api/config/:name rejects path traversal attempts', async () => {
    const res = await request(app).get('/api/config/..%2F..%2Fetc%2Fpasswd');
    // Either 400 (bad name caught) or 404 (route not matched) — either is safe
    expect([400, 404]).toContain(res.status);
  });

  it('GET /api/config/DESIGN.md returns default content when missing', async () => {
    vi.spyOn(fs, 'existsSync').mockReturnValue(false);

    const res = await request(app).get('/api/config/DESIGN.md');
    expect(res.status).toBe(200);
    expect(res.body.content).toMatch(/Design System/);
  });
});
