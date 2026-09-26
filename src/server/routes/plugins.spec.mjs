import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';

const scopes = vi.hoisted(() => []);

vi.mock('../auth.mjs', () => ({
  requireAuth: (req, res, next) => next(),
  requireScope: (...s) => {
    scopes.push(s);
    return (req, res, next) => { req.requiredScopes = s; next(); };
  },
}));

const plugin = {
  id: 'git-sentinel',
  dir: '/test/plugins/git-sentinel',
  valid: true,
  errors: [],
  manifest: { id: 'git-sentinel', name: 'Git Sentinel', version: '1.1.0', description: 'Repo state', cli: { command: 'git-sentinel', handler: './cli.mjs' } }
};

vi.mock('../../core/plugin-loader.mjs', () => ({
  getPluginById: vi.fn((id) => (id === 'git-sentinel' ? plugin : id === 'no-cli' ? { ...plugin, id: 'no-cli', manifest: { name: 'No CLI' } } : null)),
}));

const store = vi.hoisted(() => ({
  listInstalledPlugins: vi.fn(() => [{ id: 'git-sentinel', name: 'Git Sentinel', sha256: 'a'.repeat(64), shared: false }]),
  listAvailableBundled: vi.fn(() => [{ id: 'system-monitor', name: 'System Monitor', installed: false }]),
  describePlugin: vi.fn((p) => ({ id: p.id, name: p.manifest.name })),
  installPlugin: vi.fn(async (source) => {
    if (source === 'bad') throw new Error('No bundled plugin, peer source, git URL or directory matches');
    return { plugin: { id: 'system-monitor', name: 'System Monitor', version: '1.1.0' }, source: { kind: 'bundled', ref: source }, sha256: 'b'.repeat(64) };
  }),
  uninstallPlugin: vi.fn(async (id) => ({ id, dir: '/x', scope: 'project' })),
  setPluginShared: vi.fn(async (id, shared) => ({ id, shared })),
}));
vi.mock('../../core/plugin-store.mjs', () => store);

vi.mock('../../core/plugin-peers.mjs', () => ({
  listPeerPlugins: vi.fn(async () => ({
    mesh: { available: true, configured: true },
    peers: [{ hostname: 'mac-mini', status: 'ok', plugins: [{ id: 'git-sentinel', sha256: 'a'.repeat(64) }, { id: 'other', sha256: 'c'.repeat(64) }] }]
  })),
}));

const runner = vi.hoisted(() => ({
  runPluginCommand: vi.fn(async () => ({ ok: true, exitCode: 0, output: 'hello', timedOut: false, truncated: false, durationMs: 5 })),
}));
vi.mock('../../core/plugin-runner.mjs', () => runner);

import pluginsRouter from './plugins.mjs';

const FORBIDDEN = /rating|review|installCount|install_count|download|verified/i;

describe('plugins router', () => {
  let app;

  beforeEach(() => {
    vi.clearAllMocks();
    app = express();
    app.use(express.json());
    app.use(pluginsRouter);
  });

  it('GET /api/plugins lists installed plugins with no fabricated fields', async () => {
    const res = await request(app).get('/api/plugins');
    expect(res.status).toBe(200);
    expect(res.body.count).toBe(1);
    expect(JSON.stringify(res.body)).not.toMatch(FORBIDDEN);
  });

  it('ignores caller-supplied roots', async () => {
    await request(app).get('/api/plugins?root=/etc');
    expect(store.listInstalledPlugins).toHaveBeenCalledWith(process.cwd());
  });

  it('GET /api/plugins/available lists bundled plugins', async () => {
    const res = await request(app).get('/api/plugins/available');
    expect(res.body.plugins[0].id).toBe('system-monitor');
  });

  it('GET /api/plugins/peers marks what is already installed and whether it is the same content', async () => {
    const res = await request(app).get('/api/plugins/peers');
    const [peer] = res.body.peers;
    expect(peer.plugins[0]).toMatchObject({ id: 'git-sentinel', installed: true, same_as_installed: true });
    expect(peer.plugins[1]).toMatchObject({ id: 'other', installed: false, same_as_installed: false });
  });

  it('there is no catalog or rating endpoint', async () => {
    expect((await request(app).get('/api/plugins/catalog')).status).toBe(404);
    expect((await request(app).post('/api/plugins/git-sentinel/rate').send({ rating: 5 })).status).toBe(404);
  });

  it('POST /api/plugins/install requires a source and reports store errors', async () => {
    expect((await request(app).post('/api/plugins/install').send({})).status).toBe(400);
    const bad = await request(app).post('/api/plugins/install').send({ source: 'bad' });
    expect(bad.status).toBe(400);
    expect(bad.body.error).toContain('No bundled plugin');
    const ok = await request(app).post('/api/plugins/install').send({ source: 'system-monitor', global: true });
    expect(ok.status).toBe(200);
    expect(store.installPlugin).toHaveBeenCalledWith('system-monitor', { projectRoot: process.cwd(), link: false, global: true });
  });

  it('POST /api/plugins/:id/share requires a boolean', async () => {
    expect((await request(app).post('/api/plugins/git-sentinel/share').send({ shared: 'yes' })).status).toBe(400);
    const res = await request(app).post('/api/plugins/git-sentinel/share').send({ shared: true });
    expect(res.status).toBe(200);
    expect(store.setPluginShared).toHaveBeenCalledWith('git-sentinel', true, { projectRoot: process.cwd() });
  });

  it('DELETE /api/plugins/:id removes via the store', async () => {
    const res = await request(app).delete('/api/plugins/git-sentinel?global=true');
    expect(res.status).toBe(200);
    expect(store.uninstallPlugin).toHaveBeenCalledWith('git-sentinel', { projectRoot: process.cwd(), global: true });
  });

  it('GET /api/plugins/:id returns 404 for an unknown plugin', async () => {
    expect((await request(app).get('/api/plugins/nonexistent')).status).toBe(404);
    expect((await request(app).get('/api/plugins/git-sentinel')).body.plugin.manifest.name).toBe('Git Sentinel');
  });

  it('POST /api/plugins/:id/run executes out of process and needs config:write', async () => {
    const res = await request(app).post('/api/plugins/git-sentinel/run').send({ subcommand: 'audit', args: ['--json'] });
    expect(res.status).toBe(200);
    expect(res.body.output).toBe('hello');
    expect(runner.runPluginCommand).toHaveBeenCalledWith(plugin, { subcommand: 'audit', args: ['--json'], cwd: process.cwd() });
    expect(scopes).toContainEqual(['config:write']);
  });

  it('POST /api/plugins/:id/run validates input and handler presence', async () => {
    expect((await request(app).post('/api/plugins/git-sentinel/run').send({ args: [1] })).status).toBe(400);
    const noCli = await request(app).post('/api/plugins/no-cli/run').send({});
    expect(noCli.status).toBe(400);
    expect(noCli.body.error).toContain('does not declare a CLI handler');
  });
});
