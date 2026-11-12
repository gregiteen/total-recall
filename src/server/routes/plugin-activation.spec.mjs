import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import express from 'express';
import request from 'supertest';
import { registerProjectBrain } from '../../core/memory-brain.mjs';
import { readProjectActivationRecord } from '../../core/plugin-store.mjs';
import { writeFixturePlugin } from '../../core/testing/plugin-fixture.mjs';

vi.mock('../auth.mjs', () => ({
  requireAuth(req, _res, next) {
    const scopes = req.get('x-test-scopes');
    req.auth = scopes === undefined ? { type: 'dashboard_session' } : { type: 'pat', scopes: scopes.split(',') };
    next();
  },
  requireScope: scope => (req, res, next) => req.auth.type === 'dashboard_session' || req.auth.scopes.includes(scope)
    ? next() : res.status(403).json({ error: 'Insufficient scope' }),
}));
vi.mock('../../core/surface.mjs', () => ({ compileSurface: vi.fn(async () => ({})) }));
vi.mock('../../core/plugin-peers.mjs', () => ({
  listPeerPlugins: () => { throw new Error('Activation tests do not contact mesh peers'); },
}));

import pluginsRouter from './plugins.mjs';

describe('registered brain plugin activation', () => {
  let root, globalBrain, career, music, app;

  function makeProject(name) {
    const projectRoot = path.join(root, name);
    const brainDir = path.join(projectRoot, '.agent', 'skills', 'total-recall');
    fs.mkdirSync(brainDir, { recursive: true });
    return registerProjectBrain(globalBrain, { name, path: projectRoot, brainDir });
  }

  function addPlugin(brainDir, id) {
    const dir = path.join(brainDir, 'plugins', id);
    fs.mkdirSync(dir, { recursive: true });
    writeFixturePlugin(dir, { id, name: id, description: 'Scoped inventory fixture', version: '1.0.0' });
  }

  beforeEach(() => {
    root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'plugin-brain-')));
    const agentDir = path.join(root, 'global-agent');
    vi.stubEnv('AGENT_DIR', agentDir);
    globalBrain = path.join(agentDir, 'skills', 'total-recall');
    career = makeProject('career');
    music = makeProject('music');
    addPlugin(globalBrain, 'brain-demo');
    addPlugin(career.brainDir, 'career-only');
    app = express();
    app.use(express.json());
    app.use(pluginsRouter);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    fs.rmSync(root, { recursive: true, force: true });
  });

  const selection = 'global,project:career,project:music';
  const activation = '/api/plugins/brain-demo/activation';

  it('resolves dashboard registrations without changing the preview plugin runtime', async () => {
    const dashboardBrain = path.join(root, 'home-brain');
    fs.mkdirSync(path.join(dashboardBrain, 'config'), { recursive: true });
    fs.renameSync(path.join(globalBrain, 'config', 'project-registry.json'), path.join(dashboardBrain, 'config', 'project-registry.json'));
    vi.stubEnv('TR_DASHBOARD_BRAIN_DIR', dashboardBrain);

    const listed = await request(app).get('/api/plugins').query({ brain: selection });
    expect(listed.status, JSON.stringify(listed.body)).toBe(200);
    const plugin = listed.body.plugins.find(p => p.id === 'brain-demo');
    expect(plugin.activationByBrain.map(({ brainId }) => brainId)).toEqual(selection.split(','));
  });

  it('writes distinct local overrides for one shared package and reports Mixed', async () => {
    const [off, on] = await Promise.all([
      request(app).put(activation).send({ enabled: false, brainIds: ['project:career'] }),
      request(app).put(activation).send({ enabled: true, brainIds: ['project:music'] }),
    ]);
    expect([off.status, on.status]).toEqual([200, 200]);
    expect(off.body.results[0]).toMatchObject({ brainId: 'project:career', success: true, activation: { enabled: false } });
    expect(on.body.results[0]).toMatchObject({ brainId: 'project:music', success: true, activation: { enabled: true } });
    expect(readProjectActivationRecord('brain-demo', career.path)?.frontmatter.runtime_enabled).toBe(false);
    expect(readProjectActivationRecord('brain-demo', music.path)?.frontmatter.runtime_enabled).toBe(true);
    expect(fs.existsSync(path.join(career.brainDir, 'plugins', 'brain-demo'))).toBe(false);
    expect(fs.existsSync(path.join(globalBrain, 'memory-vault', 'system', 'plugins', 'brain-demo.md'))).toBe(false);

    const listed = await request(app).get('/api/plugins').query({ brain: selection, root: '/etc' });
    expect(listed.status, JSON.stringify(listed.body)).toBe(200);
    const plugin = listed.body.plugins.find(p => p.id === 'brain-demo');
    expect(plugin.activation.state).toBe('mixed');
    expect(plugin.activationByBrain.map(({ brainId, state }) => [brainId, state])).toEqual([
      ['global', 'active'], ['project:career', 'inactive'], ['project:music', 'active'],
    ]);
  });

  it('changes the shared default and leaves project overrides effective', async () => {
    const override = await request(app).put(activation).send({ enabled: true, brainIds: ['project:music'] });
    expect(override.body.success).toBe(true);
    const changed = await request(app).put(activation).send({ enabled: false, brainIds: ['global'] });
    expect(changed.body.results[0]).toMatchObject({ brainId: 'global', success: true, activation: { enabled: false } });
    const listed = await request(app).get('/api/plugins').query({ brain: selection });
    const plugin = listed.body.plugins.find(p => p.id === 'brain-demo');
    expect(plugin.activationByBrain.map(item => item.state)).toEqual(['inactive', 'inactive', 'active']);
    const shared = await request(app).get('/api/plugins').query({ brain: 'global' });
    expect(shared.body.plugins.some(p => p.id === 'career-only')).toBe(false);
  });

  it('reports availability and results separately when a plugin is installed in one selected project', async () => {
    const listed = await request(app).get('/api/plugins').query({ brain: 'project:career,project:music' });
    const plugin = listed.body.plugins.find(p => p.id === 'career-only');
    expect(plugin.activationByBrain.map(item => item.state)).toEqual(['active', 'unavailable']);
    expect(plugin.servingAvailable).toBe(false);
    const changed = await request(app).put('/api/plugins/career-only/activation')
      .send({ enabled: false, brainIds: ['project:career', 'project:music'] });
    expect(changed.status).toBe(200);
    expect(changed.body.success).toBe(false);
    expect(changed.body.results.map(({ brainId, success }) => [brainId, success])).toEqual([
      ['project:career', true], ['project:music', false],
    ]);
  });

  it('arms a project only, preserves dormancy on inventory reads, and requires a deliberate open', async () => {
    const brainIds = ['project:career'];
    expect((await request(app).put(activation).send({ mode: 'on-use', brainIds: ['global'] })).status).toBe(400);
    expect((await request(app).put(activation).send({ mode: 'use', brainIds: ['project:career', 'project:music'] })).status).toBe(400);
    const armed = await request(app).put(activation).send({ mode: 'on-use', brainIds });
    expect(armed.body.results[0]).toMatchObject({ success: true, activation: { enabled: false, mode: 'on-use' } });
    const listed = await request(app).get('/api/plugins').query({ brain: selection });
    const plugin = listed.body.plugins.find(p => p.id === 'brain-demo');
    expect(plugin.activationByBrain[1]).toMatchObject({ brainId: 'project:career', enabled: false, mode: 'on-use' });
    expect(readProjectActivationRecord('brain-demo', career.path)?.frontmatter).toMatchObject({ runtime_enabled: false, runtime_on_use: true });

    const opened = await request(app).put(activation).send({ mode: 'use', brainIds });
    expect(opened.body.results[0]).toMatchObject({ success: true, activation: { enabled: true } });
    expect(opened.body.results[0].activation.mode).toBeUndefined();
    expect(readProjectActivationRecord('brain-demo', career.path)?.frontmatter).toMatchObject({ runtime_enabled: true, runtime_on_use: false });
    expect(readProjectActivationRecord('brain-demo', music.path)).toBeNull();
    await request(app).put(activation).send({ enabled: false, brainIds });
    const refused = await request(app).put(activation).send({ mode: 'use', brainIds });
    expect(refused.body.results[0]).toMatchObject({ success: false, error: 'This plugin is not set to open on use.' });
    expect(readProjectActivationRecord('brain-demo', career.path)?.frontmatter.runtime_enabled).toBe(false);
  });

  it('reports an archive conflict without exposing paths and accepts a scoped cleanup retry', async () => {
    const live = path.join(career.brainDir, 'plugin-state', 'brain-demo');
    const archive = path.join(career.brainDir, 'config', 'plugin-state-archive', 'brain-demo');
    fs.mkdirSync(live, { recursive: true });
    fs.mkdirSync(archive, { recursive: true });
    const serverRoot = vi.spyOn(process, 'cwd').mockReturnValue(career.path);
    try {
      const legacy = await request(app).put(activation).send({ enabled: false });
      expect(legacy.status).toBe(500);
      expect(legacy.body).toMatchObject({ success: false, activation: { enabled: false }, cleanup: { ok: false, state: 'pending' } });
    } finally { serverRoot.mockRestore(); }

    const brainIds = ['project:career'];
    const scoped = await request(app).put(activation).send({ enabled: false, brainIds });
    expect(scoped.status).toBe(200);
    expect(scoped.body.results[0]).toMatchObject({
      success: false, activation: { enabled: false }, cleanup: { ok: false, state: 'pending' },
      error: 'The plugin is off, but cleanup did not finish. Retry cleanup.',
    });
    expect(JSON.stringify(scoped.body)).not.toContain(root);
    fs.renameSync(archive, path.join(root, 'saved-previous-state'));
    const retried = await request(app).put(activation).send({ enabled: false, brainIds });
    expect(retried.body.results[0]).toMatchObject({ success: true, activation: { enabled: false }, cleanup: { ok: true, state: 'archived' } });
    expect(fs.existsSync(live)).toBe(false);
    expect(fs.existsSync(archive)).toBe(true);
  });

  it('rejects raw paths and checks the scope of every project before writing', async () => {
    expect((await request(app).get('/api/plugins').query({ brain: career.path })).status).toBe(400);
    expect((await request(app).put(activation).send({ enabled: false, brainId: 'project:career' })).status).toBe(400);
    expect((await request(app).put(activation).send({ enabled: false, brainIds: ['project:career', 'project:missing'] })).status).toBe(404);
    const scope = `brain:project-${career.project_id}`;
    expect((await request(app).get('/api/plugins').query({ brain: `project:${career.project_id}` })
      .set('x-test-scopes', `config:read,${scope}`)).status).toBe(200);
    expect((await request(app).get('/api/plugins').query({ brain: 'global' })
      .set('x-test-scopes', `config:read,${scope}`)).status).toBe(403);
    const denied = await request(app).put(activation).set('x-test-scopes', `config:write,${scope}`)
      .send({ enabled: false, brainIds: ['project:career', 'project:music'] });
    expect(denied.status).toBe(403);
    expect(readProjectActivationRecord('brain-demo', career.path)).toBeNull();
    expect(readProjectActivationRecord('brain-demo', music.path)).toBeNull();
  });

  it('denies an ambiguous alias or a registry record that points to a different brain', async () => {
    registerProjectBrain(globalBrain, { ...music, name: 'career' });
    expect((await request(app).get('/api/plugins').query({ brain: 'project:career' })).status).toBe(409);
    const file = path.join(globalBrain, 'config', 'project-registry.json');
    const rows = JSON.parse(fs.readFileSync(file, 'utf8'));
    rows.find(row => row.project_id === career.project_id).brainDir = music.brainDir;
    fs.writeFileSync(file, JSON.stringify(rows));
    expect((await request(app).get('/api/plugins').query({ brain: `project:${career.project_id}` })).status).toBe(404);
  });
});
