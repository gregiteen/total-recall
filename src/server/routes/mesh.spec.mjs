import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import meshRouter from './mesh.mjs';

vi.mock('../../core/leader-election.mjs', () => ({
  getLeaderInfo: vi.fn().mockResolvedValue({ id: 'leader-1' }),
  isLeader: vi.fn().mockResolvedValue(true)
}));

vi.mock('../../core/mesh.mjs', () => ({
  getMeshPeers: vi.fn().mockReturnValue([{ id: 'peer-1' }])
}));

describe('mesh routes', () => {
  let app;

  beforeEach(() => {
    vi.clearAllMocks();
    app = express();
    app.use('/', meshRouter);
  });

  it('GET /leader returns leader info', async () => {
    const res = await request(app).get('/leader');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      leader: { id: 'leader-1' },
      is_current_node_leader: true
    });
  });

  it('GET /nodes returns mesh peers', async () => {
    const res = await request(app).get('/nodes');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      nodes: [{ id: 'peer-1' }]
    });
  });
});
