import { getMeshPeers, getMeshSelf } from './mesh.mjs';

function compareNodes(a, b) {
  const ipOrder = String(a.ip || '').localeCompare(String(b.ip || ''), undefined, { numeric: true });
  return ipOrder || String(a.hostname || '').localeCompare(String(b.hostname || ''));
}

/**
 * Deterministic leader selection avoids the previous split-brain design where
 * each node wrote a private, node-local lease document and could elect itself.
 */
export async function getLeaderInfo() {
  const nodes = getMeshPeers({ includeSelf: true }).filter((node) => node.online);
  if (nodes.length === 0) return null;
  const leader = [...nodes].sort(compareNodes)[0];
  return { hostname: leader.hostname, ip: leader.ip, strategy: 'lowest-mesh-ip' };
}

export async function isLeader() {
  const self = getMeshSelf();
  const leader = await getLeaderInfo();
  return !!self && !!leader && self.ip === leader.ip && self.hostname === leader.hostname;
}

export async function tryAcquireLease() {
  return isLeader();
}

export async function renewLease() {
  return isLeader();
}

export async function releaseLease() {
  return true;
}
