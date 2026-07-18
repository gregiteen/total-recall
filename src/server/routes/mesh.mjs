import { Router } from 'express';
import { requireAuth, requireScope } from '../auth.mjs';
import { getLeaderInfo, isLeader } from '../../core/leader-election.mjs';
import { clearMeshStatusCache, getMeshPeers } from '../../core/mesh.mjs';

const router = Router();

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

export default router;
