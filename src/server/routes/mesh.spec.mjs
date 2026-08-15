import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import meshRouter from './mesh.mjs';

vi.mock('../auth.mjs', () => ({
  requireAuth: (req, res, next) => next(),
  requireScope: () => (req, res, next) => next()
}));

vi.mock('../../core/leader-election.mjs', () => ({
  getLeaderInfo: vi.fn().mockResolvedValue({ hostname: 'node-a.mesh', ip: '100.64.0.1', strategy: 'lowest-mesh-ip' }),
  isLeader: vi.fn().mockResolvedValue(true)
}));

vi.mock('../../core/vfs-documents.mjs', () => ({
  defaultVaultRoot: vi.fn().mockReturnValue('/tmp/tr-mesh-test-vault'),
}));

vi.mock('../../core/throttled-fetch.mjs', () => ({
  throttledFetch: vi.fn().mockResolvedValue({ ok: true, status: 200 }),
}));

vi.mock('../../core/network-interfaces.mjs', () => ({
  listLocalInterfaces: vi.fn().mockReturnValue([
    {
      name: 'eth0',
      kind: 'ethernet',
      internal: false,
      addresses: [{ address: '192.168.1.10', family: 'IPv4', is_lan: true }],
      has_lan_ipv4: true,
    },
  ]),
  summarizeInterfacesForEntity: vi.fn().mockReturnValue([
    { name: 'eth0', kind: 'ethernet', ipv4: ['192.168.1.10'] },
  ]),
}));

vi.mock('../../core/lan-discovery.mjs', () => ({
  discoverLanSnapshot: vi.fn().mockResolvedValue({
    discovered_at: '2026-07-18T00:00:00Z',
    interfaces: [],
    local_lan: [{ address: '192.168.1.10', cidr: '192.168.1.10/24' }],
    hosts: [{ ip: '192.168.1.20', mac: 'aa:bb:cc:dd:ee:ff', tr_reachable: true }],
    host_count: 1,
    tr_reachable_count: 1,
  }),
  registerLanMeshNodes: vi.fn().mockResolvedValue({
    registered_at: '2026-07-18T00:00:00Z',
    attempted: 1,
    written_count: 1,
    results: [{ ip: '192.168.1.20', hostname: 'lan-192-168-1-20', path: 'system/mesh-nodes/lan-192-168-1-20.md', written: true, action: 'created' }],
  }),
}));

vi.mock('../../core/device-io.mjs', () => ({
  detectDeviceIo: vi.fn().mockReturnValue({
    headless: false,
    display: { present: true, touch: false, count: 1, width: 1920, height: 1080 },
    audio: { input: true, output: true },
    camera: { present: false },
    input: { keyboard: true, pointer: true, touch: false },
    channels: ['screen', 'keyboard', 'pointer', 'microphone', 'speaker'],
    ui_hints: ['desktop_or_browser_ui'],
    sources: ['test'],
    measured_at: '2026-07-18T00:00:00Z',
    platform: 'linux',
  }),
  mergeIoProfiles: vi.fn((live) => live),
  uiHintsFromIo: vi.fn().mockReturnValue(['desktop_or_browser_ui']),
}));

vi.mock('../../core/mesh-enroll.mjs', () => ({
  getEnrollmentStatus: vi.fn().mockResolvedValue({
    state: 'needs_login',
    enrolled: false,
    backend_state: 'NeedsLogin',
    auth_url: 'https://control.example.org/register/abc123',
    ips: [],
    hostname: 'node-a',
    login_server: 'https://control.example.org',
    can_auto_enroll: true,
    auto_enroll_blocked_reason: null,
    auto_enroll_enabled: true,
    client_available: true,
    checked_at: '2026-07-18T00:00:00Z',
  }),
  enrollThisNode: vi.fn().mockResolvedValue({
    ok: true,
    changed: true,
    state: 'enrolled',
    method: 'preauth-key',
    status: { state: 'enrolled', enrolled: true, ips: ['100.64.0.1'] },
  }),
  resetAutoEnrollThrottle: vi.fn(),
}));

vi.mock('../../core/ssss-operation-service.mjs', () => ({
  appendVfsEvent: vi.fn().mockResolvedValue({ success: true }),
  listVfsEvents: vi.fn().mockResolvedValue([
    {
      event_id: 'ev-1',
      payload: {
        kind: 'mesh_election',
        hostname: 'node-a.mesh',
        ip: '100.64.0.1',
        note: 'manual refresh',
        at: '2026-07-18T00:00:00Z',
        strategy: 'lowest-mesh-ip',
      },
    },
  ]),
}));

vi.mock('../../core/mesh.mjs', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    clearMeshStatusCache: vi.fn(),
    getMeshPeers: vi.fn().mockReturnValue([
      { hostname: 'node-a.mesh', ip: '100.64.0.1', online: true, self: true },
      { hostname: 'node-b.mesh', ip: '100.64.0.2', online: true, self: false },
    ]),
    listEnrichedMeshNodes: vi.fn().mockReturnValue([
      {
        hostname: 'node-a.mesh',
        ip: '100.64.0.1',
        online: true,
        self: true,
        role: 'build-host',
        labels: ['ci'],
        has_entity: true,
        transports: ['mesh'],
      },
    ]),
    listMeshNodeEntities: vi.fn().mockReturnValue([{ type: 'mesh_node', hostname: 'node-a.mesh' }]),
    attachSelfInterfaces: vi.fn((nodes, summary) =>
      nodes.map((n) => (n.self ? { ...n, interfaces: summary, transports: ['mesh', 'lan'] } : n)),
    ),
    setMeshNodeAccess: vi.fn().mockResolvedValue({
      written: true,
      path: 'system/mesh-nodes/node-b.md',
      access: { ssh_user: 'operator', source: 'manual' },
    }),
  };
});

// Only the file read is stubbed: the matching and precedence rules are the part
// worth exercising, and reading the real ~/.ssh/config would make these tests
// depend on whoever happens to run them.
vi.mock('../../core/mesh-access.mjs', async (importOriginal) => ({
  ...(await importOriginal()),
  readSshConfig: vi.fn(() => 'Host node-b\n  HostName 10.0.0.9\n  User operator\n'),
}));

describe('mesh routes', () => {
  let app;

  beforeEach(() => {
    vi.clearAllMocks();
    app = express();
    app.use(express.json());
    app.use(meshRouter);
  });

  it('GET /api/mesh/leader returns leader info', async () => {
    const res = await request(app).get('/api/mesh/leader');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      leader: { hostname: 'node-a.mesh', ip: '100.64.0.1', strategy: 'lowest-mesh-ip' },
      is_current_node_leader: true
    });
  });

  it('GET /api/mesh/nodes returns enriched peers with entity variables', async () => {
    const res = await request(app).get('/api/mesh/nodes');
    expect(res.status).toBe(200);
    expect(res.body.nodes).toHaveLength(1);
    expect(res.body.nodes[0].role).toBe('build-host');
    expect(res.body.entity_count).toBe(1);
  });

  it('POST /api/mesh/election/refresh clears cached status and returns deterministic leader', async () => {
    const { clearMeshStatusCache } = await import('../../core/mesh.mjs');
    const { appendVfsEvent } = await import('../../core/ssss-operation-service.mjs');
    const res = await request(app).post('/api/mesh/election/refresh');
    expect(res.status).toBe(200);
    expect(clearMeshStatusCache).toHaveBeenCalledOnce();
    expect(res.body.leader).toMatchObject({ hostname: 'node-a.mesh', ip: '100.64.0.1' });
    expect(res.body.is_current_node_leader).toBe(true);
    expect(appendVfsEvent).toHaveBeenCalled();
  });

  it('GET /api/mesh/election/history returns mesh_election events from mesh-election workspace', async () => {
    const { listVfsEvents } = await import('../../core/ssss-operation-service.mjs');
    const res = await request(app).get('/api/mesh/election/history');
    expect(res.status).toBe(200);
    expect(listVfsEvents).toHaveBeenCalledWith({ workspaceId: 'mesh-election' });
    expect(res.body.events).toHaveLength(1);
    expect(res.body.events[0].hostname).toBe('node-a.mesh');
    expect(res.body.workspace).toBe('mesh-election');
  });

  it('POST /api/mesh/election/log records observation via SSSS event', async () => {
    const { appendVfsEvent } = await import('../../core/ssss-operation-service.mjs');
    const res = await request(app).post('/api/mesh/election/log').send({
      hostname: 'node-b.mesh',
      ip: '100.64.0.2',
      note: 'observed',
    });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(appendVfsEvent).toHaveBeenCalled();
    const opts = appendVfsEvent.mock.calls.at(-1)?.[2];
    expect(opts?.workspaceId).toBe('mesh-election');
  });

  it('GET /api/mesh/latency measures peer RTTs through the fetch gate', async () => {
    const { throttledFetch } = await import('../../core/throttled-fetch.mjs');
    const res = await request(app).get('/api/mesh/latency');
    expect(res.status).toBe(200);
    expect(res.body.latency_ms['node-a.mesh']).toBe(0);
    expect(throttledFetch).toHaveBeenCalled();
    expect(res.body.results).toHaveLength(2);
  });

  it('GET /api/mesh/interfaces returns classified NICs', async () => {
    const res = await request(app).get('/api/mesh/interfaces');
    expect(res.status).toBe(200);
    expect(res.body.summary[0].kind).toBe('ethernet');
  });

  it('GET /api/mesh/lan returns LAN discovery snapshot', async () => {
    const res = await request(app).get('/api/mesh/lan');
    expect(res.status).toBe(200);
    expect(res.body.host_count).toBe(1);
    expect(res.body.tr_reachable_count).toBe(1);
  });

  it('GET /api/mesh/io returns I/O channels and UI hints for agents', async () => {
    const res = await request(app).get('/api/mesh/io');
    expect(res.status).toBe(200);
    expect(res.body.io.channels).toContain('screen');
    expect(res.body.ui_hints).toContain('desktop_or_browser_ui');
  });

  it('POST /api/mesh/lan/register upserts TR-reachable LAN peers as entities', async () => {
    const { registerLanMeshNodes } = await import('../../core/lan-discovery.mjs');
    const res = await request(app).post('/api/mesh/lan/register').send({ probe: true });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.registration.written_count).toBe(1);
    expect(registerLanMeshNodes).toHaveBeenCalled();
  });

  it('GET /api/mesh/enrollment reports this node enrollment state', async () => {
    const res = await request(app).get('/api/mesh/enrollment');
    expect(res.status).toBe(200);
    expect(res.body.enrolled).toBe(false);
    expect(res.body.state).toBe('needs_login');
    expect(res.body.auth_url).toBe('https://control.example.org/register/abc123');
    expect(res.body.can_auto_enroll).toBe(true);
  });

  it('POST /api/mesh/enroll enrolls the node and clears the status cache', async () => {
    const { enrollThisNode, resetAutoEnrollThrottle } = await import('../../core/mesh-enroll.mjs');
    const { clearMeshStatusCache } = await import('../../core/mesh.mjs');
    const res = await request(app).post('/api/mesh/enroll').send({});
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.method).toBe('preauth-key');
    // A user-triggered enroll must bypass the daemon backoff.
    expect(resetAutoEnrollThrottle).toHaveBeenCalled();
    expect(enrollThisNode).toHaveBeenCalled();
    // Fresh mesh IP must be visible immediately, not after the 2s status cache.
    expect(clearMeshStatusCache).toHaveBeenCalled();
  });

  it('POST /api/mesh/enroll surfaces failures as JSON, not a 500 crash', async () => {
    const { enrollThisNode } = await import('../../core/mesh-enroll.mjs');
    vi.mocked(enrollThisNode).mockResolvedValueOnce({
      ok: false,
      changed: false,
      state: 'needs_login',
      method: 'interactive',
      auth_url: 'https://control.example.org/register/xyz',
      reason: 'awaiting-user-approval',
      status: { state: 'needs_login', enrolled: false },
    });
    const res = await request(app).post('/api/mesh/enroll').send({});
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(false);
    expect(res.body.auth_url).toBe('https://control.example.org/register/xyz');
  });

  // The control server can say a node exists but not which account reaches it.
  // Connecting as the wrong user is refused exactly like an unreachable host,
  // so the API has to report the gap rather than leave it to be discovered.
  describe('node access', () => {
    const NODES = [
      { hostname: 'node-a.mesh', ip: '100.64.0.1', online: true, self: true, access: { ssh_user: 'operator' } },
      { hostname: 'node-b.mesh', ip: '100.64.0.2', lan_ip: '10.0.0.9', online: true, self: false },
    ];
    let restoreNodes;

    beforeEach(async () => {
      const { listEnrichedMeshNodes } = await import('../../core/mesh.mjs');
      restoreNodes = vi.mocked(listEnrichedMeshNodes).getMockImplementation();
      vi.mocked(listEnrichedMeshNodes).mockReturnValue(NODES);
    });

    afterEach(async () => {
      const { listEnrichedMeshNodes } = await import('../../core/mesh.mjs');
      vi.mocked(listEnrichedMeshNodes).mockImplementation(restoreNodes);
    });

    it('GET /api/mesh/nodes resolves how to reach each node and counts the gaps', async () => {
      const res = await request(app).get('/api/mesh/nodes');
      expect(res.status).toBe(200);
      expect(res.body.nodes[0].access_resolved).toMatchObject({
        target: 'operator@100.64.0.1',
        complete: true,
      });
      expect(res.body.nodes[1].access_resolved).toMatchObject({ complete: false, target: null });
      expect(res.body.missing_access_count).toBe(1);
    });

    it('POST /api/mesh/access records a login on the node entity', async () => {
      const { setMeshNodeAccess } = await import('../../core/mesh.mjs');
      const res = await request(app)
        .post('/api/mesh/access')
        .send({ node: 'node-b.mesh', ssh_user: 'operator', ssh_port: '2222' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(setMeshNodeAccess).toHaveBeenCalledWith(
        'node-b.mesh',
        { source: 'manual', ssh_user: 'operator', ssh_port: 2222 },
        expect.anything(),
      );
    });

    // A field sent empty clears it; a field left out is untouched. Without that
    // distinction a value could be set from the UI but never taken back.
    it('POST /api/mesh/access clears a field sent empty and leaves absent ones alone', async () => {
      const { setMeshNodeAccess } = await import('../../core/mesh.mjs');
      await request(app).post('/api/mesh/access').send({ node: 'node-b.mesh', identity_file: '' });
      expect(setMeshNodeAccess).toHaveBeenCalledWith(
        'node-b.mesh',
        { source: 'manual', identity_file: null },
        expect.anything(),
      );
    });

    it('POST /api/mesh/access rejects a port that is not a port', async () => {
      const res = await request(app)
        .post('/api/mesh/access')
        .send({ node: 'node-b.mesh', ssh_port: '99999' });
      expect(res.status).toBe(400);
      expect(res.body.message).toMatch(/1 and 65535/);
    });

    it('POST /api/mesh/access 404s a node that is not on the mesh', async () => {
      const { setMeshNodeAccess } = await import('../../core/mesh.mjs');
      vi.mocked(setMeshNodeAccess).mockResolvedValueOnce({ written: false, reason: 'node-not-found' });
      const res = await request(app).post('/api/mesh/access').send({ node: 'ghost', ssh_user: 'x' });
      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
    });

    it('GET /api/mesh/access/proposals matches ssh config blocks without writing', async () => {
      const { setMeshNodeAccess } = await import('../../core/mesh.mjs');
      const res = await request(app).get('/api/mesh/access/proposals');
      expect(res.status).toBe(200);
      expect(res.body.proposals).toEqual([
        expect.objectContaining({
          hostname: 'node-b.mesh',
          matched_host: 'node-b',
          access: expect.objectContaining({ ssh_user: 'operator', source: 'ssh_config' }),
        }),
      ]);
      expect(res.body.missing_access).toEqual(['node-b.mesh']);
      expect(setMeshNodeAccess).not.toHaveBeenCalled();
    });

    // A config HostName is a LAN address — correct only from the machine that
    // wrote it. Importing it would replace a portable answer with a fragile one.
    it('GET /api/mesh/access/proposals never proposes the config address', async () => {
      const res = await request(app).get('/api/mesh/access/proposals');
      expect(res.body.proposals[0].access.ssh_host).toBeUndefined();
    });

    it('POST /api/mesh/access/import reports a failed write instead of counting it', async () => {
      const { setMeshNodeAccess } = await import('../../core/mesh.mjs');
      vi.mocked(setMeshNodeAccess).mockResolvedValueOnce({ written: false, reason: 'rejected' });
      const res = await request(app).post('/api/mesh/access/import').send({});
      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ success: false, attempted: 1, saved: 0, failed: 1 });
      expect(res.body.results[0]).toMatchObject({ hostname: 'node-b.mesh', written: false, reason: 'rejected' });
    });

    it('POST /api/mesh/access/import writes every proposal it reported', async () => {
      const { setMeshNodeAccess } = await import('../../core/mesh.mjs');
      const res = await request(app).post('/api/mesh/access/import').send({});
      expect(res.body).toMatchObject({ success: true, attempted: 1, saved: 1, failed: 0 });
      expect(setMeshNodeAccess).toHaveBeenCalledWith(
        'node-b.mesh',
        expect.objectContaining({ ssh_user: 'operator', source: 'ssh_config' }),
        expect.anything(),
      );
    });
  });
});

