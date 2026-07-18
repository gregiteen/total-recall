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

/** Neutral fixture names — not tied to any user's real hostnames. */
const NODE_A = { hostname: 'node-a.mesh', ip: '100.64.0.1', online: true };
const NODE_B = { hostname: 'node-b.mesh', ip: '100.64.0.2', online: true };
const NODE_C = { hostname: 'node-c.mesh', ip: '100.64.0.3', online: true };
const NODE_OFFLINE = { hostname: 'node-offline.mesh', ip: '100.64.0.0', online: false };

describe('deterministic leader election', () => {
  beforeEach(() => vi.clearAllMocks());

  it('selects the lowest online mesh IP', async () => {
    vi.mocked(getMeshPeers).mockReturnValue([NODE_C, NODE_A, NODE_OFFLINE]);
    expect(await getLeaderInfo()).toEqual({
      hostname: NODE_A.hostname,
      ip: NODE_A.ip,
      strategy: 'lowest-mesh-ip',
    });
  });

  it('excludes offline nodes even when they have the lowest IP', async () => {
    vi.mocked(getMeshPeers).mockReturnValue([
      { ...NODE_A, online: false },
      NODE_B,
      { hostname: 'node-d.mesh', ip: '100.64.0.5', online: true },
    ]);
    expect(await getLeaderInfo()).toEqual({
      hostname: NODE_B.hostname,
      ip: NODE_B.ip,
      strategy: 'lowest-mesh-ip',
    });
  });

  it('returns null when no online nodes exist', async () => {
    vi.mocked(getMeshPeers).mockReturnValue([{ ...NODE_A, online: false }]);
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
    // Short local name vs MagicDNS FQDN — IP is the election key.
    vi.mocked(getMeshSelf).mockReturnValue({ hostname: 'node-a', ip: NODE_A.ip });
    vi.mocked(getMeshPeers).mockReturnValue([
      { hostname: 'node-a.example.ts.net', ip: NODE_A.ip, online: true },
      NODE_C,
    ]);
    expect(await isLeader()).toBe(true);
  });

  it('is not leader when a lower online IP exists', async () => {
    vi.mocked(getMeshSelf).mockReturnValue({ hostname: NODE_C.hostname, ip: NODE_C.ip });
    vi.mocked(getMeshPeers).mockReturnValue([NODE_A, NODE_C]);
    expect(await isLeader()).toBe(false);
  });

  it('lease shims re-evaluate isLeader without writing state', async () => {
    vi.mocked(getMeshSelf).mockReturnValue({ hostname: NODE_A.hostname, ip: NODE_A.ip });
    vi.mocked(getMeshPeers).mockReturnValue([NODE_A]);
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
    expect(normalizeHostname('node.example.ts.net.')).toBe('node.example.ts.net');
  });

  it('leaves undotted names unchanged', () => {
    expect(normalizeHostname('node.mesh')).toBe('node.mesh');
  });

  it('returns null for empty input', () => {
    expect(normalizeHostname(null)).toBeNull();
    expect(normalizeHostname('')).toBeNull();
  });
});
