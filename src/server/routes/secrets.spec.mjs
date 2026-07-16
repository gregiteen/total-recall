import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import { secretsRouter } from './secrets.mjs';
import * as secretsStore from '../../core/secrets-store.mjs';
import * as secretsSync from '../../core/secrets-sync.mjs';
import * as mesh from '../../core/mesh.mjs';
import * as leaderElection from '../../core/leader-election.mjs';

vi.mock('../auth.mjs', () => ({
  requireAuth: (req, res, next) => next(),
  requireScope: () => (req, res, next) => next(),
}));

vi.mock('../../core/secrets-store.mjs', () => ({
  listSecretsMeta: vi.fn(),
  getSecretsCatalog: vi.fn(),
}));

vi.mock('../../core/secrets-sync.mjs', () => ({
  getSecretsChecksum: vi.fn(),
  pullSecretsFromLeader: vi.fn(),
}));

vi.mock('../../core/mesh.mjs', () => ({
  getMeshPeers: vi.fn(),
  listProviders: vi.fn(() => []),
}));

vi.mock('../../core/leader-election.mjs', () => ({
  getLeaderInfo: vi.fn(),
  isLeader: vi.fn(),
}));

const app = express();
app.use(express.json());
app.use(secretsRouter);

describe('Secrets Routing API', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    global.fetch = vi.fn();
  });

  it('GET /api/secrets/list returns meta list', async () => {
    vi.mocked(secretsStore.listSecretsMeta).mockResolvedValue([
      { key: 'TEST_KEY', set: true }
    ]);

    const res = await request(app).get('/api/secrets/list');

    expect(res.status).toBe(200);
    expect(res.body.keys).toEqual([{ key: 'TEST_KEY', set: true }]);
    expect(secretsStore.listSecretsMeta).toHaveBeenCalled();
  });

  it('GET /api/secrets/sync/status compares checksums with peers', async () => {
    vi.mocked(secretsSync.getSecretsChecksum).mockReturnValue('leader-hash');
    vi.mocked(mesh.getMeshPeers).mockReturnValue([
      { hostname: 'node-1.mesh', ip: '100.64.0.2', online: true }
    ]);

    // Mock fetch for checksum check
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ checksum: 'leader-hash' })
    });

    const res = await request(app).get('/api/secrets/sync/status');

    expect(res.status).toBe(200);
    expect(res.body.localChecksum).toBe('leader-hash');
    expect(res.body.nodes).toEqual([
      { hostname: 'node-1.mesh', ip: '100.64.0.2', status: 'synced', checksum: 'leader-hash' }
    ]);
  });

  it('POST /api/secrets/sync/trigger fires triggers to followers', async () => {
    vi.mocked(mesh.getMeshPeers).mockReturnValue([
      { hostname: 'node-1.mesh', ip: '100.64.0.2', online: true }
    ]);

    global.fetch = vi.fn().mockResolvedValue({
      ok: true
    });

    const res = await request(app).post('/api/secrets/sync/trigger');

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.results).toEqual([
      { hostname: 'node-1.mesh', ip: '100.64.0.2', success: true }
    ]);
    expect(global.fetch).toHaveBeenCalledWith('http://100.64.0.2:3100/api/secrets/sync/trigger-pull', expect.any(Object));
  });

  it('POST /api/secrets/sync/trigger-pull handles pull trigger on followers', async () => {
    vi.mocked(leaderElection.isLeader).mockResolvedValue(false);
    vi.mocked(leaderElection.getLeaderInfo).mockResolvedValue({ hostname: 'leader.mesh', ip: '100.64.0.1' });
    vi.mocked(secretsSync.pullSecretsFromLeader).mockResolvedValue(true);

    const res = await request(app)
      .post('/api/secrets/sync/trigger-pull')
      .set('X-Forwarded-For', '100.64.0.2'); // simulates mesh request

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(secretsSync.pullSecretsFromLeader).toHaveBeenCalledWith('100.64.0.1');
  });
});
