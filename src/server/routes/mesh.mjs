import { Router } from 'express';
import { requireAuth } from '../auth.mjs';
import { getLeaderInfo, isLeader } from '../../core/leader-election.mjs';
import { getMeshPeers } from '../../core/mesh.mjs';

const router = Router();

router.get('/leader', requireAuth, async (req, res) => {
  const leaderInfo = await getLeaderInfo();
  const leader = await isLeader();
  res.json({
    leader: leaderInfo,
    is_current_node_leader: leader
  });
});

router.get('/nodes', requireAuth, async (req, res) => {
  const peers = getMeshPeers();
  res.json({
    nodes: peers
  });
});

export default router;
