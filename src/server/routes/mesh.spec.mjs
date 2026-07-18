import { describe, it, expect, vi, beforeEach } from 'vitest';
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
  };
});

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
});

