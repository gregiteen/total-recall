import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as mesh from './mesh.mjs';
import * as vaultCache from './vault-cache.mjs';
import * as validatedWrite from './validated-write.mjs';
import { tryAcquireLease, renewLease, releaseLease, isLeader, getLeaderInfo } from './leader-election.mjs';

vi.mock('./mesh.mjs', () => ({
  getMeshHostname: vi.fn(),
  getMeshIp: vi.fn(),
}));

vi.mock('./vault-cache.mjs', () => ({
  getNodes: vi.fn(),
}));

vi.mock('./validated-write.mjs', () => ({
  writeNodeValidatedAsync: vi.fn(),
}));

vi.mock('./config.mjs', () => ({
  brainDir: '/mock/brain'
}));

describe('leader-election module', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('tryAcquireLease fails if no hostname', async () => {
    vi.mocked(mesh.getMeshHostname).mockReturnValue(null);
    expect(await tryAcquireLease()).toBe(false);
  });

  it('tryAcquireLease acquires if unowned', async () => {
    vi.mocked(mesh.getMeshHostname).mockReturnValue('laptop.mesh');
    vi.mocked(mesh.getMeshIp).mockReturnValue('100.64.0.1');
    const existing = { frontmatter: { type: 'daemon_leader' }, lease_acquired: null, lease_ttl_seconds: 60 };
    vi.mocked(vaultCache.getNodes).mockReturnValue([existing]);
    vi.mocked(validatedWrite.writeNodeValidatedAsync).mockResolvedValue({ success: true });
    
    const res = await tryAcquireLease();
    expect(res).toBe(true);
    expect(existing.leader_hostname).toBe('laptop.mesh');
    expect(existing.lease_acquired).toBeTruthy();
    expect(existing.lease_id).toBeTruthy();
    expect(validatedWrite.writeNodeValidatedAsync).toHaveBeenCalled();
  });

  it('tryAcquireLease fails if owned and active', async () => {
    vi.mocked(mesh.getMeshHostname).mockReturnValue('laptop.mesh');
    const existing = { 
      frontmatter: { type: 'daemon_leader' }, 
      leader_hostname: 'macmini.mesh',
      lease_acquired: new Date().toISOString(), 
      lease_ttl_seconds: 60 
    };
    vi.mocked(vaultCache.getNodes).mockReturnValue([existing]);
    
    const res = await tryAcquireLease();
    expect(res).toBe(false);
  });

  it('isLeader returns true if lease holds', async () => {
    // Acquire first to set currentLeaseId
    vi.mocked(mesh.getMeshHostname).mockReturnValue('laptop.mesh');
    const existing = { frontmatter: { type: 'daemon_leader' } };
    vi.mocked(vaultCache.getNodes).mockReturnValue([existing]);
    vi.mocked(validatedWrite.writeNodeValidatedAsync).mockResolvedValue({ success: true });
    
    await tryAcquireLease();
    
    expect(await isLeader()).toBe(true);
  });

  it('getLeaderInfo returns active leader info', async () => {
    vi.mocked(vaultCache.getNodes).mockReturnValue([{ 
      frontmatter: { type: 'daemon_leader' },
      leader_hostname: 'cloud.mesh',
      leader_mesh_ip: '100.64.0.3',
      lease_id: 'some-id',
      lease_acquired: new Date().toISOString(),
      lease_ttl_seconds: 60
    }]);
    
    const info = await getLeaderInfo();
    expect(info.hostname).toBe('cloud.mesh');
    expect(info.ip).toBe('100.64.0.3');
  });
});
