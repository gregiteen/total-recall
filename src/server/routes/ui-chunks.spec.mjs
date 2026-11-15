// @vitest-environment node
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { ensureProjectId } from '../../core/project-id.mjs';
import { getPluginById, globalPluginsDir, projectPluginsDir } from '../../core/plugin-loader.mjs';
import { patchPluginRecord } from '../../core/plugin-store.mjs';
import { PluginStateStore } from '../../core/plugin-state-store.mjs';

vi.mock('../auth.mjs', () => ({
  requireAuth(req, res, next) {
    const scopes = req.get('x-test-scopes');
    if (scopes === 'none') return res.sendStatus(401);
    req.auth = scopes === undefined ? { type: 'dashboard_session' } : { type: 'pat', scopes: scopes.split(',') };
    next();
  },
  requireScope: scope => (req, res, next) => req.auth.type === 'pat' && !req.auth.scopes.includes(scope) ? res.sendStatus(403) : next(),
}));
import router from './ui-chunks.mjs';

const app = express().use(express.json()).use(router);
const endpoint = '/api/ui-chunks/design-test/design';
const content = color => `---\ncolors:\n  primary: '${color}'\n---\n# DESIGN.md\n`;
let fixture, brainDir, brainId, projectRoot;
beforeEach(() => {
  fixture = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'tr-design-routes-')));
  const agent = path.join(fixture, 'agent');
  const global = path.join(agent, 'skills/total-recall');
  vi.stubEnv('AGENT_DIR', agent);
  vi.stubEnv('TR_DASHBOARD_BRAIN_DIR', global);
  projectRoot = path.join(fixture, 'project');
  brainDir = path.dirname(projectPluginsDir(projectRoot));
  const { project_id } = ensureProjectId(brainDir);
  brainId = 'project:' + project_id;
  fs.mkdirSync(path.join(global, 'config'), { recursive: true });
  fs.writeFileSync(path.join(global, 'config/project-registry.json'), JSON.stringify([{ path: projectRoot, brainDir, project_id, name: 'Design test' }]));
  const plugin = path.join(globalPluginsDir(), 'design-test');
  fs.mkdirSync(plugin, { recursive: true });
  fs.writeFileSync(path.join(plugin, 'plugin.json'), JSON.stringify({ id: 'design-test', name: 'Design test', description: 'Owner design', version: '1.0.0' }));
  fs.writeFileSync(path.join(plugin, 'DESIGN.md'), content('#123456'));
});
afterEach(() => { vi.unstubAllEnvs(); fs.rmSync(fixture, { recursive: true, force: true }); });
const choice = () => request(app).get(endpoint + '/choice').query({ brain: brainId });
const design = revision => request(app).get(endpoint + '/revision').query({ brain: brainId, ...(revision ? { revision } : {}) });
const save = (markdown, version = null) => request(app).put(endpoint + '/choice').send({ brainId, markdown, version });

it('round-trips a selected-brain choice with private revision refresh, stale conflicts and owner fallback', async () => {
  expect((await choice()).body).toEqual({ markdown: null, version: null });
  const owner = await design();
  const saved = await save(content('#abcdef'));
  expect(saved.status).toBe(200);
  expect(saved.headers['cache-control']).toBe('private, no-store');
  expect((await choice()).body).toEqual(saved.body);
  const selected = await design(owner.body.revision);
  expect(selected.body.css).toContain('#abcdef');
  expect((await design(selected.body.revision)).body).toEqual({ unchanged: true });
  expect((await save(content('#ffffff'))).status).toBe(409);
  expect((await request(app).get(endpoint + '/revision').query({ brain: 'global' })).body).toEqual(owner.body);
  expect((await save(null, saved.body.version)).status).toBe(200);
  expect((await design(selected.body.revision)).body).toEqual(owner.body);
  await patchPluginRecord(getPluginById('design-test', projectRoot), { runtime_enabled: false });
  expect((await design()).status).toBe(404);
  expect((await choice()).status).toBe(404);
  expect((await save(content('#fff'))).status).toBe(400);
});

it('requires auth, config and brain grants, validates inputs, and never treats paths as designs', async () => {
  for (const suffix of ['/choice', '/revision']) {
    expect((await request(app).get(endpoint + suffix).query({ brain: brainId }).set('x-test-scopes', 'none')).status).toBe(401);
    expect((await request(app).get(endpoint + suffix).query({ brain: brainId }).set('x-test-scopes', 'config:read')).status).toBe(403);
    expect((await request(app).get(endpoint + suffix).query({ brain: brainId }).set('x-test-scopes', `config:read,brain:project-${brainId.slice(8)}`)).status).toBe(200);
  }
  expect((await request(app).get(endpoint + '/choice')).status).toBe(400);
  expect((await save(content('#fff')).set('x-test-scopes', 'none')).status).toBe(401);
  expect((await save(content('#fff')).set('x-test-scopes', 'config:read')).status).toBe(403);
  expect((await save(content('#fff')).set('x-test-scopes', 'config:write')).status).toBe(403);
  expect((await request(app).put(endpoint + '/choice').type('text').send('bad')).status).toBe(415);
  for (const markdown of ['DESIGN.md', content('red;display:none'), 'x'.repeat(65537)]) expect((await save(markdown)).status).toBe(400);
  expect((await request(app).put(endpoint + '/choice').send({ brainId, markdown: content('#fff') })).status).toBe(400);
  expect((await choice()).body.version).toBe(null);
});

it('curates corrupt canonical selection errors without leaking private bytes', async () => {
  await save(content('#abcdef'));
  const store = new PluginStateStore(path.join(brainDir, 'config/workspace-design-design-test.json'), 'workspace-design');
  fs.writeFileSync(store.documentPath, 'private-design-marker');
  for (const suffix of ['/choice', '/revision']) {
    const result = await request(app).get(endpoint + suffix).query({ brain: brainId });
    expect(result.status).toBe(500);
    expect(JSON.stringify(result.body)).not.toMatch(/private-design-marker|\.ssss|tr-design-routes/);
  }
});
