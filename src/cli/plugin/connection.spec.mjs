import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import express from 'express';

const state = vi.hoisted(() => ({ owner: null, calls: [], plugins: {} }));

vi.mock('../../core/brain-locate.mjs', async original => ({ ...await original(), detectProjectBrain: vi.fn(() => null) }));
vi.mock('../../server/auth.mjs', () => ({ requireAuth: (req, res, next) => next(), requireScope: () => (req, res, next) => next() }));
vi.mock('../../server/plugin-brain-targets.mjs', () => ({
  resolvePluginBrainTargets: vi.fn(([id], auth) => {
    if (auth?.type !== 'dashboard_session' && id !== 'global') throw Object.assign(new Error('The token does not grant access to a selected brain.'), { status: 403 });
    if (id === 'project:missing') throw Object.assign(new Error('A selected project brain is unavailable.'), { status: 404 });
    return [{ brainId: id, brainDir: `/brains/${id}`, projectRoot: id === 'global' ? null : `/projects/${id}` }];
  }),
}));
vi.mock('../../core/plugin-loader.mjs', async original => ({ ...await original(), getPluginById: vi.fn(id => state.plugins[id] ?? null) }));
vi.mock('../../core/plugin-state.mjs', async original => ({ ...await original(), pluginActivation: vi.fn(() => ({ enabled: true })) }));
vi.mock('../../core/plugin-runtime.mjs', async original => ({
  ...await original(),
  loadPluginModule: vi.fn(async (id, name, options) => {
    if (name !== 'connections') return (await original()).loadPluginModule(id, name, options);
    state.calls.push({ id, options });
    return { readConnection: input => state.owner(input) };
  }),
}));

const { runPluginConnection } = await import('./connection.mjs');
const { default: router } = await import('../../server/routes/plugins.mjs');
const app = express().use((req, res, next) => { req.auth = { type: 'dashboard_session' }; next(); }).use(router);
const iso = ago => new Date(Date.now() - ago).toISOString();
const checkedAt = iso(60_000);

async function cli(args) {
  const out = []; const err = [];
  const log = vi.spyOn(console, 'log').mockImplementation((...parts) => out.push(parts.join(' ')));
  const error = vi.spyOn(console, 'error').mockImplementation((...parts) => err.push(parts.join(' ')));
  process.exitCode = undefined;
  await runPluginConnection(args);
  const code = process.exitCode; process.exitCode = undefined;
  log.mockRestore(); error.mockRestore();
  return { out: out.join('\n'), err: err.join('\n'), code };
}

describe('plugin connection CLI', () => {
  beforeEach(() => {
    state.calls.length = 0;
    state.owner = () => ({ status: 'connected', method: 'api-key', checkedAt });
    state.plugins = { demo: { id: 'demo', valid: true, dir: '/plugins/demo', manifest: { id: 'demo', runtime: { modules: { connections: './c.mjs' } } } } };
  });
  afterEach(() => vi.unstubAllGlobals());

  it('prints the same JSON report the API serves for the same brain', async () => {
    const fromCli = JSON.parse((await cli(['demo', '--brain', 'project:a', '--json'])).out);
    const fromApi = (await request(app).get('/api/plugins/demo/connection?brain=project:a')).body;
    expect(fromCli).toEqual(fromApi);
    expect(fromCli).toMatchObject({ reported: true, status: 'connected', method: 'api-key' });
  });

  it('defaults to the explicit global brain outside a project and says so', async () => {
    const result = await cli(['demo']);
    expect(result.code).toBeUndefined();
    expect(result.out).toContain('Brain:          global');
    expect(state.calls).toHaveLength(1);
    expect(state.calls[0].options.projectRoot).toBeNull();
  });

  it('prints readable text without raw owner data', async () => {
    state.owner = () => ({ status: 'failed', method: 'api-key', checkedAt: iso(1000), failure: 'credential-rejected' });
    const { out, code } = await cli(['demo', '--brain', 'global']);
    expect(out).toContain('demo: failed');
    expect(out).toContain('Authentication: API key');
    expect(out).toContain('The provider rejected the credential.');
    expect(code).toBeUndefined();
  });

  it('reports unreported evidence without inferring a connection', async () => {
    state.owner = () => ({ nope: true });
    const { out } = await cli(['demo', '--brain', 'project:a']);
    expect(out).toMatch(/^demo: unreported\./);
    expect(out).not.toMatch(/connected/);
  });

  it('fails for an unknown plugin, an unavailable brain and bad usage, without calling an owner', async () => {
    expect((await cli(['nope', '--brain', 'global'])).code).toBe(1);
    expect((await cli(['demo', '--brain', 'project:missing'])).err).toContain('unavailable');
    for (const args of [[], ['demo', 'extra'], ['demo', '--brain'], ['demo', '--probe']]) {
      const result = await cli(args);
      expect(result.code).toBe(1);
      expect(result.err).toContain('Usage: total-recall plugin connection');
    }
    expect(state.calls).toEqual([]);
  });

  it('hides an owner failure and makes no network request', async () => {
    const fetchStub = vi.fn(() => { throw new Error('network'); });
    vi.stubGlobal('fetch', fetchStub);
    state.owner = () => { throw new Error('Bearer CANARY-TOKEN'); };
    const result = await cli(['demo', '--brain', 'project:a', '--json']);
    expect(JSON.parse(result.out)).toMatchObject({ reported: false, reason: 'owner-unavailable' });
    expect(result.out + result.err).not.toContain('CANARY');
    expect(fetchStub).not.toHaveBeenCalled();
  });
});
