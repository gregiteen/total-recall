import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import meshRouter from './mesh.mjs';

vi.mock('../auth.mjs', () => ({
  requireAuth: (req, res, next) => next(),
  requireScope: () => (req, res, next) => next()
}));

vi.mock('../../core/leader-election.mjs', () => ({
  getLeaderInfo: vi.fn().mockResolvedValue({ id: 'leader-1' }),
  isLeader: vi.fn().mockResolvedValue(true)
}));

vi.mock('../../core/mesh.mjs', () => ({
  clearMeshStatusCache: vi.fn(),
  getMeshPeers: vi.fn().mockReturnValue([
    { hostname: 'node-a.mesh', ip: '100.64.0.1', online: true, self: true },
    { hostname: 'node-b.mesh', ip: '100.64.0.2', online: true, self: false },
  ]),
  listEnrichedMeshNodes: vi.fn().mockReturnValue([
    {
      hostname: 'node-a.mesh',
      ip: '100.64.0.1',
      online: true,
      self: true,
      role: 'build-host',
      labels: ['ci'],
      has_entity: true,
    },
  ]),
  listMeshNodeEntities: vi.fn().mockReturnValue([{ type: 'mesh_node', hostname: 'node-a.mesh' }]),
}));

vi.mock('../../core/vfs-documents.mjs', () => ({
  defaultVaultRoot: vi.fn().mockReturnValue('/tmp/tr-mesh-test-vault'),
}));

vi.mock('../../core/throttled-fetch.mjs', () => ({
  throttledFetch: vi.fn().mockResolvedValue({ ok: true, status: 200 }),
}));

describe('mesh routes', () => {
  let app;

  beforeEach(() => {
    vi.clearAllMocks();
    app = express();
    app.use(meshRouter);
  });

  it('GET /api/mesh/leader returns leader info', async () => {
    const res = await request(app).get('/api/mesh/leader');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      leader: { id: 'leader-1' },
      is_current_node_leader: true
    });
  });

  it('GET /api/mesh/nodes returns enriched peers with entity variables', async () => {
    const res = await request(app).get('/api/mesh/nodes');
    expect(res.status).toBe(200);
    expect(res.body.nodes).toHaveLength(1);
    expect(res.body.nodes[0].role).toBe('build-host');
    expect(res.body.entity_count).toBe(1);
  });

  it('POST /api/mesh/election/refresh clears cached status and returns deterministic leader', async () => {
    const { clearMeshStatusCache } = await import('../../core/mesh.mjs');
    const res = await request(app).post('/api/mesh/election/refresh');
    expect(res.status).toBe(200);
    expect(clearMeshStatusCache).toHaveBeenCalledOnce();
    expect(res.body).toEqual({ leader: { id: 'leader-1' }, is_current_node_leader: true });
  });

  it('GET /api/mesh/latency measures peer RTTs through the fetch gate', async () => {
    const { throttledFetch } = await import('../../core/throttled-fetch.mjs');
    const res = await request(app).get('/api/mesh/latency');
    expect(res.status).toBe(200);
    expect(res.body.latency_ms['node-a.mesh']).toBe(0);
    expect(throttledFetch).toHaveBeenCalled();
    expect(res.body.results).toHaveLength(2);
  });
});

