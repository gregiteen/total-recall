import { describe, it, expect, vi } from 'vitest';
import { updateMeshBrainPackages } from './mesh-brain-updates.mjs';

const version = '9.9.9';
const versions = { 'total-recall-brain': version };
const self = { ip: '100.64.0.10', hostname: 'build-box', os: 'macOS', online: true, self: true, access: { ssh_user: 'admin' } };
const linux = (over = {}) => ({ ip: '100.64.0.11', hostname: 'server', os: 'linux', online: true, access: { ssh_user: 'admin' }, ...over });
const run = (nodes, exec = vi.fn()) => updateMeshBrainPackages({ version, versions, listNodes: () => nodes, exec, now: () => 1000 });

describe('updateMeshBrainPackages', () => {
  it('does not count a stored record that is not on the mesh as a failure', async () => {
    const exec = vi.fn();
    const report = await run([self, { ip: null, hostname: 'old-name', os: 'macOS', online: false, vault_only: true, access: { ssh_user: 'admin' } }], exec);
    expect(report.results).toEqual([{ node: 'old-name', status: 'not-enrolled' }]);
    expect(report.failed).toBe(0);
    expect(exec).not.toHaveBeenCalled();
  });

  it('still fails when the whole mesh is unavailable, so an outage cannot pass as success', async () => {
    const stored = linux({ online: false, vault_only: true });
    const report = await run([stored]);
    expect(report.results[0].status).toBe('failed');
    expect(report.failed).toBe(1);
  });

  it('has nothing to update on an install with no mesh', async () => {
    const report = await run([]);
    expect(report).toEqual({ failed: 0, results: [] });
  });

  it('reports a device that cannot run Total Recall as unsupported, not failed', async () => {
    for (const os of ['iOS', 'android', 'tvOS']) {
      const exec = vi.fn();
      const report = await run([self, linux({ hostname: 'phone', os, access: {} })], exec);
      expect(report.results).toEqual([{ node: '100.64.0.11', status: 'unsupported', os }]);
      expect(report.failed).toBe(0);
      expect(exec).not.toHaveBeenCalled();
    }
  });

  it('reports an offline machine as offline even when it has no recorded login', async () => {
    const report = await run([self, linux({ online: false, access: {} })]);
    expect(report.results[0].status).toBe('failed');
    expect(report.results[0].error).toMatch(/offline/i);
    expect(report.failed).toBe(1);
  });

  it('fails an online machine with no recorded login', async () => {
    const report = await run([self, linux({ access: {} })]);
    expect(report.results[0].error).toMatch(/no configured update transport/i);
    expect(report.failed).toBe(1);
  });

  it('verifies a current peer and keeps a dispatched one visible as not yet verified', async () => {
    const current = { checkedAt: 900, local_failed: 0, versions };
    const verified = await run([self, linux()], vi.fn().mockResolvedValue({ success: true, stdout: JSON.stringify({ last: current }) }));
    expect(verified.results[0].status).toBe('verified');
    expect(verified.failed).toBe(0);

    const stale = await run([self, linux()], vi.fn().mockResolvedValue({ success: true, stdout: JSON.stringify({ last: { ...current, versions: { 'total-recall-brain': '1.0.0' } } }) }));
    expect(stale.results[0].status).toBe('dispatched');
    expect(stale.failed).toBe(1);
  });
});
