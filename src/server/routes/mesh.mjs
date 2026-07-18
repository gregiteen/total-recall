import { Router } from 'express';
import { requireAuth, requireScope } from '../auth.mjs';
import { getLeaderInfo, isLeader } from '../../core/leader-election.mjs';
import { clearMeshStatusCache, getMeshPeers } from '../../core/mesh.mjs';
import { throttledFetch } from '../../core/throttled-fetch.mjs';

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

router.get('/api/mesh/nodes', requireAuth, requireScope('config:read'), async (req, res) => {
  const peers = getMeshPeers({ includeSelf: true });
  res.json({
    nodes: peers
  });
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
