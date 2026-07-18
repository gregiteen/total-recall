import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getLeaderInfo, isLeader, renewLease, releaseLease, tryAcquireLease } from './leader-election.mjs';
import { getMeshPeers, getMeshSelf } from './mesh.mjs';

vi.mock('./mesh.mjs', () => ({ getMeshPeers: vi.fn(), getMeshSelf: vi.fn() }));

describe('deterministic leader election', () => {
  beforeEach(() => vi.clearAllMocks());

  it('selects the lowest online mesh IP', async () => {
    vi.mocked(getMeshPeers).mockReturnValue([
      { hostname: 'laptop.mesh', ip: '100.64.0.3', online: true },
      { hostname: 'server.mesh', ip: '100.64.0.1', online: true },
      { hostname: 'offline.mesh', ip: '100.64.0.0', online: false },
    ]);
    expect(await getLeaderInfo()).toEqual({
      hostname: 'server.mesh',
      ip: '100.64.0.1',
      strategy: 'lowest-mesh-ip',
    });
  });

  it('reports leadership consistently without node-local leases', async () => {
    vi.mocked(getMeshSelf).mockReturnValue({ hostname: 'server.mesh', ip: '100.64.0.1' });
    vi.mocked(getMeshPeers).mockReturnValue([{ hostname: 'server.mesh', ip: '100.64.0.1', online: true }]);
    expect(await isLeader()).toBe(true);
    expect(await tryAcquireLease()).toBe(true);
    expect(await renewLease()).toBe(true);
    expect(await releaseLease()).toBe(true);
  });
});
