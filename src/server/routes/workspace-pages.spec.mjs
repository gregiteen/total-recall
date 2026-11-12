// @vitest-environment node
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import express from 'express';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import request from 'supertest';
import { ensureProjectId } from '../../core/project-id.mjs';
import { getPluginById, projectPluginsDir } from '../../core/plugin-loader.mjs';
import { patchPluginRecord } from '../../core/plugin-store.mjs';
import { addWorkspaceUiChunk } from '../../core/ui-chunks.mjs';
import { publishWorkspaceComposition, readWorkspaceComposition } from '../../core/workspace-compositions.mjs';

const choose = vi.hoisted(() => vi.fn());
vi.mock('../../core/ui-chunk-choice.mjs', () => ({ chooseUiComposition: choose }));
vi.mock('../auth.mjs', () => ({
  requireAuth(req, res, next) {
    const scopes = req.get('x-test-scopes');
    req.auth = scopes === undefined ? { type: 'dashboard_session' } : { type: 'pat', scopes: scopes.split(',') };
    next();
  },
  requireScope: scope => (req, res, next) => {
    if (req.auth.type === 'pat' && !req.auth.scopes.includes(scope)) return res.sendStatus(403);
    next();
  },
}));
vi.mock('./_shared.mjs', () => ({ BRAIN_DIR: '/unused-unscoped-brain' }));

import uiChunksRouter from './ui-chunks.mjs';

const app = express().use(express.json()).use(uiChunksRouter);
const endpoint = '/api/workspace/pages';
const primary = 'page-source:overview';
const supporting = 'page-companion:overview';
const pageId = 'plugin-verification';
let fixture, projectRoot, brainDir, brainId, initial;

async function installBlock(plugin, id = 'overview') {
  const directory = path.join(projectPluginsDir(projectRoot), plugin);
  fs.mkdirSync(directory, { recursive: true });
  fs.writeFileSync(path.join(directory, 'plugin.json'), JSON.stringify({
    id: plugin,
    name: plugin,
    version: '1.0.0',
    description: 'A workspace page block.',
    ui: { home: 'home', design_tokens: 'DESIGN.md', elements: [{ id: 'home', kind: 'panel', tag: plugin + '-home', module: 'home.js' }] },
  }));
  fs.writeFileSync(path.join(directory, 'DESIGN.md'), '# Test design\n');
  fs.writeFileSync(path.join(directory, 'home.js'), 'export {};\n');
  const markdown = [
    '---',
    'type: ui-chunk:chunk',
    'plugin: ' + plugin,
    'id: ' + id,
    'title: Workspace overview',
    'description: Show the workspace overview.',
    "timestamp: '2026-11-08T00:00:00Z'",
    'intents: [workspace overview]',
    'surfaces: [page]',
    '---',
    '<section>Workspace overview</section>',
  ].join('\n');
  await addWorkspaceUiChunk(brainDir, { plugin, id, markdown }, projectRoot);
}

beforeEach(async () => {
  choose.mockReset();
  fixture = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'tr-workspace-pages-')));
  const agentDir = path.join(fixture, 'agent');
  const globalBrain = path.join(agentDir, 'skills', 'total-recall');
  vi.stubEnv('AGENT_DIR', agentDir);
  vi.stubEnv('TR_DASHBOARD_BRAIN_DIR', globalBrain);
  projectRoot = path.join(fixture, 'project');
  brainDir = path.dirname(projectPluginsDir(projectRoot));
  const { project_id } = ensureProjectId(brainDir);
  brainId = 'project:' + project_id;
  fs.mkdirSync(path.join(globalBrain, 'config'), { recursive: true });
  fs.writeFileSync(path.join(globalBrain, 'config', 'project-registry.json'), JSON.stringify([
    { path: projectRoot, brainDir, project_id, name: 'Saved page test' },
  ]));
  await installBlock('page-source');
  await installBlock('page-companion');
  initial = await publishWorkspaceComposition(brainDir, 'page-source', [primary, supporting], null, projectRoot);
});

afterEach(() => {
  vi.unstubAllEnvs();
  fs.rmSync(fixture, { recursive: true, force: true });
});

function save(sourceVersion = initial.version) {
  return request(app).post(endpoint).send({
    id: pageId, title: 'Plugin verification', brainId, sourcePlugin: 'page-source', sourceVersion,
  });
}

it('copies the exact ordered Home revision into its own brain and omits disabled owners on read', async () => {
  expect((await save('0'.repeat(64))).status).toBe(409);
  const saved = await save();
  expect(saved.status).toBe(201);
  expect(saved.body.path).toBe('/memory?' + new URLSearchParams({ page: pageId, brain: brainId }));
  expect(saved.body.chunks.map(chunk => chunk.key)).toEqual([primary, supporting]);
  expect(saved.body.chunks[0]).not.toHaveProperty('html');
  expect((await save()).status).toBe(409);
  expect(readWorkspaceComposition(brainDir, 'page-source', projectRoot).version).toBe(initial.version);

  const list = await request(app).get(endpoint).query({ brain: brainId });
  expect(list.body).toEqual({ pages: [{ id: pageId, title: 'Plugin verification', version: saved.body.version }] });
  expect((await request(app).get(endpoint).query({ brain: 'global' })).body).toEqual({ pages: [] });
  const detail = () => request(app).get(endpoint + '/' + pageId).query({ brain: brainId });
  expect((await request(app).get(endpoint + '/' + pageId).query({ brain: 'global' })).status).toBe(404);
  await publishWorkspaceComposition(brainDir, 'page-source', [primary], initial.version, projectRoot);
  expect((await detail()).body.chunks.map(chunk => chunk.key)).toEqual([primary, supporting]);
  await patchPluginRecord(getPluginById('page-companion', projectRoot), { runtime_enabled: false });
  const limited = await detail();
  expect(limited.headers['cache-control']).toBe('private, no-store');
  expect(limited.body.chunks.map(chunk => chunk.key)).toEqual([primary]);
});

it('requires a selected brain and its access grant before reading or writing a page', async () => {
  expect((await request(app).get(endpoint)).status).toBe(400);
  expect((await request(app).get(endpoint).query({ brain: brainId }).set('x-test-scopes', 'config:read')).status).toBe(403);
  expect((await save().set('x-test-scopes', 'config:write')).status).toBe(403);
  expect((await request(app).get(endpoint + '/%2E%2E%2Fother').query({ brain: brainId })).status).toBe(400);
});

it('places exact blocks in a named page and rejects a stale or unauthorized edit', async () => {
  const created = await request(app).post(endpoint).send({
    id: pageId, title: 'My workspace', brainId, keys: [supporting, primary],
  });
  expect(created.status).toBe(201);
  expect(created.body.chunks.map(chunk => chunk.key)).toEqual([supporting, primary]);
  const edit = () => request(app).put(endpoint + '/' + pageId).send({
    brainId, keys: [primary, supporting], revision: created.body.version,
  });
  expect((await edit().set('x-test-scopes', 'config:read')).status).toBe(403);
  expect((await edit()).status).toBe(200);
  expect((await edit()).status).toBe(409);
  const current = await request(app).get(endpoint + '/' + pageId).query({ brain: brainId });
  expect(current.body.chunks.map(chunk => chunk.key)).toEqual([primary, supporting]);
  expect(readWorkspaceComposition(brainDir, 'page-source', projectRoot).version).toBe(initial.version);
});

it('paginates matching blocks after applying scope and ranking', async () => {
  await installBlock('page-source', 'details');
  const catalog = query => request(app).get('/api/ui-chunks').query({
    brain: brainId, plugin: 'page-source', surface: 'page', limit: 1, ...query,
  });
  const first = await catalog({ offset: 0 });
  const second = await catalog({ offset: 1 });
  expect(first.body).toMatchObject({ total: 2, chunks: [{ key: 'page-source:details' }] });
  expect(second.body).toMatchObject({ total: 2, chunks: [{ key: primary }] });
  expect((await catalog({ offset: 1, q: 'details' })).body).toMatchObject({ total: 1, chunks: [] });
  expect((await catalog({ offset: -1 })).status).toBe(400);
});

it('publishes a named Jev composition separately and rejects an ID collision before deciding', async () => {
  choose.mockResolvedValue({ source: 'decision', keys: [supporting], confidence: 0.98 });
  const compose = () => request(app).post('/api/ui-chunks/compose').send({
    plugin: 'page-source', query: 'workspace overview', brainId, pageId, pageTitle: 'Jev page',
  });
  const created = await compose();
  expect(created.status).toBe(200);
  expect(created.body.path).toBe('/memory?' + new URLSearchParams({ page: pageId, brain: brainId }));
  const detail = await request(app).get(endpoint + '/' + pageId).query({ brain: brainId });
  expect(detail.body).toMatchObject({ id: pageId, title: 'Jev page', chunks: [{ key: supporting }], version: created.body.version });
  expect(readWorkspaceComposition(brainDir, 'page-source', projectRoot).version).toBe(initial.version);
  expect((await compose()).status).toBe(409);
  expect(choose).toHaveBeenCalledTimes(1);
});
