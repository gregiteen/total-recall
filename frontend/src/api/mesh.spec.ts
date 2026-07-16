import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fetchLeader, fetchNodes, forceReElection } from './mesh';
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
    vi.mocked(base.get).mockResolvedValue({ hostname: 'foo', ip: '1.2.3.4' });
    const res = await fetchLeader();
    expect(base.get).toHaveBeenCalledWith('/api/mesh/leader');
    expect(res.hostname).toBe('foo');
  });

  it('fetchNodes calls GET /api/mesh/nodes', async () => {
    vi.mocked(base.get).mockResolvedValue([]);
    const res = await fetchNodes();
    expect(base.get).toHaveBeenCalledWith('/api/mesh/nodes');
    expect(res).toEqual([]);
  });

  it('forceReElection calls POST /api/mesh/election/force', async () => {
    vi.mocked(base.post).mockResolvedValue({});
    await forceReElection();
    expect(base.post).toHaveBeenCalledWith('/api/mesh/election/force', {});
  });
});
