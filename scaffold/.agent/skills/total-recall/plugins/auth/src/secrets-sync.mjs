import fs from 'node:fs';
import crypto from 'node:crypto';
import { getLeaderInfo, isLeader } from './leader-election.mjs';
import { logger } from './logger.mjs';
import { brainDir } from './config.mjs';
import { resolveSecretsPath, loadSecrets, saveSecrets, ensureMeta, appendAudit, META_KEY } from './secrets-store.mjs';
import { projectGithubLogin } from './login-projections.mjs';

const REQUEST_TIMEOUT_MS = 10_000;
const FETCH_CONCURRENCY = 8;

function serverPort() {
  const value = Number(process.env.TR_SERVER_PORT || process.env.PORT || 3000);
  return Number.isInteger(value) && value > 0 && value <= 65535 ? value : 3000;
}

function meshUrl(ip, route, port = serverPort()) {
  const octets = String(ip || '').split('.').map(Number);
  if (octets.length !== 4 || octets.some((part) => !Number.isInteger(part) || part < 0 || part > 255) || octets[0] !== 100 || octets[1] < 64 || octets[1] > 127) {
    throw new Error('Leader IP is outside the Tailscale CGNAT range');
  }
  return `http://${ip}:${port}${route}`;
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
export async function syncGrantedSecrets(leaderIp, { dir = brainDir, fetchImpl = fetch, port } = {}) {
  // The leader's port, never this node's: the droplet serves on 3900 while devices
  // default to 3000, and assuming our own port made every sync fail.
  const base = meshUrl(leaderIp, '/api/secrets/mesh', port || serverPort());
  let listResponse;
  try {
    listResponse = await fetchImpl(base, { signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
  } catch (err) {
    // "fetch failed" alone named neither the address nor the reason.
    throw new Error(`No Total Recall server answered at ${base}: ${err.cause?.code || err.message}`);
  }
  if (!listResponse.ok) throw new Error(`Leader returned ${listResponse.status}`);
  const { keys } = await listResponse.json();
  if (!Array.isArray(keys)) throw new Error('Invalid grant list');

  // Each key costs the leader a store decryption plus a mesh round trip (2-3 s from a laptop),
  // so a few at a time keeps a full sync under a minute instead of several.
  const fetched = {};
  let next = 0;
  const worker = async () => {
    while (next < keys.length) {
      const key = keys[next++];
      const response = await fetchImpl(`${base}/${encodeURIComponent(key)}`, { signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
      if (!response.ok) throw new Error(`Leader returned ${response.status} for ${key}`);
      fetched[key] = (await response.json()).value;
    }
  };
  await Promise.all(Array.from({ length: Math.min(FETCH_CONCURRENCY, keys.length) }, worker));

  const secrets = ensureMeta(await loadSecrets(dir));
  // Only keys this sync created may be removed when their grant is revoked. A key the node
  // already held before it was ever granted is the node's own: revoking the grant must not
  // delete it (on the node that owns the full store, that would wipe its secrets).
  const previouslySynced = Array.isArray(secrets[META_KEY].mesh_synced) ? secrets[META_KEY].mesh_synced : [];
  const created = Object.keys(fetched).filter((key) => !(key in secrets));
  const removed = previouslySynced.filter((key) => !(key in fetched) && key in secrets);
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
  secrets[META_KEY].mesh_synced = [...new Set([...previouslySynced.filter((key) => key in fetched), ...created])];
  await saveSecrets(dir, secrets);
  appendAudit(dir, { action: 'mesh_grant_sync', key: `(${keys.length} granted, ${removed.length} revoked)`, actor: 'mesh-sync' });
  return { granted: keys.length, updated, removed: removed.length };
}

/** Sign in the tools that use synced secrets (today: gh from github_token). */
export async function projectLogins({ dir = brainDir, run } = {}) {
  const secrets = await loadSecrets(dir);
  const github = await projectGithubLogin({ token: secrets.github_token || secrets.GITHUB_TOKEN, run });
  if (github.status === 'logged-in') appendAudit(dir, { action: 'login_projection', key: 'github_token -> gh', actor: 'mesh-sync' });
  if (github.status === 'failed') logger.error('secrets-sync', 'gh login from github_token failed', { error: github.error });
  return { github };
}

export async function syncLoop() {
  secretsSyncMode();
  if (!(await isLeader())) {
    const leaderInfo = await getLeaderInfo();
    if (leaderInfo?.ip) {
      try { await syncGrantedSecrets(leaderInfo.ip, { port: leaderInfo.port }); }
      catch (err) { logger.error('secrets-sync', 'Failed to sync granted secrets', { error: err.message }); }
    }
  }
  // Even when the leader is unreachable, the last synced token should still be signed in.
  try { await projectLogins(); }
  catch (err) { logger.error('secrets-sync', 'Login projection failed', { error: err.message }); }
}
