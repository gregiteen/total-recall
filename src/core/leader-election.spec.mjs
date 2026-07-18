import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  FAILOVER_BOUND_MS,
  getLeaderInfo,
  isLeader,
  renewLease,
  releaseLease,
  tryAcquireLease,
} from './leader-election.mjs';
import { getMeshPeers, getMeshSelf, normalizeHostname } from './mesh.mjs';

vi.mock('./mesh.mjs', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    getMeshPeers: vi.fn(),
    getMeshSelf: vi.fn(),
  };
});

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

  it('excludes offline nodes even when they have the lowest IP', async () => {
    vi.mocked(getMeshPeers).mockReturnValue([
      { hostname: 'was-leader.mesh', ip: '100.64.0.1', online: false },
      { hostname: 'follower.mesh', ip: '100.64.0.2', online: true },
      { hostname: 'other.mesh', ip: '100.64.0.5', online: true },
    ]);
    expect(await getLeaderInfo()).toEqual({
      hostname: 'follower.mesh',
      ip: '100.64.0.2',
      strategy: 'lowest-mesh-ip',
    });
  });

  it('returns null when no online nodes exist', async () => {
    vi.mocked(getMeshPeers).mockReturnValue([
      { hostname: 'a.mesh', ip: '100.64.0.1', online: false },
    ]);
    expect(await getLeaderInfo()).toBeNull();
  });

  it('uses hostname as tie-break when IPs are equal (defensive)', async () => {
    vi.mocked(getMeshPeers).mockReturnValue([
      { hostname: 'zeta.mesh', ip: '100.64.0.1', online: true },
      { hostname: 'alpha.mesh', ip: '100.64.0.1', online: true },
    ]);
    expect(await getLeaderInfo()).toEqual({
      hostname: 'alpha.mesh',
      ip: '100.64.0.1',
      strategy: 'lowest-mesh-ip',
    });
  });

  it('reports leadership by IP (hostname form need not match exactly)', async () => {
    // Self hostname may differ in form from the peer-list entry; IP is the key.
    vi.mocked(getMeshSelf).mockReturnValue({ hostname: 'server', ip: '100.64.0.1' });
    vi.mocked(getMeshPeers).mockReturnValue([
      { hostname: 'server.tailnet.ts.net', ip: '100.64.0.1', online: true },
      { hostname: 'laptop.mesh', ip: '100.64.0.3', online: true },
    ]);
    expect(await isLeader()).toBe(true);
  });

  it('is not leader when a lower online IP exists', async () => {
    vi.mocked(getMeshSelf).mockReturnValue({ hostname: 'laptop.mesh', ip: '100.64.0.3' });
    vi.mocked(getMeshPeers).mockReturnValue([
      { hostname: 'server.mesh', ip: '100.64.0.1', online: true },
      { hostname: 'laptop.mesh', ip: '100.64.0.3', online: true },
    ]);
    expect(await isLeader()).toBe(false);
  });

  it('lease shims re-evaluate isLeader without writing state', async () => {
    vi.mocked(getMeshSelf).mockReturnValue({ hostname: 'server.mesh', ip: '100.64.0.1' });
    vi.mocked(getMeshPeers).mockReturnValue([{ hostname: 'server.mesh', ip: '100.64.0.1', online: true }]);
    expect(await tryAcquireLease()).toBe(true);
    expect(await renewLease()).toBe(true);
    expect(await releaseLease()).toBe(true);
  });

  it('documents failover bound as 12s (cache 2s + tick 10s)', () => {
    expect(FAILOVER_BOUND_MS).toBe(12_000);
  });
});

describe('normalizeHostname (MagicDNS trailing-dot)', () => {
  it('strips a single trailing dot', () => {
    expect(normalizeHostname('node.tailnet.ts.net.')).toBe('node.tailnet.ts.net');
  });

  it('leaves undotted names unchanged', () => {
    expect(normalizeHostname('node.mesh')).toBe('node.mesh');
  });

  it('returns null for empty input', () => {
    expect(normalizeHostname(null)).toBeNull();
    expect(normalizeHostname('')).toBeNull();
  });
});
