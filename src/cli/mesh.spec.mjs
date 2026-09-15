import { describe, it, expect, vi, beforeEach } from 'vitest';
import meshCli from './mesh.mjs';
import * as headscaleClient from '../core/headscale-client.mjs';
import * as meshCore from '../core/mesh.mjs';
import * as meshAccess from '../core/mesh-access.mjs';

describe('cli: mesh', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    process.exitCode = 0;
  });

  it('prints help when called with no arguments or --help', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    await meshCli(['--help']);
    expect(logSpy).toHaveBeenCalled();
    const output = logSpy.mock.calls.map((c) => c.join(' ')).join('\n');
    expect(output).toContain('total-recall mesh — control-server (headscale) administration');
  });

  it('handles status command', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(headscaleClient, 'describeHeadscaleAvailability').mockResolvedValue({
      configured: true,
      reachable: true,
    });

    await meshCli(['status']);
    expect(logSpy).toHaveBeenCalled();
    const output = logSpy.mock.calls.map((c) => c.join(' ')).join('\n');
    expect(output).toContain('"configured": true');
  });

  it('handles nodes command with no nodes found', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(headscaleClient, 'headscaleFetchWithLegacyFallback').mockResolvedValue({
      nodes: [],
    });
    vi.spyOn(meshCore, 'listEnrichedMeshNodes').mockReturnValue([]);

    await meshCli(['nodes']);
    expect(logSpy).toHaveBeenCalled();
    const output = logSpy.mock.calls.map((c) => c.join(' ')).join('\n');
    expect(output).toContain('No nodes found.');
  });

  it('handles policy get command when no policy is set', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(headscaleClient, 'getHeadscalePolicy').mockResolvedValue({
      configured: false,
      policy: '',
    });

    await meshCli(['policy', 'get']);
    expect(logSpy).toHaveBeenCalled();
    const output = logSpy.mock.calls.map((c) => c.join(' ')).join('\n');
    expect(output).toContain('No policy is set on the control server.');
  });

  it('handles leader command', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const leaderMod = await import('../core/leader-election.mjs');
    vi.spyOn(leaderMod, 'getLeaderInfo').mockResolvedValue({
      hostname: 'cloud.mesh',
      ip: '100.64.0.1',
      strategy: 'lowest-mesh-ip',
    });
    vi.spyOn(leaderMod, 'isLeader').mockResolvedValue(false);

    await meshCli(['leader']);
    expect(logSpy).toHaveBeenCalled();
    const output = logSpy.mock.calls.map((c) => c.join(' ')).join('\n');
    expect(output).toContain('Current Cluster Leader: cloud.mesh');
  });

  it('handles ping command for a single node', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(meshCore, 'findMeshNode').mockReturnValue({
      hostname: 'test-node',
      ip: '100.64.0.99',
      online: true,
      self: false,
    });
    const throttled = await import('../core/throttled-fetch.mjs');
    vi.spyOn(throttled, 'throttledFetch').mockResolvedValue({
      ok: true,
      status: 200,
    });

    await meshCli(['ping', 'test-node']);
    expect(logSpy).toHaveBeenCalled();
    const output = logSpy.mock.calls.map((c) => c.join(' ')).join('\n');
    expect(output).toContain('test-node (100.64.0.99)');
  });

  it('handles enroll --status command', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const enrollMod = await import('../core/mesh-enroll.mjs');
    vi.spyOn(enrollMod, 'getEnrollmentStatus').mockResolvedValue({
      state: 'enrolled',
      enrolled: true,
    });

    await meshCli(['enroll', '--status']);
    expect(logSpy).toHaveBeenCalled();
    const output = logSpy.mock.calls.map((c) => c.join(' ')).join('\n');
    expect(output).toContain('"state": "enrolled"');
  });
});

