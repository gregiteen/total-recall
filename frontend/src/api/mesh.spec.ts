import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fetchLeader, fetchNodes, refreshElection } from './mesh';
import * as base from './_base';

vi.mock('./_base', () => ({
  get: vi.fn(),
  post: vi.fn(),
}));

describe('mesh api', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('fetchLeader calls GET /api/mesh/leader', async () => {
    vi.mocked(base.get).mockResolvedValue({ leader: { hostname: 'foo', ip: '1.2.3.4' } });
    const res = await fetchLeader();
    expect(base.get).toHaveBeenCalledWith('/api/mesh/leader');
    expect(res.hostname).toBe('foo');
  });

  it('fetchNodes calls GET /api/mesh/nodes', async () => {
    vi.mocked(base.get).mockResolvedValue({ nodes: [] });
    const res = await fetchNodes();
    expect(base.get).toHaveBeenCalledWith('/api/mesh/nodes');
    expect(res).toEqual([]);
  });

  it('refreshElection calls POST /api/mesh/election/refresh', async () => {
    vi.mocked(base.post).mockResolvedValue({ leader: { hostname: 'foo', ip: '1.2.3.4' } });
    await refreshElection();
    expect(base.post).toHaveBeenCalledWith('/api/mesh/election/refresh', {});
  });
});
