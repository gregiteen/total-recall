import { beforeEach, describe, expect, it, vi } from 'vitest';
import { spawnSync } from 'node:child_process';
import { clearMeshStatusCache, getMeshHostname, getMeshIp, getMeshPeers, getMeshSelf, isMeshAvailable } from './mesh.mjs';

vi.mock('node:child_process', () => {
  const mockedSpawnSync = vi.fn();
  return { spawnSync: mockedSpawnSync, default: { spawnSync: mockedSpawnSync } };
});

const status = {
  Self: { DNSName: 'laptop.mesh.', TailscaleIPs: ['100.64.0.2'], OS: 'macOS' },
  Peer: {
    a: { DNSName: 'server.mesh.', TailscaleIPs: ['100.64.0.1'], Online: true, OS: 'linux' },
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
    expect(getMeshSelf()).toMatchObject({ hostname: 'laptop.mesh', ip: '100.64.0.2', self: true });
    expect(getMeshIp()).toBe('100.64.0.2');
    expect(getMeshHostname()).toBe('laptop.mesh');
    expect(getMeshPeers({ includeSelf: true })).toHaveLength(2);
    expect(spawnSync).toHaveBeenCalledTimes(1);
  });
});
