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

  it.each([
    null,
    { checkedAt: 0, local_failed: 0, versions: { 'total-recall-brain': '1.0.0' } },
    { checkedAt: 900, local_failed: 2, versions },
  ])('reuses a capable installed CLI when its maintenance report needs work: %j', async (last) => {
    const exec = vi.fn()
      .mockResolvedValueOnce({ success: true, stdout: JSON.stringify({ capabilities: { automaticLocalUpdate: true }, last }) })
      .mockResolvedValueOnce({ success: true });
    const report = await run([self, linux()], exec);
    const command = exec.mock.calls[1][1];
    expect(command).toContain('nohup total-recall update --automatic --local-only --json');
    expect(command).not.toContain('npm exec');
    expect(command).toContain('</dev/null >/tmp/total-recall-automatic-update.log 2>&1 &');
    expect(report.results[0].status).toBe('dispatched');
    expect(report.failed).toBe(1);
    if (last?.local_failed) expect(report.results[0].error).toContain('2 local maintenance failure(s)');
  });

  it.each([
    { success: false, stdout: '', stderr: 'command not found' },
    { success: false, stdout: JSON.stringify({ capabilities: { automaticLocalUpdate: true } }) },
    { success: true, stdout: 'old CLI usage output' },
    { success: true, stdout: 'null' },
    { success: true, stdout: JSON.stringify({ last: null }) },
    { success: true, stdout: JSON.stringify({ capabilities: { automaticLocalUpdate: 'true' } }) },
  ])('retains the pinned bootstrap when a successful capability probe is unavailable: %j', async (observed) => {
    const exec = vi.fn().mockResolvedValueOnce(observed).mockResolvedValueOnce({ success: true });
    const report = await run([self, linux()], exec);
    expect(exec.mock.calls[1][1]).toContain(`nohup npm exec --yes --package=total-recall-brain@${version} -- total-recall update --automatic --local-only --json`);
    expect(report.results[0].status).toBe('dispatched');
    expect(report.failed).toBe(1);
  });

  it('does not dispatch again when a capable peer has an independently verified report', async () => {
    const exec = vi.fn().mockResolvedValue({ success: true, stdout: JSON.stringify({
      capabilities: { automaticLocalUpdate: true }, last: { checkedAt: 900, local_failed: 0, versions },
    }) });
    expect((await run([self, linux()], exec)).failed).toBe(0);
    expect(exec).toHaveBeenCalledTimes(1);
  });

  it('keeps a verified report with a stale serving process failed without dispatching again', async () => {
    const exec = vi.fn().mockResolvedValue({ success: true, stdout: JSON.stringify({
      capabilities: { automaticLocalUpdate: true }, last: { checkedAt: 900, local_failed: 0, versions },
      server: { status: 'stale', reason: 'old serving process' },
    }) });
    const report = await run([self, linux()], exec);
    expect(report.results[0]).toMatchObject({ status: 'failed', error: 'old serving process' });
    expect(exec).toHaveBeenCalledTimes(1);
  });

  it.each([true, false])('reports a failed maintenance dispatch for either command path (capable %s)', async (capable) => {
    const exec = vi.fn()
      .mockResolvedValueOnce({ success: true, stdout: JSON.stringify({ capabilities: { automaticLocalUpdate: capable }, last: null }) })
      .mockResolvedValueOnce({ success: false, stderr: 'transport refused' });
    const report = await run([self, linux()], exec);
    expect(report.results[0]).toMatchObject({ status: 'failed', error: 'transport refused' });
    expect(report.failed).toBe(1);
  });

  it('does not turn a thrown status transport failure into an assumed capable peer', async () => {
    const exec = vi.fn().mockRejectedValue(new Error('peer timeout'));
    const report = await run([self, linux()], exec);
    expect(report.results[0]).toMatchObject({ status: 'failed', error: 'peer timeout' });
    expect(exec).toHaveBeenCalledTimes(1);
  });
});
