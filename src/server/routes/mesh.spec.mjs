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
  getMeshPeers: vi.fn().mockReturnValue([{ id: 'peer-1' }])
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

  it('GET /api/mesh/nodes returns mesh peers', async () => {
    const res = await request(app).get('/api/mesh/nodes');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      nodes: [{ id: 'peer-1' }]
    });
  });

  it('POST /api/mesh/election/refresh clears cached status and returns deterministic leader', async () => {
    const { clearMeshStatusCache } = await import('../../core/mesh.mjs');
    const res = await request(app).post('/api/mesh/election/refresh');
    expect(res.status).toBe(200);
    expect(clearMeshStatusCache).toHaveBeenCalledOnce();
    expect(res.body).toEqual({ leader: { id: 'leader-1' }, is_current_node_leader: true });
  });
});
