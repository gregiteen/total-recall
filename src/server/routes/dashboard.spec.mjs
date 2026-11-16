// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { ensureProjectId } from '../../core/project-id.mjs';
import { projectPluginsDir } from '../../core/plugin-loader.mjs';
import { PluginStateStore } from '../../core/plugin-state-store.mjs';
import express from 'express';
import request from 'supertest';
import dashboardRouter from './dashboard.mjs';

vi.mock('../../core/vault-cache.mjs', () => ({
  getNodes: vi.fn(() => [])
}));
vi.mock('../auth.mjs', () => ({
  requireAuth: (req, res, next) => {
    if (req.get('x-test-scopes') === 'none') return res.sendStatus(401);
    req.auth = req.get('x-test-scopes') ? { type: 'pat', scopes: req.get('x-test-scopes').split(',') } : { type: 'dashboard_session' };
    next();
  },
  requireScope: scope => (req, res, next) => req.auth.type === 'pat' && !req.auth.scopes.includes(scope) ? res.sendStatus(403) : next(),
}));

let fixture, brainDir, brainId;
beforeEach(() => {
  fixture = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'tr-drawer-routes-')));
  const agent = path.join(fixture, 'agent');
  const global = path.join(agent, 'skills/total-recall');
  vi.stubEnv('AGENT_DIR', agent);
  vi.stubEnv('TR_DASHBOARD_BRAIN_DIR', global);
  const projectRoot = path.join(fixture, 'project');
  brainDir = path.dirname(projectPluginsDir(projectRoot));
  const { project_id } = ensureProjectId(brainDir);
  brainId = 'project:' + project_id;
  fs.mkdirSync(path.join(global, 'config'), { recursive: true });
  fs.writeFileSync(path.join(global, 'config/project-registry.json'), JSON.stringify([{ path: projectRoot, brainDir, project_id, name: 'Drawer test' }]));
});
afterEach(() => { vi.unstubAllEnvs(); fs.rmSync(fixture, { recursive: true, force: true }); });

const app = express().use(express.json()).use(dashboardRouter);
const endpoint = '/api/dashboard/drawers/right';

describe('dashboard router', () => {
  it('exports a router with dashboard/instructions endpoint', async () => {
    const app = express();
    app.use(dashboardRouter);
    const res = await request(app).get('/api/dashboard/instructions');
    expect(res.status).toBe(200);
    expect(res.body.surfaces).toBeDefined();
  });
});

it('saves and restores with exact versions through private authenticated selected-brain routes', async () => {
  const first = await request(app).put(endpoint).send({ brainId, config: { html: 'First private layout' }, version: null });
  expect(first.status).toBe(200);
  const second = await request(app).put(endpoint).send({ brainId, config: { html: 'Second' }, version: first.body.version });
  const history = await request(app).get(endpoint + '/history').query({ brain: brainId });
  expect(history.status).toBe(200);
  expect(history.headers['cache-control']).toBe('private, no-store');
  expect(history.body).toMatchObject({ version: second.body.version, history: [{ version: first.body.version, config: first.body.config }] });
  const restore = version => request(app).post(endpoint + '/restore').send({ brainId, revision: first.body.version, version });
  expect((await restore(first.body.version)).status).toBe(409);
  expect((await restore(second.body.version)).body.config).toEqual(first.body.config);
  expect((await restore(second.body.version)).status).toBe(409);
  expect((await request(app).get(endpoint + '/history').query({ brain: 'global' })).body.history).toEqual([]);
  expect((await request(app).get('/api/dashboard/drawers/bottom/history').query({ brain: brainId })).body.history).toEqual([]);
  expect((await request(app).get(endpoint).query({ brain: brainId })).headers['cache-control']).toBe('private, no-store');
});

it('requires authentication, config scopes and matching brain grants for layout and history', async () => {
  for (const suffix of ['', '/history']) {
    expect((await request(app).get(endpoint + suffix).query({ brain: brainId }).set('x-test-scopes', 'none')).status).toBe(401);
    expect((await request(app).get(endpoint + suffix).query({ brain: brainId }).set('x-test-scopes', 'config:read')).status).toBe(403);
    expect((await request(app).get(endpoint + suffix).query({ brain: brainId }).set('x-test-scopes', `config:read,brain:project-${brainId.slice(8)}`)).status).toBe(200);
  }
  for (const method of ['put', 'post']) {
    const route = endpoint + (method === 'post' ? '/restore' : '');
    expect((await request(app)[method](route).set('x-test-scopes', 'none').send({ brainId })).status).toBe(401);
    expect((await request(app)[method](route).set('x-test-scopes', 'config:read').send({ brainId })).status).toBe(403);
    expect((await request(app)[method](route).set('x-test-scopes', 'config:write').send({ brainId })).status).toBe(403);
    expect((await request(app)[method](route).type('text').send('bad')).status).toBe(415);
  }
  expect((await request(app).put(endpoint).send({ brainId, config: {}, version: null, extra: true })).status).toBe(400);
  expect((await request(app).put(endpoint).send({ brainId, config: {} })).status).toBe(400);
});

it('returns curated errors without leaking corrupt history content or paths', async () => {
  await request(app).put(endpoint).send({ brainId, config: {}, version: null });
  const store = new PluginStateStore(path.join(brainDir, 'config/workspace-drawer-right.json'), 'workspace-ui');
  fs.writeFileSync(store.documentPath, 'private-history-marker');
  for (const suffix of ['', '/history']) {
    const response = await request(app).get(endpoint + suffix).query({ brain: brainId });
    expect(response.status).toBe(500);
    expect(JSON.stringify(response.body)).not.toMatch(/private-history-marker|\.ssss|tr-drawer-routes/);
  }
});

it('never falls back to the global brain when the selected brain is missing or ambiguous', async () => {
  const global = path.join(fixture, 'agent/skills/total-recall');
  const requests = [
    () => request(app).get(endpoint),
    () => request(app).get(endpoint + '/history'),
    () => request(app).get(endpoint).query({ brain: '' }),
    () => request(app).get(endpoint).query({ brain: ['global', brainId] }),
    () => request(app).get(endpoint).query({ brain: `global,${brainId}` }),
    () => request(app).put(endpoint).send({ config: { html: 'Unscoped' }, version: null }),
    () => request(app).put(endpoint).send({ brainId: ['global', brainId], config: { html: 'Many' }, version: null }),
    () => request(app).put(endpoint).send({ brainId: `global,${brainId}`, config: { html: 'Joined' }, version: null }),
    () => request(app).put(endpoint).send({ brainId: null, config: { html: 'Null' }, version: null }),
    () => request(app).post(endpoint + '/restore').send({ revision: 'a'.repeat(64), version: null }),
    () => request(app).post(endpoint + '/restore').send({ brainId: [brainId], revision: 'a'.repeat(64), version: null }),
  ];
  for (const send of requests) expect((await send()).status).toBe(400);
  const store = new PluginStateStore(path.join(global, 'config/workspace-drawer-right.json'), 'workspace-ui');
  expect(fs.existsSync(store.documentPath)).toBe(false);
  // A selected brain, including an explicit global selection, still works.
  expect((await request(app).put(endpoint).send({ brainId: 'global', config: { html: 'Global on purpose' }, version: null })).status).toBe(200);
  expect(fs.existsSync(store.documentPath)).toBe(true);
});
