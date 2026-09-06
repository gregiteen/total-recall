import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import meshPresenceRouter from './mesh-presence.mjs';

vi.mock('../auth.mjs', () => ({
  requireAuth: (req, res, next) => next(),
  requireScope: () => (req, res, next) => next(),
  requireAuthOrLocal: (req, res, next) => next(),
}));

vi.mock('../../core/mesh-activity.mjs', () => ({
  getLocalPresence: vi.fn().mockReturnValue({
    node_id: 'local-macbook',
    mesh_ip: '100.64.0.6',
    user_active: true,
    idle_seconds: 5,
    last_interaction: Date.now() - 5000,
    active_surface: 'antigravity',
    timestamp: new Date().toISOString()
  }),
  resolveActiveDevice: vi.fn((records) => {
    if (!records || records.length === 0) return { node_id: 'local', user_active: true };
    const active = records.filter(r => r && r.user_active);
    return active[0] || records[0];
  })
}));

vi.mock('../../core/mesh.mjs', () => ({
  getMeshPeers: vi.fn().mockReturnValue([
    { hostname: 'remote-mini', ip: '100.64.0.2', online: true }
  ]),
  execMeshCommand: vi.fn().mockResolvedValue({
    node: 'remote-mini',
    success: true,
    stdout: 'task executed',
    stderr: '',
    exitCode: 0
  })
}));

vi.mock('../../core/throttled-fetch.mjs', () => ({
  throttledFetch: vi.fn().mockResolvedValue({
    ok: true,
    status: 200,
    json: async () => ({
      node_id: 'remote-mini',
      mesh_ip: '100.64.0.2',
      user_active: false,
      idle_seconds: 600,
      active_surface: 'terminal'
    })
  })
}));

describe('mesh-presence router', () => {
  let app;

  beforeEach(() => {
    vi.clearAllMocks();
    app = express();
    app.use(express.json());
    app.use(meshPresenceRouter);
  });

  it('GET /api/mesh/presence returns presence records and resolves active device', async () => {
    const res = await request(app).get('/api/mesh/presence');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.local.node_id).toBe('local-macbook');
    expect(res.body.active_device.node_id).toBe('local-macbook');
    expect(res.body.active_surface).toBe('antigravity');
    expect(res.body.peers).toHaveLength(1);
    expect(res.body.peers[0].node_id).toBe('remote-mini');
  });

  it('GET /api/mesh/presence/local returns lightweight local record', async () => {
    const res = await request(app).get('/api/mesh/presence/local');
    expect(res.status).toBe(200);
    expect(res.body.node_id).toBe('local-macbook');
    expect(res.body.user_active).toBe(true);
  });

  it('POST /api/mesh/presence/resolve determines active device from provided records', async () => {
    const res = await request(app)
      .post('/api/mesh/presence/resolve')
      .send({
        presence_records: [
          { node_id: 'box-a', user_active: false },
          { node_id: 'box-b', user_active: true }
        ]
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.active_device.node_id).toBe('box-b');
  });

  it('POST /api/mesh/dispatch dynamically routes to local or remote node', async () => {
    const localRes = await request(app)
      .post('/api/mesh/dispatch')
      .send({ notification: 'Build complete' });

    expect(localRes.status).toBe(200);
    expect(localRes.body.dispatched).toBe(true);
    expect(localRes.body.is_local).toBe(true);

    const remoteRes = await request(app)
      .post('/api/mesh/dispatch')
      .send({ target: 'remote-mini', command: 'cargo test' });

    expect(remoteRes.status).toBe(200);
    expect(remoteRes.body.dispatched).toBe(true);
    expect(remoteRes.body.is_local).toBe(false);
    expect(remoteRes.body.command_result.success).toBe(true);
  });
});
