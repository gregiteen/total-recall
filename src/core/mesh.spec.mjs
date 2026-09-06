import { beforeEach, describe, expect, it, vi } from 'vitest';
import { spawnSync } from 'node:child_process';
import { clearMeshStatusCache, ensureMeshNodeEntities, getMeshHostname, getMeshIp, getMeshPeers, getMeshSelf, isMeshAvailable } from './mesh.mjs';

vi.mock('node:child_process', () => {
  const mockedSpawnSync = vi.fn();
  return { spawnSync: mockedSpawnSync, default: { spawnSync: mockedSpawnSync } };
});

/** Neutral fixture status — hostnames/IPs are not real user devices. */
const status = {
  Self: { DNSName: 'node-self.mesh.', TailscaleIPs: ['100.64.0.2'], OS: 'linux' },
  Peer: {
    a: { DNSName: 'node-peer.mesh.', TailscaleIPs: ['100.64.0.1'], Online: true, OS: 'linux' },
  },
};

describe('mesh status', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearMeshStatusCache();
  });

  it('returns unavailable when the client is missing', () => {
    vi.mocked(spawnSync).mockReturnValue({ status: 1, stdout: '' });
    expect(isMeshAvailable()).toBe(false);
    expect(getMeshPeers()).toEqual([]);
  });

  it('normalizes self and peers from one cached status call', () => {
    vi.mocked(spawnSync).mockReturnValue({ status: 0, stdout: JSON.stringify(status) });
    expect(getMeshSelf()).toMatchObject({ hostname: 'node-self.mesh', ip: '100.64.0.2', self: true });
    expect(getMeshIp()).toBe('100.64.0.2');
    expect(getMeshHostname()).toBe('node-self.mesh');
    expect(getMeshPeers({ includeSelf: true })).toHaveLength(2);
    expect(spawnSync).toHaveBeenCalledTimes(1);
  });
});

describe('ensureMeshNodeEntities', () => {
  // patchOwnMeshNode describes only the machine it runs on, so a peer that will
  // never run a brain — a phone, or an always-on host without one — could never
  // be described at all. On a five-node tailnet that left three with no entity,
  // including the always-on host an agent most needs access details for.
  const run = (peers, entities = [], opts = {}) => {
    const written = [];
    return ensureMeshNodeEntities({
      peers, entities, write: async (h) => { written.push(h); return { written: true }; }, ...opts,
    }).then((r) => ({ ...r, written }));
  };

  it('creates an entity for an online peer that has none', async () => {
    const r = await run([{ hostname: 'cloud', ip: '100.64.0.1', online: true }]);
    expect(r.created).toEqual(['cloud']);
    expect(r.written).toEqual(['cloud']);
  });

  it('leaves a peer alone when an entity already exists', async () => {
    const r = await run(
      [{ hostname: 'macmini', ip: '100.64.0.2', online: true }],
      [{ hostname: 'macmini', ip: '100.64.0.2' }],
    );
    expect(r.created).toEqual([]);
  });

  it('matches an existing entity across DNS suffixes rather than duplicating', async () => {
    // The same host appears as `box` and `box.mesh.example`; keying on the full
    // name mints a fresh document every time the tailnet suffix changes.
    const r = await run(
      [{ hostname: 'macmini.mesh.example.org', ip: '100.64.0.2', online: true }],
      [{ hostname: 'macmini', ip: '100.64.0.2' }],
    );
    expect(r.created).toEqual([]);
  });

  it('matches by ip even when the hostname changed', async () => {
    const r = await run(
      [{ hostname: 'renamed', ip: '100.64.0.2', online: true }],
      [{ hostname: 'macmini', ip: '100.64.0.2' }],
    );
    expect(r.created).toEqual([]);
  });

  it('skips an offline peer and reports it instead of minting an entity', async () => {
    // A node unseen for weeks is usually a dead registration; creating an
    // entity re-legitimises something the operator may be retiring.
    const r = await run([{ hostname: 'old-laptop', ip: '100.64.0.3', online: false }]);
    expect(r.created).toEqual([]);
    expect(r.skipped_offline).toEqual(['old-laptop']);
  });

  it('creates an offline peer only when explicitly asked', async () => {
    const r = await run([{ hostname: 'old-laptop', ip: '100.64.0.3', online: false }], [], {
      includeOffline: true,
    });
    expect(r.created).toEqual(['old-laptop']);
  });

  it('does not create the same peer twice within one run', async () => {
    const r = await run([
      { hostname: 'cloud', ip: '100.64.0.1', online: true },
      { hostname: 'cloud.mesh.example', ip: '100.64.0.1', online: true },
    ]);
    expect(r.created).toEqual(['cloud']);
  });

  it('ignores peers with no hostname', async () => {
    const r = await run([{ hostname: null, ip: '100.64.0.9', online: true }]);
    expect(r.created).toEqual([]);
  });
});
