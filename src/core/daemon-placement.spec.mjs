// @vitest-environment node
import { describe, it, expect, vi } from 'vitest';
import { configuredDaemonPlacement, observeRuntimeDaemon, startupHealth, healthVerdict, runtimeHealthFields, PEER_PROBE_HEADER, PEER_PROBE_TIMEOUT_MS } from './startup-health.mjs';

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
    // Only the marker that asks the peer to answer locally; never a credential.
    expect(options.headers).toEqual({ [PEER_PROBE_HEADER]: 'peer' });
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

describe('non-blocking placement and peer observation on the /health request path', () => {
  const fresh = () => ({ cache: new Map(), inflight: new Map(), placements: new Map(), placementPending: new Map() });
  const never = () => new Promise(() => {});
  const clock = start => { let at = start; return { now: () => at, tick: ms => { at += ms; } }; };
  const settle = async () => { for (let i = 0; i < 4; i++) await new Promise(resolve => setTimeout(resolve, 10)); };
  // The first request only starts placement discovery; once it has landed the peer is observed.
  const warm = async (options, calls = 2) => { for (let i = 0; i < calls; i++) { await observeRuntimeDaemon('/brain', options); await settle(); } };

  it('keeps the WAN probe deadline at 10 s and never answers readiness from a probe it did not finish', () => {
    expect(PEER_PROBE_TIMEOUT_MS).toBeGreaterThanOrEqual(10000);
  });

  it('answers at once while placement discovery itself is stuck, reporting the strict local observation as warming', async () => {
    const state = fresh();
    const stuck = vi.fn(never);
    const fetchImpl = vi.fn();
    const started = Date.now();
    const first = await observeRuntimeDaemon('/brain', { localObservation: absent, placement: stuck, fetchImpl, nonBlocking: true, ...state });
    expect(Date.now() - started).toBeLessThan(500);
    // Discovery starts after the request has been answered, never inside it.
    expect(stuck).not.toHaveBeenCalled();
    expect(first).toMatchObject({ ...absent, local: absent, warming: true, placement: { mode: 'unknown' }, placement_reason: 'daemon-placement-warming' });
    expect(runtimeHealthFields(first, true)).toMatchObject({ status: 'degraded', server_ready: true, daemon: 'not_started' });
    await settle();
    expect(stuck).toHaveBeenCalledTimes(1);
    // Still stuck: a second request neither waits nor starts a second discovery.
    await observeRuntimeDaemon('/brain', { localObservation: absent, placement: stuck, fetchImpl, nonBlocking: true, ...state });
    expect(stuck).toHaveBeenCalledTimes(1);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('does not claim healthy from a running local process while its configured worker placement is unknown', async () => {
    const local = { ...absent, status: 'running', pid: 123 };
    const observation = await observeRuntimeDaemon('/brain', { localObservation: local,
      placement: never, nonBlocking: true, ...fresh() });
    expect(observation.local).toEqual(local);
    expect(runtimeHealthFields(observation, true)).toMatchObject({ status: 'degraded', server_ready: true });
  });

  it('never hides a conflicting or unidentifiable local process while placement is unknown, cached or stale', async () => {
    for (const status of ['conflict', 'unknown']) {
      const state = fresh(), time = clock(0);
      const local = { ...absent, status, reason: 'foreign-pid', pid: 123, entry: '/other/daemon-loop.mjs' };
      const fetchImpl = vi.fn(async () => json(health));
      const options = { localObservation: local, placement, fetchImpl, nonBlocking: true, now: time.now, ...state };
      expect(await observeRuntimeDaemon('/brain', options)).toMatchObject({ ...local, warming: true });
      await settle();
      expect(await observeRuntimeDaemon('/brain', options)).toMatchObject(local);
      time.tick(31000);
      expect(await observeRuntimeDaemon('/brain', options)).toMatchObject({ ...local, stale: true });
      expect(fetchImpl).not.toHaveBeenCalled();
    }
  });

  it('keeps the strict local answer for an unpinned node once placement is known, and expires placement that is too old', async () => {
    const state = fresh(), time = clock(0);
    const resolve = vi.fn(async () => ({ mode: 'local' }));
    const options = { localObservation: absent, placement: resolve, nonBlocking: true, now: time.now, fetchImpl: vi.fn(), ...state };
    await warm(options, 1);
    expect(await observeRuntimeDaemon('/brain', options)).toEqual(absent);
    time.tick(6000);
    expect(await observeRuntimeDaemon('/brain', options)).toEqual(absent);
    await settle();
    expect(resolve).toHaveBeenCalledTimes(2);
    resolve.mockImplementation(never); time.tick(31000);
    expect(await observeRuntimeDaemon('/brain', options)).toMatchObject({ ...absent, stale: true, placement_reason: 'daemon-placement-stale' });
  });

  it('answers at once while the peer is slow, reporting warming, then serves the real observation', async () => {
    const state = fresh(), time = clock(1_000);
    let release;
    const fetchImpl = vi.fn(() => new Promise(resolve => { release = () => resolve(json(health)); }));
    const options = { localObservation: absent, placement, fetchImpl, nonBlocking: true, now: time.now, ...state };
    await warm(options, 1);
    const first = await observeRuntimeDaemon('/brain', options);
    expect(first).toMatchObject({ status: 'unknown', reason: 'leader-observation-warming', warming: true, local: absent, placement: endpoint });
    expect(runtimeHealthFields(first, true)).toMatchObject({ status: 'degraded', server_ready: true, daemon: 'unknown' });
    // A second request during the same slow probe starts no second probe and still answers at once.
    expect((await observeRuntimeDaemon('/brain', options)).reason).toBe('leader-observation-warming');
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    release(); await settle();
    const warmed = await observeRuntimeDaemon('/brain', options);
    expect(warmed).toMatchObject({ status: 'running', cached: true, age_ms: 0, observed_at: new Date(1_000).toISOString() });
    expect(runtimeHealthFields(warmed, true)).toMatchObject({ status: 'healthy', daemon: 'running' });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('refreshes in the background after the refresh age and expires an observation too old to trust', async () => {
    const state = fresh(), time = clock(0);
    let daemon = 'running';
    const fetchImpl = vi.fn(async () => json({ ...health, daemon }));
    const options = { localObservation: absent, placement, fetchImpl, nonBlocking: true, now: time.now,
      refreshAfterMs: 5000, maxAgeMs: 30000, ...state };
    await warm(options, 2);
    expect(await observeRuntimeDaemon('/brain', options)).toMatchObject({ status: 'running', cached: true });
    time.tick(4000);
    expect((await observeRuntimeDaemon('/brain', options)).cached).toBe(true);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    daemon = 'not_started'; time.tick(2000);
    // Older than the refresh age: still the last real observation, honestly dated, and a refresh starts.
    expect(await observeRuntimeDaemon('/brain', options)).toMatchObject({ status: 'running', cached: true, age_ms: 6000 });
    await settle();
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(await observeRuntimeDaemon('/brain', options)).toMatchObject({ status: 'failed', reason: 'leader-daemon-not-running' });
    // A peer that stops answering is never served as a stale success.
    fetchImpl.mockImplementation(never);
    for (let i = 0; i < 6; i++) { time.tick(6000); await observeRuntimeDaemon('/brain', options); await settle(); }
    const expired = await observeRuntimeDaemon('/brain', options);
    expect(expired).toMatchObject({ status: 'unknown', reason: 'leader-observation-stale', stale: true, last_status: 'failed', placement: endpoint });
  });

  it('caches an unreachable peer as an error instead of probing on every request', async () => {
    const state = fresh(), time = clock(0);
    const fetchImpl = vi.fn(async () => { throw new Error('offline'); });
    const options = { localObservation: absent, placement, fetchImpl, nonBlocking: true, now: time.now, ...state };
    await warm(options, 2);
    const calls = fetchImpl.mock.calls.length;
    const reported = await observeRuntimeDaemon('/brain', options);
    expect(reported).toMatchObject({ status: 'offline', reason: 'leader-health-unreachable', cached: true });
    expect(fetchImpl).toHaveBeenCalledTimes(calls);
    expect(runtimeHealthFields(reported, true)).toMatchObject({ status: 'degraded', server_ready: true, daemon: 'offline' });
  });

  it('sends no credentials and does not follow redirects when probing in the background', async () => {
    const state = fresh();
    const fetchImpl = vi.fn(async () => json(health));
    await warm({ localObservation: absent, placement, fetchImpl, nonBlocking: true, ...state }, 2);
    const [, options] = fetchImpl.mock.calls[0];
    expect(options).toMatchObject({ redirect: 'error', credentials: 'omit', headers: { [PEER_PROBE_HEADER]: 'peer' } });
    expect(JSON.stringify(options)).not.toMatch(/authorization|cookie/i);
  });

  it('breaks reciprocal delegation: two nodes pinned to each other never chain probes', async () => {
    const sent = [];
    const make = name => ({ name, ...fresh(), local: { ...absent, status: 'not-started', expected_entry: `/${name}/daemon-loop.mjs` } });
    const a = make('a'), b = make('b');
    const serve = (node, peer) => async (_url, options = {}) => {
      sent.push([node.name, options.headers?.[PEER_PROBE_HEADER] ?? null]);
      const probed = options.headers?.[PEER_PROBE_HEADER] === 'peer';
      // A probed node answers from its own process; an ordinary request observes its own leader.
      const observation = probed ? node.local
        : await observeRuntimeDaemon(`/${node.name}`, { localObservation: node.local, placement, nonBlocking: true,
          fetchImpl: peer(), cache: node.cache, inflight: node.inflight, placements: node.placements, placementPending: node.placementPending });
      return json({ ...health, ...runtimeHealthFields(observation, true), daemon: observation.status === 'running' ? 'running' : 'not_started' });
    };
    const toA = () => serve(a, () => toB());
    const toB = () => serve(b, () => toA());
    for (let i = 0; i < 2; i++) { await toA()('http://a/health', {}); await settle(); }
    // A's background probe reached B with the marker and B did not probe back.
    expect(sent.filter(([name]) => name === 'b')).toEqual([['b', 'peer']]);
    expect(sent.some(([name, marker]) => name === 'a' && marker === 'peer')).toBe(false);
    const third = await (await toA()('http://a/health', {})).json();
    expect(third.daemon_observation).toMatchObject({ status: 'degraded', reason: 'leader-reports-degraded', cached: true });
    expect(third.status).toBe('degraded');
  });

  it('terminates against a peer that predates the marker because its own observation is non-blocking too', async () => {
    const old = fresh();
    let calls = 0;
    const legacyPeer = async () => {
      calls++;
      // An older peer ignores the marker and observes its own leader; the reply is immediate (warming).
      const observation = await observeRuntimeDaemon('/old', { localObservation: absent, placement, nonBlocking: true,
        fetchImpl: () => never(), ...old });
      return json({ ...health, ...runtimeHealthFields(observation, true) });
    };
    const state = fresh();
    const options = { localObservation: absent, placement, fetchImpl: legacyPeer, nonBlocking: true, ...state };
    await warm(options, 2);
    expect(calls).toBe(1);
    expect(await observeRuntimeDaemon('/brain', options)).toMatchObject({ status: 'degraded', reason: 'leader-reports-degraded', cached: true });
  });

  it('startup and status read placement and the peer live, so the check reflects them right now', async () => {
    const state = fresh();
    let daemon = 'running';
    const fetchImpl = vi.fn(async () => json({ ...health, daemon }));
    const options = { localObservation: absent, placement, fetchImpl, ...state };
    expect(await observeRuntimeDaemon('/brain', options)).toMatchObject({ status: 'running', cached: false });
    daemon = 'not_started';
    expect(await observeRuntimeDaemon('/brain', options)).toMatchObject({ status: 'failed', reason: 'leader-daemon-not-running' });
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
