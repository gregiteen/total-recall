// @vitest-environment node
import { describe, it, expect, vi } from 'vitest';
import { configuredDaemonPlacement, observeRuntimeDaemon, startupHealth, healthVerdict, runtimeHealthFields } from './startup-health.mjs';

vi.mock('./required-plugins.mjs', () => ({ inspectRequiredPlugins: () => ({ status: 'ready', errors: [] }) }));

const endpoint = { mode: 'remote', ip: '100.64.0.10', port: 3900 };
const health = { status: 'healthy', version: '1', uptime_seconds: 1, embedding_coverage: [],
  daemon: 'running', vfs: { exists: true, skill_exists: true } };
const absent = { status: 'not-started', source: 'local-pid', expected_entry: '/own/src/core/daemon-loop.mjs' };
const json = body => new Response(JSON.stringify(body));
const placement = async () => endpoint;
function meshFixture({ pin = endpoint.ip, port = endpoint.port, self = '100.64.0.20', leader = { ip: endpoint.ip, port: endpoint.port, strategy: 'pinned-mesh-ip' } } = {}) {
  const owner = { leaderPin: vi.fn(() => pin), leaderPort: vi.fn(() => port), getLeaderInfo: vi.fn(async () => leader) };
  const load = vi.fn(async (_id, module) => module === 'leader-election' ? owner : { getMeshSelf: () => self ? { ip: self } : null });
  return { owner, load };
}

describe('configured Mesh daemon placement', () => {
  it('requires the selected brain pin, online pinned leader, own node identity and matching configured port', async () => {
    const { owner, load } = meshFixture();
    expect(await configuredDaemonPlacement('/selected/brain', { cwd: '/selected/root', load })).toEqual(endpoint);
    expect(owner.leaderPin).toHaveBeenCalledWith('/selected/brain');
    expect(owner.leaderPort).toHaveBeenCalledWith('/selected/brain');
    expect(load.mock.calls.every(([, , options]) => options.projectRoot === '/selected/root')).toBe(true);
  });

  it('does not use another root pin or an elected peer when this root has no pin', async () => {
    const { owner, load } = meshFixture();
    owner.leaderPin.mockImplementation(brain => brain === '/pinned/brain' ? endpoint.ip : null);
    expect(await configuredDaemonPlacement('/pinned/brain', { load })).toEqual(endpoint);
    owner.getLeaderInfo.mockClear();
    expect(await configuredDaemonPlacement('/other/brain', { load })).toEqual({ mode: 'local' });
    expect(owner.getLeaderInfo).not.toHaveBeenCalled();
  });

  it('requires a local daemon on the pinned owner itself', async () => {
    const { load } = meshFixture({ self: endpoint.ip });
    expect(await configuredDaemonPlacement('/brain', { load })).toEqual({ mode: 'local' });
  });

  it.each([
    { leader: null }, { leader: { ...endpoint, strategy: 'lowest-mesh-ip' } },
    { leader: { ip: '100.64.0.30', port: 3900, strategy: 'pinned-mesh-ip' } },
    { leader: { ip: endpoint.ip, port: 3000, strategy: 'pinned-mesh-ip' } },
    { port: null }, { port: 0 }, { port: 65536 }, { pin: 'http://peer.invalid' }, { self: null },
  ])('does not delegate uncertain placement %j', async input => {
    const { load } = meshFixture(input);
    expect((await configuredDaemonPlacement('/brain', { load })).mode).toBe('unknown');
  });

  it('fails closed when the Mesh owner cannot report placement', async () => {
    const load = async () => { throw new Error('owner unavailable'); };
    expect(await configuredDaemonPlacement('/brain', { load })).toEqual({ mode: 'unknown', reason: 'daemon-placement-unavailable' });
  });
});

describe('runtime daemon observation', () => {
  it('verifies actual owner health, preserving absence and sending no credentials', async () => {
    const fetchImpl = vi.fn(async () => json(health));
    const result = await observeRuntimeDaemon('/brain', { localObservation: absent, placement, fetchImpl });
    expect(result).toMatchObject({ status: 'running', source: 'configured-leader-health', local: absent,
      placement: endpoint, owner_url: 'http://100.64.0.10:3900' });
    const [url, options] = fetchImpl.mock.calls[0];
    expect(String(url)).toBe('http://100.64.0.10:3900/health');
    expect(options).toMatchObject({ redirect: 'error', credentials: 'omit' });
    expect(options.headers).toBeUndefined();
    expect(options.signal).toBeInstanceOf(AbortSignal);
  });

  it.each(['conflict', 'unknown'])('never conceals local %s behind remote health', async status => {
    const local = { ...absent, status, reason: 'foreign-pid', pid: 123, entry: '/other/daemon-loop.mjs' };
    const fetchImpl = vi.fn(async () => json(health));
    expect(await observeRuntimeDaemon('/brain', { localObservation: local, placement, fetchImpl })).toMatchObject(local);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it.each([
    null, {}, { ...health, status: 'degraded' }, { ...health, daemon: 'not_started' },
    { ...health, vfs: { exists: false, skill_exists: true } },
    { ...health, daemon_observation: { status: 'running', source: 'configured-leader-health' } },
    { ...health, daemon_observation: { status: 'conflict', source: 'local-pid' } },
  ])('does not claim readiness from malformed/degraded/delegated owner health %j', async body => {
    const result = await observeRuntimeDaemon('/brain', { localObservation: absent, placement, fetchImpl: async () => json(body) });
    expect(result.status).not.toBe('running');
    expect(result.local).toEqual(absent);
  });

  it('accepts a locally verified owner observation', async () => {
    const result = await observeRuntimeDaemon('/brain', { localObservation: absent, placement,
      fetchImpl: async () => json({ ...health, daemon_observation: { status: 'running', source: 'local-pid' } }) });
    expect(result.status).toBe('running');
  });

  it('reports invalid JSON, HTTP failure and offline distinctly without falling back to local readiness', async () => {
    for (const [fetchImpl, status, reason] of [
      [async () => new Response('<html>'), 'unknown', 'unrecognized-leader-health'],
      [async () => new Response('', { status: 403 }), 'failed', 'leader-health-http-failure'],
      [async () => { throw new Error('offline'); }, 'offline', 'leader-health-unreachable'],
    ]) {
      const result = await observeRuntimeDaemon('/brain', { localObservation: { ...absent, status: 'running' }, placement, fetchImpl });
      expect(result).toMatchObject({ status, reason, placement: endpoint });
    }
  });

  it('uses strict local status without a pin and never probes an elected peer', async () => {
    const fetchImpl = vi.fn();
    expect(await observeRuntimeDaemon('/brain', { localObservation: absent, placement: async () => ({ mode: 'local' }), fetchImpl })).toEqual(absent);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('keeps endpoint health and startup worker readiness consistent without concealing server failures', async () => {
    const delegated = await observeRuntimeDaemon('/brain', { localObservation: absent, placement, fetchImpl: async () => json(health) });
    expect(runtimeHealthFields(delegated, true)).toMatchObject({ status: 'healthy', server_ready: true, daemon: 'running', daemon_observation: { local: absent } });
    expect(runtimeHealthFields(absent, true)).toMatchObject({ status: 'degraded', server_ready: true, daemon: 'not_started' });
    expect(runtimeHealthFields(delegated, false)).toMatchObject({ status: 'degraded', server_ready: false });
    expect(healthVerdict({ ...health, ...runtimeHealthFields(delegated, false) }).status).toBe('degraded');
    for (const status of ['conflict', 'unknown', 'offline', 'failed', 'stopped']) {
      expect(runtimeHealthFields({ status }, true).status).toBe('degraded');
    }
  });
});

describe('startup ensure placement boundary', () => {
  const base = { brainDir: '/brain', brainUrl: 'http://localhost:3000', ensure: true, platform: 'darwin',
    identity: file => file.endsWith('server.pid') ? { status: 'running', pid: 123 } : absent,
    listener: async () => true, onDiskVersion: () => '1', dashboardCheck: async () => ({ status: 'current' }), pluginChecks: async () => [] };

  it.each(['healthy', 'offline', 'malformed', 'unknown-placement'])('does not spawn local work for delegated %s', async mode => {
    const run = vi.fn(async () => ({ code: 0, output: 'SSSS tooling' }));
    const report = await startupHealth({ ...base, token: 'LOCAL_TOKEN_CANARY', brainId: 'project:selected', run,
      daemonPlacement: mode === 'unknown-placement' ? async () => ({ mode: 'unknown' }) : placement,
      fetchImpl: async (url, options) => {
        if (url.hostname === endpoint.ip) {
          expect(JSON.stringify(options)).not.toContain('LOCAL_TOKEN_CANARY');
          expect(url.search).toBe('');
          if (mode === 'offline') throw new Error('offline');
          return json(mode === 'malformed' ? {} : health);
        }
        return url.pathname === '/health' ? json(health) : new Response('# Selected instructions');
      } });
    expect(report.shared_ready).toBe(mode === 'healthy');
    expect(report.actions).toEqual([]);
    expect(run).toHaveBeenCalledTimes(1);
    expect(run.mock.calls[0][1]).toEqual(['--help']);
  });

  it('keeps local conflict a failure and never spawns or loses identity', async () => {
    const run = vi.fn(async () => ({ code: 0, output: 'SSSS tooling' }));
    const report = await startupHealth({ ...base, run, daemonPlacement: placement,
      identity: file => file.endsWith('server.pid') ? { status: 'running', pid: 123 } : { ...absent, status: 'conflict', reason: 'foreign-pid', entry: '/other/daemon-loop.mjs' },
      fetchImpl: async url => url.pathname === '/health' ? json(health) : new Response('# Instructions') });
    expect(report.shared_ready).toBe(false);
    expect(report.daemon).toMatchObject({ status: 'conflict', expected_entry: expect.any(String), entry: '/other/daemon-loop.mjs' });
    expect(report.actions).toEqual([]);
    expect(run).toHaveBeenCalledTimes(1);
  });

  it('still requires and can start the local daemon without explicit remote placement', async () => {
    let started = false;
    const run = vi.fn(async (_binary, args) => {
      if (args.includes('daemon')) started = true;
      return { code: 0, output: 'SSSS tooling' };
    });
    const options = { ...base, run, daemonPlacement: async () => ({ mode: 'local' }),
      identity: file => file.endsWith('server.pid') || started ? { status: 'running', pid: 123 } : absent,
      fetchImpl: async url => url.pathname === '/health' ? json({ ...health, status: 'degraded', server_ready: true, daemon: 'not_started' }) : new Response('# Instructions') };
    expect((await startupHealth({ ...options, ensure: false })).shared_ready).toBe(false);
    expect(started).toBe(false);
    const report = await startupHealth(options);
    expect(report.shared_ready).toBe(true);
    expect(report.actions).toEqual([{ component: 'daemon', action: 'cli-start', accepted: true }]);
    expect(healthVerdict({ ...health, status: 'degraded', server_ready: false }).status).toBe('degraded');
  });
});
