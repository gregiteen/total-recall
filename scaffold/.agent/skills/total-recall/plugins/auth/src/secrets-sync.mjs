import fs from 'node:fs';
import crypto from 'node:crypto';
import { getLeaderInfo, isLeader } from './leader-election.mjs';
import { logger } from './logger.mjs';
import { brainDir } from './config.mjs';
import { resolveSecretsPath, loadSecrets, saveSecrets, ensureMeta, appendAudit, META_KEY } from './secrets-store.mjs';

const REQUEST_TIMEOUT_MS = 10_000;

function serverPort() {
  const value = Number(process.env.TR_SERVER_PORT || process.env.PORT || 3000);
  return Number.isInteger(value) && value > 0 && value <= 65535 ? value : 3000;
}

function meshUrl(ip, route) {
  const octets = String(ip || '').split('.').map(Number);
  if (octets.length !== 4 || octets.some((part) => !Number.isInteger(part) || part < 0 || part > 255) || octets[0] !== 100 || octets[1] < 64 || octets[1] > 127) {
    throw new Error('Leader IP is outside the Tailscale CGNAT range');
  }
  return `http://${ip}:${serverPort()}${route}`;
}

export function getSecretsChecksum() {
  const filePath = resolveSecretsPath(brainDir);
  if (!fs.existsSync(filePath)) return null;
  return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

export function secretsSyncMode(env = process.env) {
  if (env.TR_SECRETS_SYNC_MODE && env.TR_SECRETS_SYNC_MODE !== 'mesh-identity') throw new Error('Only explicit mesh identity grants are supported');
  return 'mesh-identity';
}

/**
 * Grant-based sync: ask the leader which keys this machine may read, fetch
 * only those, and merge them into this node's own encrypted store. Keys that
 * were granted before and are no longer listed are removed (revocation); that
 * only happens after a successful list, so an unreachable leader never wipes
 * anything. The node's store is never replaced wholesale and the node keeps
 * its own master password.
 */
export async function syncGrantedSecrets(leaderIp, { dir = brainDir, fetchImpl = fetch } = {}) {
  const base = meshUrl(leaderIp, '/api/secrets/mesh');
  const listResponse = await fetchImpl(base, { signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
  if (!listResponse.ok) throw new Error(`Leader returned ${listResponse.status}`);
  const { keys } = await listResponse.json();
  if (!Array.isArray(keys)) throw new Error('Invalid grant list');

  const fetched = {};
  for (const key of keys) {
    const response = await fetchImpl(`${base}/${encodeURIComponent(key)}`, { signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
    if (!response.ok) throw new Error(`Leader returned ${response.status} for ${key}`);
    fetched[key] = (await response.json()).value;
  }

  const secrets = ensureMeta(await loadSecrets(dir));
  const previous = Array.isArray(secrets[META_KEY].mesh_granted) ? secrets[META_KEY].mesh_granted : [];
  const removed = previous.filter((key) => !(key in fetched) && key in secrets);
  for (const key of removed) {
    delete secrets[key];
    delete secrets[META_KEY].keys?.[key];
  }
  let updated = 0;
  for (const [key, value] of Object.entries(fetched)) {
    if (secrets[key] !== value) updated += 1;
    secrets[key] = value;
  }
  secrets[META_KEY].mesh_granted = Object.keys(fetched);
  await saveSecrets(dir, secrets);
  appendAudit(dir, { action: 'mesh_grant_sync', key: `(${keys.length} granted, ${removed.length} revoked)`, actor: 'mesh-sync' });
  return { granted: keys.length, updated, removed: removed.length };
}

export async function syncLoop() {
  secretsSyncMode();
  if (await isLeader()) return;
  const leaderInfo = await getLeaderInfo();
  if (!leaderInfo?.ip) return;
  try { await syncGrantedSecrets(leaderInfo.ip); }
  catch (err) { logger.error('secrets-sync', 'Failed to sync granted secrets', { error: err.message }); }
}
