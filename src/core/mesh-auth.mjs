import crypto from 'node:crypto';
import net from 'node:net';
import { brainDir } from './config.mjs';
import { getSecret } from './secrets-store.mjs';

export function normalizeRemoteAddress(value) {
  const address = String(value || '').trim();
  if (address.startsWith('::ffff:')) return address.slice(7);
  return address;
}

export function isMeshOrLoopbackAddress(value) {
  const address = normalizeRemoteAddress(value);
  if (address === '::1' || address === '127.0.0.1') return true;
  if (net.isIP(address) !== 4) return false;
  const octets = address.split('.').map(Number);
  return octets[0] === 100 && octets[1] >= 64 && octets[1] <= 127;
}

export async function getMeshSyncToken() {
  const result = await getSecret(brainDir, 'TR_MESH_SYNC_TOKEN', {
    action: 'use',
    actor: 'mesh-sync-auth',
  });
  return result.found && result.value ? result.value : null;
}

export async function getMeshSyncAuthorization() {
  const token = await getMeshSyncToken();
  if (!token) throw new Error('TR_MESH_SYNC_TOKEN is not configured');
  return `Bearer ${token}`;
}

function safeEqual(a, b) {
  const left = Buffer.from(String(a || ''));
  const right = Buffer.from(String(b || ''));
  return left.length === right.length && crypto.timingSafeEqual(left, right);
}

export async function requireMeshSyncAuth(req, res, next) {
  const remote = req.socket?.remoteAddress || req.ip;
  if (!isMeshOrLoopbackAddress(remote)) {
    return res.status(403).json({ error: 'Mesh source address required' });
  }
  const expected = await getMeshSyncToken();
  if (!expected) return res.status(503).json({ error: 'Mesh sync is not configured' });
  const supplied = String(req.headers?.authorization || '').replace(/^Bearer\s+/i, '');
  if (!safeEqual(supplied, expected)) return res.status(401).json({ error: 'Invalid mesh sync credential' });
  return next();
}
