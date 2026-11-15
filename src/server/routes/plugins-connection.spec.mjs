import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import express from 'express';

const NOW = Date.parse('2026-11-15T12:00:00.000Z');
const state = vi.hoisted(() => ({ owner: null, calls: [], inactive: new Set(), plugins: {} }));

vi.mock('../auth.mjs', () => ({
  requireAuth: (req, res, next) => next(),
  requireScope: (...scopes) => (req, res, next) => {
    const granted = req.get('x-test-scopes');
    return granted !== undefined && !scopes.every(scope => granted.split(',').includes(scope)) ? res.status(403).json({ error: 'Insufficient scope' }) : next();
  },
}));
vi.mock('../plugin-brain-targets.mjs', () => ({
  resolvePluginBrainTargets: vi.fn(([id]) => {
    if (id === 'project:denied') throw Object.assign(new Error('The token does not grant access to a selected brain.'), { status: 403 });
    if (id === 'project:missing') throw Object.assign(new Error('A selected project brain is unavailable.'), { status: 404 });
    if (id === 'global') return [{ brainId: id, brainDir: '/brains/global', projectRoot: null }];
    return [{ brainId: id, brainDir: `/brains/${id}`, projectRoot: `/projects/${id}` }];
  }),
}));
vi.mock('../../core/plugin-loader.mjs', async original => ({
  ...await original(),
  getPluginById: vi.fn(id => state.plugins[id] ?? null),
}));
vi.mock('../../core/plugin-state.mjs', async original => ({
  ...await original(),
  pluginActivation: vi.fn((plugin, target) => ({ enabled: !state.inactive.has(`${plugin.id}@${target.brainDir}`) })),
}));
vi.mock('../../core/plugin-runtime.mjs', async original => ({
  ...await original(),
  loadPluginModule: vi.fn(async (id, name, options) => {
    // Host bootstrap still loads the real Auth owner; only the fixture plugins are stubbed.
    if (name !== 'connections') return (await original()).loadPluginModule(id, name, options);
    state.calls.push({ id, name, options });
    return { readConnection: input => { state.calls.at(-1).input = input; return state.owner(input); } };
  }),
}));

const { default: router } = await import('./plugins.mjs');
const app = express().use(express.json()).use(router);
const iso = ago => new Date(Date.now() - ago).toISOString();
const plugin = (id, modules) => ({ id, valid: true, dir: `/plugins/${id}`, manifest: { id, runtime: { modules } } });

describe('GET /api/plugins/:id/connection', () => {
  beforeEach(() => {
    state.calls.length = 0; state.inactive.clear(); state.owner = () => ({ status: 'unknown', method: 'api-key' });
    state.plugins = { demo: plugin('demo', { connections: './connections.mjs' }), plain: plugin('plain', { other: './x.mjs' }) };
  });
  afterEach(() => vi.unstubAllGlobals());

  it('requires the config read scope before any owner code runs', async () => {
    const res = await request(app).get('/api/plugins/demo/connection').set('x-test-scopes', 'memory:read');
    expect(res.status).toBe(403);
    expect(state.calls).toEqual([]);
  });

  it('denies a brain the token cannot select, or that is not registered, without owner code', async () => {
    expect((await request(app).get('/api/plugins/demo/connection?brain=project:denied')).status).toBe(403);
    expect((await request(app).get('/api/plugins/demo/connection?brain=project:missing')).status).toBe(404);
    expect(state.calls).toEqual([]);
  });

  it('gives the owner only the selected brain and keeps brains separate', async () => {
    state.owner = ({ brainDir }) => (brainDir === '/brains/project:a'
      ? { status: 'connected', method: 'api-key', checkedAt: iso(60_000) } : { status: 'unknown', method: 'api-key' });
    const a = await request(app).get('/api/plugins/demo/connection?brain=project:a');
    const b = await request(app).get('/api/plugins/demo/connection?brain=project:b');
    const global = await request(app).get('/api/plugins/demo/connection?brain=global');
    expect(a.body).toMatchObject({ reported: true, status: 'connected', method: 'api-key', freshness: 'fresh' });
    expect(b.body).toMatchObject({ reported: true, status: 'unknown', checkedAt: null });
    expect(global.body.status).toBe('unknown');
    expect(state.calls.map(call => call.input)).toEqual([
      { brainDir: '/brains/project:a', projectRoot: '/projects/project:a' },
      { brainDir: '/brains/project:b', projectRoot: '/projects/project:b' },
      { brainDir: '/brains/global', projectRoot: null },
    ]);
    expect(a.headers['cache-control']).toBe('no-store');
  });

  it('is unreported when the plugin is inactive in that brain only', async () => {
    state.inactive.add('demo@/brains/project:off');
    state.owner = () => ({ status: 'connected', method: 'api-key', checkedAt: iso(1000) });
    const off = await request(app).get('/api/plugins/demo/connection?brain=project:off');
    const on = await request(app).get('/api/plugins/demo/connection?brain=project:on');
    expect(off.body).toMatchObject({ reported: false, reason: 'inactive' });
    expect(on.body.status).toBe('connected');
    expect(state.calls).toHaveLength(1);
  });

  it('never infers a connection for an unknown plugin or one with no connections module', async () => {
    expect((await request(app).get('/api/plugins/nope/connection')).status).toBe(404);
    const plain = await request(app).get('/api/plugins/plain/connection');
    expect(plain.body).toMatchObject({ reported: false, reason: 'no-report' });
    expect(state.calls).toEqual([]);
  });

  it.each([
    ['malformed', { status: 'connected' }],
    ['future', { status: 'connected', method: 'api-key', checkedAt: iso(-86_400_000) }],
    ['raw', { status: 'connected', method: 'api-key', checkedAt: iso(1000), endpoint: 'https://CANARY.example/v1', message: 'CANARY sk-secret' }],
  ])('rejects a %s owner report and exposes none of it', async (_name, report) => {
    state.owner = () => report;
    const res = await request(app).get('/api/plugins/demo/connection');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ reported: false, reason: 'invalid-report' });
    expect(res.text).not.toMatch(/CANARY|sk-secret|endpoint/);
  });

  it('marks old evidence stale and redacts an owner failure', async () => {
    state.owner = () => { throw new Error('Bearer CANARY-TOKEN at https://provider.example'); };
    const failed = await request(app).get('/api/plugins/demo/connection');
    expect(failed.body).toMatchObject({ reported: false, reason: 'owner-unavailable' });
    expect(failed.text).not.toContain('CANARY');
    state.owner = () => ({ status: 'failed', method: 'api-key', checkedAt: iso(3 * 86_400_000), failure: 'timeout' });
    const stale = await request(app).get('/api/plugins/demo/connection');
    expect(stale.body).toMatchObject({ status: 'stale', lastStatus: 'failed', freshness: 'stale', failure: { code: 'timeout' } });
  });

  it('makes no network request while reading', async () => {
    const fetchStub = vi.fn(() => { throw new Error('network is not allowed'); });
    vi.stubGlobal('fetch', fetchStub);
    await request(app).get('/api/plugins/demo/connection?brain=project:a');
    expect(fetchStub).not.toHaveBeenCalled();
  });
});
