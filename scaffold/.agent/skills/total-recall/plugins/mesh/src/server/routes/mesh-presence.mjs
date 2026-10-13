import { Router } from 'express';
import { requireAuth, requireScope } from '../auth.mjs';
import { requireMeshSyncAuth } from '../../core/mesh-auth.mjs';
import { getLocalPresence, resolveActiveDevice } from '../../core/mesh-activity.mjs';
import { getMeshPresence, dispatchMesh } from '../../core/presence.mjs';
const router = Router();
router.get('/api/mesh/presence', requireAuth, requireScope('config:read'), async (req, res) => {
  try { res.json(await getMeshPresence({ includePeers: req.query.peers !== 'false' })); }
  catch { res.status(503).json({ success: false, error: 'Mesh presence is unavailable' }); }
});
router.get('/api/mesh/presence/local', requireMeshSyncAuth, (_req, res) => res.json(getLocalPresence()));
router.post('/api/mesh/presence/resolve', requireAuth, requireScope('config:read'), (req, res) => {
  if (!Array.isArray(req.body?.presence_records) || req.body.presence_records.length > 1000) return res.status(400).json({ success: false, error: 'A bounded presence array is required' });
  res.json({ success: true, active_device: resolveActiveDevice(req.body.presence_records) });
});
router.post('/api/mesh/dispatch', requireAuth, requireScope('config:write'), async (req, res) => {
  try { const result = await dispatchMesh(req.body); res.status(result.success ? 200 : 502).json(result); }
  catch (error) { res.status(400).json({ success: false, dispatched: false, error: error.message }); }
});
export default router;
