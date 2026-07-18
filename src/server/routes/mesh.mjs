import { Router } from 'express';
import { requireAuth, requireScope } from '../auth.mjs';
import { getLeaderInfo, isLeader } from '../../core/leader-election.mjs';
import {
  clearMeshStatusCache,
  getMeshPeers,
  getMeshHostname,
  listEnrichedMeshNodes,
  listMeshNodeEntities,
  attachSelfInterfaces,
  normalizeHostname,
} from '../../core/mesh.mjs';
import { throttledFetch } from '../../core/throttled-fetch.mjs';
import { defaultVaultRoot } from '../../core/vfs-documents.mjs';
import {
  listLocalInterfaces,
  summarizeInterfacesForEntity,
} from '../../core/network-interfaces.mjs';
import { discoverLanSnapshot, registerLanMeshNodes } from '../../core/lan-discovery.mjs';
import { detectDeviceIo, mergeIoProfiles, uiHintsFromIo } from '../../core/device-io.mjs';

const router = Router();

function meshServerPort() {
  const value = Number(process.env.TR_SERVER_PORT || process.env.PORT || 3000);
  return Number.isInteger(value) && value > 0 && value <= 65535 ? value : 3000;
}

function meshPeerUrl(ip, route) {
  return `http://${ip}:${meshServerPort()}${route}`;
}

router.get('/api/mesh/leader', requireAuth, requireScope('config:read'), async (req, res) => {
  const leaderInfo = await getLeaderInfo();
  const leader = await isLeader();
  res.json({
    leader: leaderInfo,
    is_current_node_leader: leader
  });
});

/**
 * Live peers merged with vault mesh_node entity variables (role, labels, notes, …).
 * Device detail is entity data — not product hardcoding.
 * Self node includes live interface kinds (wifi/ethernet/vpn_overlay/…).
 */
router.get('/api/mesh/nodes', requireAuth, requireScope('config:read'), async (req, res) => {
  const vaultRoot = defaultVaultRoot();
  let nodes = listEnrichedMeshNodes(vaultRoot);
  try {
    nodes = attachSelfInterfaces(nodes, summarizeInterfacesForEntity());
  } catch {
    // interfaces optional
  }
  // Attach live I/O profile to self (merge vault entity overrides).
  try {
    const liveIo = detectDeviceIo();
    nodes = nodes.map((n) => {
      if (!n.self) return n;
      const io = mergeIoProfiles(liveIo, n.io || null);
      return { ...n, io, ui_hints: io.ui_hints || uiHintsFromIo(io) };
    });
  } catch {
    // io optional
  }
  const entities = listMeshNodeEntities(vaultRoot);
  res.json({
    nodes,
    entity_count: entities.length,
  });
});

/**
 * This host's I/O capability profile for agent UI generation
 * (screen, touch, mic, speaker, keyboard, camera, headless, …).
 */
router.get('/api/mesh/io', requireAuth, requireScope('config:read'), async (_req, res) => {
  try {
    const live = detectDeviceIo();
    const entities = listMeshNodeEntities(defaultVaultRoot());
    const selfHost = normalizeHostname(getMeshHostname());
    const ent = entities.find(
      (e) => normalizeHostname(e.hostname) === selfHost,
    );
    const io = mergeIoProfiles(live, ent?.io || null);
    res.json({
      io,
      ui_hints: io.ui_hints || uiHintsFromIo(io),
      entity_path: ent?.vfs_path || null,
      measured_at: io.measured_at,
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message || 'I/O detection failed' });
  }
});

/**
 * Local NIC inventory with classified interface kinds.
 */
router.get('/api/mesh/interfaces', requireAuth, requireScope('config:read'), async (_req, res) => {
  const interfaces = listLocalInterfaces();
  res.json({
    interfaces,
    summary: summarizeInterfacesForEntity(interfaces),
    measured_at: new Date().toISOString(),
  });
});

/**
 * Discover LAN hosts (ARP/neighbor table) and probe TR /health on LAN IPs.
 * Query: ?probe=0 to skip health probes.
 */
router.get('/api/mesh/lan', requireAuth, requireScope('config:read'), async (req, res) => {
  const probe = String(req.query?.probe ?? '1') !== '0';
  try {
    const snapshot = await discoverLanSnapshot({
      probe,
      port: meshServerPort(),
      throttledFetch,
      maxProbes: Number(req.query?.limit) || 32,
    });
    res.json(snapshot);
  } catch (err) {
    res.status(500).json({ success: false, message: err.message || 'LAN discovery failed' });
  }
});

/**
 * Discover LAN TR-reachable hosts and upsert mesh_node entities (SSSS).
 * Body optional: { probe?: boolean, limit?: number }
 * Does not hardcode device names — hostname = lan-<ip-dashes> unless entity exists.
 */
router.post('/api/mesh/lan/register', requireAuth, requireScope('config:write'), async (req, res) => {
  const probe = req.body?.probe !== false;
  const limit = Number(req.body?.limit) || 32;
  try {
    const snapshot = await discoverLanSnapshot({
      probe,
      port: meshServerPort(),
      throttledFetch,
      maxProbes: limit,
    });
    const registration = await registerLanMeshNodes(snapshot.hosts, {
      vaultRoot: defaultVaultRoot(),
      onlyReachable: true,
    });
    res.json({
      success: true,
      discovery: {
        host_count: snapshot.host_count,
        tr_reachable_count: snapshot.tr_reachable_count,
        discovered_at: snapshot.discovered_at,
      },
      registration,
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message || 'LAN register failed' });
  }
});

router.post('/api/mesh/election/refresh', requireAuth, requireScope('config:write'), async (_req, res) => {
  clearMeshStatusCache();
  res.json({
    leader: await getLeaderInfo(),
    is_current_node_leader: await isLeader(),
  });
});

/**
 * Measure RTT from this node to each peer's /health via the fetch gate
 * (proper authenticated API path — never browser no-cors).
 */
router.get('/api/mesh/latency', requireAuth, requireScope('config:read'), async (_req, res) => {
  const peers = getMeshPeers({ includeSelf: true });
  const port = meshServerPort();
  const latency_ms = {};
  const results = [];

  for (const peer of peers) {
    if (peer.self) {
      latency_ms[peer.hostname] = 0;
      results.push({ hostname: peer.hostname, ip: peer.ip, latency_ms: 0, self: true, ok: true });
      continue;
    }
    if (!peer.ip || !peer.online) {
      latency_ms[peer.hostname] = null;
      results.push({ hostname: peer.hostname, ip: peer.ip, latency_ms: null, self: false, ok: false, error: 'offline' });
      continue;
    }
    const start = Date.now();
    try {
      const response = await throttledFetch(meshPeerUrl(peer.ip, '/health'), {}, 3000);
      const ms = Date.now() - start;
      const ok = response.ok || response.status === 200;
      latency_ms[peer.hostname] = ok ? ms : null;
      results.push({ hostname: peer.hostname, ip: peer.ip, latency_ms: ok ? ms : null, self: false, ok, status: response.status });
    } catch (err) {
      latency_ms[peer.hostname] = null;
      results.push({
        hostname: peer.hostname,
        ip: peer.ip,
        latency_ms: null,
        self: false,
        ok: false,
        error: err.message || 'unreachable',
      });
    }
  }

  res.json({ latency_ms, results, port, measured_at: new Date().toISOString() });
});

export default router;
