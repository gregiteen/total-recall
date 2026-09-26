import { describe, it, expect, vi } from 'vitest';
import request from 'supertest';
import express from 'express';

vi.mock('../../core/mesh-auth.mjs', () => ({
  requireMeshSyncAuth: (req, res, next) =>
    req.headers.authorization === 'Bearer ok' ? next() : res.status(401).json({ error: 'Invalid mesh sync credential' }),
}));
vi.mock('../../core/mesh.mjs', () => ({ getMeshHostname: () => 'node-a' }));
vi.mock('../../core/plugin-store.mjs', () => ({
  listSharedPlugins: () => [{ id: 'git-sentinel', name: 'Git Sentinel', sha256: 'a'.repeat(64), _plugin: { dir: '/secret/path' } }],
  packSharedPlugin: (id) => (id === 'git-sentinel' ? { format: 'tr-plugin-bundle/1', id, files: [] } : null),
  packPublicPlugin: (id) => (id === 'git-sentinel' ? { format: 'tr-plugin-bundle/1', id, files: [] } : null),
}));

import meshRouter from './plugins-mesh.mjs';

const app = express();
app.use(meshRouter);

describe('plugins mesh router', () => {
  it('requires the mesh credential', async () => {
    expect((await request(app).get('/api/mesh/plugins')).status).toBe(401);
    expect((await request(app).get('/api/mesh/plugins/git-sentinel/bundle')).status).toBe(401);
  });

  it('lists shared plugins without leaking local paths', async () => {
    const res = await request(app).get('/api/mesh/plugins').set('Authorization', 'Bearer ok');
    expect(res.status).toBe(200);
    expect(res.body.node.hostname).toBe('node-a');
    expect(res.body.plugins[0].id).toBe('git-sentinel');
    expect(JSON.stringify(res.body)).not.toContain('/secret/path');
  });

  it('serves bundles only for shared plugins', async () => {
    const ok = await request(app).get('/api/mesh/plugins/git-sentinel/bundle').set('Authorization', 'Bearer ok');
    expect(ok.status).toBe(200);
    expect(ok.body.format).toBe('tr-plugin-bundle/1');
    expect((await request(app).get('/api/mesh/plugins/private-one/bundle').set('Authorization', 'Bearer ok')).status).toBe(404);
    expect((await request(app).get('/api/mesh/plugins/..%2Fetc/bundle').set('Authorization', 'Bearer ok')).status).toBe(400);
  });

  it('serves only explicitly shared bundles to public recipients', async () => {
    const ok = await request(app).get('/api/public/plugins/git-sentinel/bundle');
    expect(ok.status).toBe(200);
    expect(ok.headers['cache-control']).toBe('no-store');
    expect((await request(app).get('/api/public/plugins/private-one/bundle')).status).toBe(404);
  });
});
