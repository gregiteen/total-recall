import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import fs from 'node:fs';

// ─── Auth mock: requireAuth enforces auth, requireScope is permissive ─────────

let authEnabled = true;
const authOwner = vi.hoisted(() => ({ listSecretsMeta: vi.fn(), setSecret: vi.fn(), deleteSecret: vi.fn() }));
const configOwner = vi.hoisted(() => ({ saveConnectionToken: vi.fn(), assertLegacyTokenNotRebound: vi.fn(), runtimeConfiguration: () => ({}) }));
const writes = vi.hoisted(() => ({ writeFileSecure: vi.fn() }));
const fixture = vi.hoisted(() => ({ security: { api: { pats: [] }, rate_limits: {} } }));

vi.mock('../../core/secure-file.mjs', () => ({ writeFileSecure: writes.writeFileSecure }));

vi.mock('../../core/plugin-runtime.mjs', async importOriginal => {
  const actual = await importOriginal();
  return { ...actual, loadPluginModule: vi.fn(async (id, name, ...args) => {
    return id === 'auth' && name === 'secrets-store' ? authOwner : id === 'auth' && name === 'configuration' ? configOwner : actual.loadPluginModule(id, name, ...args);
  }) };
});

vi.mock('../auth.mjs', () => ({
  requireAuth: (req, res, next) => {
    if (!authEnabled) return res.status(401).json({ error: 'Unauthorized' });
    req.user = { id: 'test' };
    next();
  },
  requireScope: () => (req, res, next) => next(),
  loadSecurityConfig: () => fixture.security,
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
    process.env.TR_SECRETS_BRAIN = '/tmp/mock-brain';
    authEnabled = true;
    vi.restoreAllMocks();
    vi.clearAllMocks();
    writes.writeFileSecure.mockReset();
    fixture.security = { api: { pats: [] }, rate_limits: {} };
    authOwner.listSecretsMeta.mockReset().mockResolvedValue([]);
    authOwner.deleteSecret.mockReset().mockResolvedValue(false);
    authOwner.setSecret.mockReset().mockResolvedValue(undefined);
    configOwner.saveConnectionToken.mockReset().mockResolvedValue({ key: 'TOTAL_RECALL_TOKEN', origin: 'https://x.test' });
    configOwner.assertLegacyTokenNotRebound.mockReset().mockReturnValue({ ok: true });
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
      { key: 'OPENAI_API_KEY', set: true, value: 'fixture-owner-value' },
      { key: 'GOOGLE_API_KEY', set: false },
      { key: 'google_api_key', set: true, value: 'legacy-lowercase-value' },
      { key: 'unrelated-key', set: true },
    ]);
    const res = await request(app).get('/api/config-json');
    expect(res.status).toBe(200);
    expect(res.body.secrets).toEqual({ openai_api_key: '••••••••', google_api_key: '' });
    expect(JSON.stringify(res.body)).not.toContain('fixture-owner-value');
    expect(JSON.stringify(res.body)).not.toContain('legacy-lowercase-value');
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

  it.each([null, {}, [{ key: 'OPENAI_API_KEY', set: 'unknown' }], [null]])('rejects malformed Auth metadata: %j', async meta => {
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
    expect(res.body).toEqual({ error: 'Auth credential update did not complete; verify the stored state before retrying.', applied: [], failed: 'secrets', not_attempted: [] });
    expect(authOwner.deleteSecret).toHaveBeenCalledWith('/tmp/mock-brain', 'OPENAI_API_KEY', { action: 'delete', actor: 'settings-config' });
    expect(authOwner.setSecret).not.toHaveBeenCalled();
  });

  it('preserves masked values and sends actual changes only to Auth', async () => {
    vi.spyOn(fs, 'existsSync').mockReturnValue(true);
    const res = await request(app).post('/api/config-json').send({ secrets: { openai_api_key: '[redacted]', google_api_key: 'fixture-value' } });
    expect(res.status).toBe(200);
    expect(authOwner.setSecret).toHaveBeenCalledExactlyOnceWith('/tmp/mock-brain', 'GOOGLE_API_KEY', 'fixture-value', { action: 'set', actor: 'settings-config' });
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

  describe('credential custody (A308)', () => {
    const SECRET_PAT = 'tr_static_pat_canary_91ac';
    const HASH = '$2b$10$passwordhashcanary';
    const BRAIN_TOKEN = 'brain-token-canary-77';
    const files = {
      'security.yml': `api:\n  allow_static_pats: true\n  pats:\n    - ${SECRET_PAT}\ndashboard:\n  password_hash: "${HASH}"\n  session_ttl_hours: 12\nnetwork:\n  require_https: true\n  api_key: nested-canary\n`,
      'budget.yml': 'budget:\n  enabled: true\n  daily_cap_usd: 5\n',
      'brain.json': JSON.stringify({ url: 'https://x.test', token: BRAIN_TOKEN, project_id: 'p-1', private_note: 'internal' }),
    };
    const stubFiles = () => {
      vi.spyOn(fs, 'existsSync').mockReturnValue(true);
      vi.spyOn(fs, 'readFileSync').mockImplementation(file => {
        const name = String(file).split('/').pop();
        if (name in files) return files[name];
        throw new Error(`unexpected read ${file}`);
      });
    };

    it.each(['secrets.enc', 'brain.json', 'security.yml', 'keys.jsonl', 'wizard-config.json', 'budget.yml'])('GET /api/config/%s does not read credential or private files', async name => {
      stubFiles();
      const res = await request(app).get(`/api/config/${name}`);
      expect(res.status).toBe(400);
      expect(JSON.stringify(res.body)).not.toContain(BRAIN_TOKEN);
      expect(fs.readFileSync).not.toHaveBeenCalled();
    });

    it.each(['secrets.enc', 'brain.json', 'security.yml', 'keys.jsonl'])('PUT /api/config/%s cannot overwrite credential files', async name => {
      const write = vi.spyOn(fs, 'writeFileSync').mockImplementation(() => {});
      vi.spyOn(fs, 'existsSync').mockReturnValue(true);
      const res = await request(app).put(`/api/config/${name}`).send({ content: 'x' });
      expect(res.status).toBe(400);
      expect(write).not.toHaveBeenCalled();
    });

    it('PUT /api/config/DESIGN.md validates content before touching the filesystem (real writes: config-public-file.spec)', async () => {
      const open = vi.spyOn(fs, 'openSync');
      vi.spyOn(fs, 'existsSync').mockReturnValue(true);
      expect((await request(app).put('/api/config/DESIGN.md').send({})).status).toBe(400);
      expect(open).not.toHaveBeenCalled();
    });

    it('GET /api/config-json returns no static PATs, hashes, brain token or unlisted fields', async () => {
      stubFiles();
      const res = await request(app).get('/api/config-json');
      expect(res.status).toBe(200);
      const text = JSON.stringify(res.body);
      for (const canary of [SECRET_PAT, HASH, BRAIN_TOKEN, 'nested-canary', 'internal', '"pats"', 'password_hash']) expect(text).not.toContain(canary);
      expect(res.body.security).toEqual({ api: { allow_static_pats: true }, dashboard: { session_ttl_hours: 12 }, network: { require_https: true } });
      expect(res.body.brain).toEqual({ url: 'https://x.test', has_token: true });
    });

    it('GET /api/config applies the same projection and redacts nested runtime credentials', async () => {
      fixture.security = { api: { pats: [SECRET_PAT], allow_static_pats: false }, dashboard: { password_hash: HASH }, rate_limits: { api_requests_per_minute: 5 } };
      vi.spyOn(fs, 'existsSync').mockReturnValue(true);
      vi.spyOn(fs, 'readFileSync').mockReturnValue('providers:\n  openai:\n    api_key: runtime-canary\nmode: fast\n');
      const res = await request(app).get('/api/config');
      expect(res.status).toBe(200);
      const text = JSON.stringify(res.body);
      for (const canary of [SECRET_PAT, HASH, 'runtime-canary']) expect(text).not.toContain(canary);
      expect(res.body.security).toEqual({ api: { allow_static_pats: false }, rate_limits: { api_requests_per_minute: 5 } });
      expect(res.body.runtime.mode).toBe('fast');
    });

    it.each([
      [{ security: { api: { pats: ['tr_x'] } } }, 'security.api.pats'],
      [{ security: { dashboard: { password_hash: 'h' } } }, 'security.dashboard.password_hash'],
      [{ security: { bind: { port: 'abc' } } }, 'security.bind.port'],
      [{ brain: { secret: 'x' } }, 'brain.secret'],
      [{ brain: { project_id: 'other' } }, 'brain.project_id'],
      [{ brain: { token: 5 } }, 'brain.token'],
      [{ secrets: { unrelated_key: 'x' } }, 'secrets.unrelated_key'],
    ])('POST /api/config-json rejects %j before writing anything', async (body, field) => {
      stubFiles();
      const res = await request(app).post('/api/config-json').send({ budget: { budget: { enabled: true } }, ...body });
      expect(res.status).toBe(400);
      expect(res.body.error).toContain(field);
      expect(writes.writeFileSecure).not.toHaveBeenCalled();
      expect(authOwner.setSecret).not.toHaveBeenCalled();
    });

    it('POST /api/config-json merges allowlisted fields and preserves stored credential fields', async () => {
      stubFiles();
      const res = await request(app).post('/api/config-json').send({ security: { network: { require_https: false }, dashboard: { session_ttl_hours: null } }, brain: { name: 'n', has_token: true, token: '' } });
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ success: true, applied: ['security', 'brain'] });
      const [securityCall, brainCall] = writes.writeFileSecure.mock.calls;
      expect(securityCall[1]).toContain(SECRET_PAT);
      expect(securityCall[1]).toContain(HASH);
      expect(securityCall[1]).toContain('require_https: false');
      const brain = JSON.parse(brainCall[1]);
      expect(brain).toMatchObject({ token: BRAIN_TOKEN, name: 'n', private_note: 'internal' });
      expect(brain).not.toHaveProperty('has_token');
    });

    it('reports exactly what applied when a later file write fails', async () => {
      stubFiles();
      authOwner.setSecret.mockResolvedValue(undefined);
      writes.writeFileSecure.mockImplementation(file => { if (String(file).endsWith('budget.yml')) throw new Error('disk-canary'); });
      const res = await request(app).post('/api/config-json').send({
        secrets: { openai_api_key: 'fixture-value' }, security: { network: { require_https: true } },
        budget: { budget: { enabled: false } }, brain: { name: 'n' },
      });
      expect(res.status).toBe(500);
      expect(res.body).toEqual({ error: 'Config update did not complete; the listed sections show what was applied.', applied: ['secrets', 'security'], failed: 'budget', not_attempted: ['brain'] });
      expect(JSON.stringify(res.body)).not.toContain('disk-canary');
    });

    it('reports applied keys and untouched sections when Auth fails midway', async () => {
      stubFiles();
      authOwner.setSecret.mockResolvedValueOnce(undefined).mockRejectedValueOnce(new Error('auth-canary'));
      const res = await request(app).post('/api/config-json').send({ secrets: { google_api_key: 'a', openai_api_key: 'b' }, security: { network: { require_https: true } } });
      expect(res.status).toBe(503);
      expect(res.body).toMatchObject({ applied: ['secrets:google_api_key'], failed: 'secrets', not_attempted: ['security'] });
      expect(JSON.stringify(res.body)).not.toContain('auth-canary');
      expect(writes.writeFileSecure).not.toHaveBeenCalled();
    });

    describe('backend credential under Auth', () => {
      const NEW_TOKEN = 'tr_new_backend_token_canary_55';

      it('sends an explicit token to Auth, bound to the endpoint, and never writes it to brain.json', async () => {
        stubFiles();
        const res = await request(app).post('/api/config-json').send({ brain: { name: 'n', token: NEW_TOKEN, has_token: true } });
        expect(res.status).toBe(200);
        expect(res.body).toEqual({ success: true, applied: ['secrets', 'brain'] });
        // The endpoint is the one already in the public config; Auth fixes the binding with the value.
        expect(configOwner.saveConnectionToken).toHaveBeenCalledExactlyOnceWith({ brainDir: '/tmp/mock-brain', url: 'https://x.test', token: NEW_TOKEN, actor: 'settings-config' });
        expect(authOwner.setSecret).not.toHaveBeenCalled();
        const written = writes.writeFileSecure.mock.calls.map(c => c[1]).join('\n');
        expect(written).not.toContain(NEW_TOKEN);
        // The legacy file token is preserved in place: not copied, exposed or migrated.
        expect(JSON.parse(writes.writeFileSecure.mock.calls[0][1])).toMatchObject({ token: BRAIN_TOKEN, name: 'n' });
        expect(JSON.stringify(res.body)).not.toContain(NEW_TOKEN);
      });

      it('binds a new token to the URL submitted in the same save', async () => {
        stubFiles();
        await request(app).post('/api/config-json').send({ brain: { url: 'https://new.test', token: NEW_TOKEN } });
        expect(configOwner.saveConnectionToken.mock.calls[0][0]).toMatchObject({ url: 'https://new.test' });
      });

      it('refuses a token with no endpoint, changing nothing', async () => {
        vi.spyOn(fs, 'existsSync').mockReturnValue(false);
        const res = await request(app).post('/api/config-json').send({ brain: { token: NEW_TOKEN } });
        expect(res.status).toBe(400);
        expect(res.body.error).toMatch(/needs an http\(s\) backend URL/);
        expect(configOwner.saveConnectionToken).not.toHaveBeenCalled();
        expect(writes.writeFileSecure).not.toHaveBeenCalled();
      });

      it('refuses to move a legacy-token brain.json to another endpoint, changing nothing', async () => {
        stubFiles();
        configOwner.assertLegacyTokenNotRebound.mockImplementation(() => { throw new Error('This brain.json holds a legacy token for its current endpoint; clear it before changing the endpoint'); });
        const res = await request(app).post('/api/config-json').send({ brain: { url: 'https://new.test' }, security: { network: { require_https: false } } });
        expect(res.status).toBe(409);
        expect(configOwner.assertLegacyTokenNotRebound).toHaveBeenCalledWith({ file: '/tmp/mock-brain/config/brain.json', url: 'https://new.test' });
        expect(writes.writeFileSecure).not.toHaveBeenCalled();
        expect(authOwner.setSecret).not.toHaveBeenCalled();
      });

      it('reports Auth configuration unavailable before writing anything', async () => {
        stubFiles();
        configOwner.assertLegacyTokenNotRebound.mockImplementation(() => { throw new Error('auth-canary decrypt failure'); });
        const res = await request(app).post('/api/config-json').send({ brain: { url: 'https://new.test' } });
        expect(res.status).toBe(503);
        expect(JSON.stringify(res.body)).not.toContain('auth-canary');
        expect(writes.writeFileSecure).not.toHaveBeenCalled();
      });

      it('a token-only save touches no config file', async () => {
        stubFiles();
        const res = await request(app).post('/api/config-json').send({ brain: { token: NEW_TOKEN } });
        expect(res.status).toBe(200);
        expect(res.body).toEqual({ success: true, applied: ['secrets'] });
        expect(writes.writeFileSecure).not.toHaveBeenCalled();
      });

      it('a blank token keeps the stored credential and calls Auth for nothing', async () => {
        stubFiles();
        const res = await request(app).post('/api/config-json').send({ brain: { token: '', has_token: true } });
        expect(res.status).toBe(200);
        expect(configOwner.saveConnectionToken).not.toHaveBeenCalled();
        expect(authOwner.deleteSecret).not.toHaveBeenCalled();
        expect(writes.writeFileSecure).not.toHaveBeenCalled();
      });

      it('a failed Auth write is reported with files untouched and no diagnostics', async () => {
        stubFiles();
        configOwner.saveConnectionToken.mockRejectedValue(new Error('auth-canary'));
        const res = await request(app).post('/api/config-json').send({ brain: { name: 'n', token: NEW_TOKEN } });
        expect(res.status).toBe(503);
        expect(res.body).toMatchObject({ applied: [], failed: 'secrets', not_attempted: ['brain'] });
        expect(JSON.stringify(res.body)).not.toMatch(/auth-canary|tr_new_backend/);
        expect(writes.writeFileSecure).not.toHaveBeenCalled();
      });

      it('GET reports the credential as set from Auth even when brain.json holds none', async () => {
        vi.spyOn(fs, 'existsSync').mockReturnValue(true);
        vi.spyOn(fs, 'readFileSync').mockImplementation(file => String(file).endsWith('brain.json') ? JSON.stringify({ url: 'https://x.test' }) : '');
        authOwner.listSecretsMeta.mockResolvedValue([{ key: 'TOTAL_RECALL_TOKEN', set: true, value: NEW_TOKEN }]);
        const res = await request(app).get('/api/config-json');
        expect(res.status).toBe(200);
        expect(res.body.brain).toEqual({ url: 'https://x.test', has_token: true });
        expect(res.body.secrets).toEqual({});
        expect(JSON.stringify(res.body)).not.toContain(NEW_TOKEN);
      });

      it('GET reports unset when neither brain.json nor Auth holds a token', async () => {
        vi.spyOn(fs, 'existsSync').mockReturnValue(true);
        vi.spyOn(fs, 'readFileSync').mockImplementation(file => String(file).endsWith('brain.json') ? JSON.stringify({ url: 'u' }) : '');
        authOwner.listSecretsMeta.mockResolvedValue([{ key: 'TOTAL_RECALL_TOKEN', set: false }]);
        const res = await request(app).get('/api/config-json');
        expect(res.body.brain).toEqual({ url: 'u' });
      });
    });

    it('does not replace a damaged security file with defaults', async () => {
      vi.spyOn(fs, 'existsSync').mockReturnValue(true);
      vi.spyOn(fs, 'readFileSync').mockReturnValue('{ not: valid: yaml: [');
      const res = await request(app).post('/api/config-json').send({ security: { network: { require_https: true } } });
      expect(res.status).toBe(500);
      expect(res.body).toMatchObject({ applied: [], failed: 'security' });
      expect(writes.writeFileSecure).not.toHaveBeenCalled();
    });
  });
});
