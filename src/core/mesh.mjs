import { spawnSync } from 'node:child_process';

const CACHE_MS = 2_000;
let cachedStatus = null;
let cachedAt = 0;

function readMeshStatus() {
  if (cachedStatus && Date.now() - cachedAt < CACHE_MS) return cachedStatus;
  const result = spawnSync('tailscale', ['status', '--json'], {
    encoding: 'utf8',
    timeout: 2_000,
    stdio: ['ignore', 'pipe', 'ignore'],
  });
  if (result.status !== 0 || !result.stdout) return null;
  try {
    cachedStatus = JSON.parse(result.stdout);
    cachedAt = Date.now();
    return cachedStatus;
  } catch {
    return null;
  }
}

/**
 * Strip MagicDNS trailing dots so self/peer hostname forms match.
 * Exported for unit tests and any caller that compares hostnames.
 */
export function normalizeHostname(value) {
  if (value == null || value === '') return null;
  return String(value).replace(/\.$/, '') || null;
}

function normalizeNode(node, self = false) {
  return {
    hostname: normalizeHostname(node?.DNSName) || node?.HostName || null,
    ip: node?.TailscaleIPs?.[0] || null,
    online: self ? true : !!node?.Online,
    self,
    os: node?.OS || null,
  };
}

export function clearMeshStatusCache() {
  cachedStatus = null;
  cachedAt = 0;
}

export function isMeshAvailable() {
  return !!readMeshStatus()?.Self;
}

export function getMeshSelf() {
  const self = readMeshStatus()?.Self;
  return self ? normalizeNode(self, true) : null;
}

export function getMeshIp() {
  return getMeshSelf()?.ip || null;
}

export function getMeshHostname() {
  return getMeshSelf()?.hostname || null;
}

export function getMeshPeers({ includeSelf = false } = {}) {
  const status = readMeshStatus();
  if (!status) return [];
  const peers = Object.values(status.Peer || {}).map((peer) => normalizeNode(peer));
  if (includeSelf && status.Self) peers.push(normalizeNode(status.Self, true));
  return peers.filter((peer) => peer.hostname && peer.ip);
}

/**
 * Mesh membership is derived from the control plane. Heartbeat VFS files were
 * node-local and could never coordinate multiple machines, so this hook now
 * returns the live self record without pretending to mutate shared state.
 */
export async function patchOwnMeshNode() {
  return getMeshSelf();
}
