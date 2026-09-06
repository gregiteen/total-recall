import { Router } from 'express';
import { requireAuth, requireScope, requireAuthOrLocal } from '../auth.mjs';
import { getLocalPresence, resolveActiveDevice } from '../../core/mesh-activity.mjs';
import { getMeshPeers, execMeshCommand } from '../../core/mesh.mjs';
import { throttledFetch } from '../../core/throttled-fetch.mjs';
import { serverError, badRequest } from './_shared.mjs';

const router = Router();

function meshServerPort() {
  const value = Number(process.env.TR_SERVER_PORT || process.env.PORT || 3000);
  return Number.isInteger(value) && value > 0 && value <= 65535 ? value : 3000;
}

/**
 * GET /api/mesh/presence
 * Reports the presence state across the mesh, highlighting the user's active device.
 */
router.get('/api/mesh/presence', requireAuth, requireScope('config:read'), async (req, res) => {
  try {
    const local = getLocalPresence();
    const includePeers = req.query?.peers !== 'false';
    const peers = [];

    if (includePeers) {
      const meshPeers = getMeshPeers({ includeSelf: false }) || [];
      const port = meshServerPort();

      const peerPromises = meshPeers
        .filter((p) => p && p.online && p.ip)
        .map(async (p) => {
          try {
            const peerRes = await throttledFetch(
              `http://${p.ip}:${port}/api/mesh/presence/local`,
              {},
              1500
            );
            if (peerRes && (peerRes.ok || peerRes.status === 200)) {
              return await peerRes.json();
            }
          } catch {
            // Peer unreachable or offline
          }
          return {
            node_id: p.hostname,
            mesh_ip: p.ip,
            user_active: false,
            idle_seconds: 999999,
            active_surface: 'offline',
            timestamp: new Date().toISOString()
          };
        });

      const resolved = await Promise.all(peerPromises);
      peers.push(...resolved.filter(Boolean));
    }

    const allRecords = [local, ...peers];
    const activeDevice = resolveActiveDevice(allRecords);

    res.json({
      success: true,
      local,
      peers,
      active_device: activeDevice,
      active_surface: local.active_surface,
      timestamp: new Date().toISOString()
    });
  } catch (err) {
    serverError(res, err);
  }
});

/**
 * GET /api/mesh/presence/local
 * Lightweight unauthenticated/mesh-only endpoint for peer heartbeat polling.
 */
router.get('/api/mesh/presence/local', requireAuthOrLocal, (_req, res) => {
  try {
    const local = getLocalPresence();
    res.json(local);
  } catch (err) {
    serverError(res, err);
  }
});

/**
 * POST /api/mesh/presence/resolve
 * Evaluates arbitrary presence records to determine the user's currently active device.
 * Body: { presence_records: [...] }
 */
router.post('/api/mesh/presence/resolve', requireAuth, requireScope('config:read'), (req, res) => {
  try {
    const records = Array.isArray(req.body?.presence_records) ? req.body.presence_records : [];
    const active = resolveActiveDevice(records);
    res.json({
      success: true,
      active_device: active,
      timestamp: new Date().toISOString()
    });
  } catch (err) {
    serverError(res, err);
  }
});

/**
 * POST /api/mesh/dispatch
 * Follow the User dynamic dispatch: routes notifications or commands to the most active node.
 * Body: { notification?: string, command?: string, target?: string, payload?: any }
 */
router.post('/api/mesh/dispatch', requireAuth, requireScope('config:write'), async (req, res) => {
  try {
    const local = getLocalPresence();
    let targetNode = req.body?.target;

    if (!targetNode) {
      const active = resolveActiveDevice([local]);
      targetNode = active.node_id;
    }

    const isLocal = targetNode === local.node_id || targetNode === 'local';
    let executionResult = null;

    if (!isLocal && req.body?.command) {
      executionResult = await execMeshCommand(targetNode, req.body.command);
    }

    res.json({
      success: true,
      dispatched: true,
      target_node: targetNode,
      is_local: isLocal,
      command_result: executionResult,
      notification: req.body?.notification || null,
      payload: req.body?.payload || null,
      timestamp: new Date().toISOString()
    });
  } catch (err) {
    serverError(res, err);
  }
});

export default router;
