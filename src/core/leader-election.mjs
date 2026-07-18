import { getMeshPeers, getMeshSelf } from './mesh.mjs';

/**
 * Deterministic lowest-mesh-IP leader election.
 *
 * Design notes (NETWORK_SECURITY_COMPLETION Phase 2):
 * - No node-local lease documents. tryAcquire/renew/release are compatibility
 *   shims that re-evaluate the same pure function as isLeader().
 * - Failover bound (analytical): mesh status cache TTL (2s in mesh.mjs) +
 *   daemon follower tick (TASK_SLEEP_MS = 10s) ⇒ a follower observes an
 *   offline former leader and flips isLeader() within ~12s under normal load.
 *   Kill-leader acceptance (Phase 4) should measure wall-clock against this bound.
 * - Hysteresis / min-tenure: REJECTED. Sticky tenure would delay legitimate
 *   failovers when the true lowest-IP node returns or the leader drops offline.
 *   Tailscale Online is control-plane mediated; we have not observed pathological
 *   online-bit flapping on mesh nodes. Prefer fast deterministic re-evaluation.
 */

/** Documented upper bound for isLeader() flip after the prior leader goes offline. */
export const FAILOVER_BOUND_MS = 12_000;

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

/**
 * True when this node's mesh IP is the elected leader IP.
 * Hostname is a sort tie-break only (see compareNodes); leadership identity is IP.
 * mesh.normalizeNode already strips MagicDNS trailing dots on DNSName.
 */
export async function isLeader() {
  const self = getMeshSelf();
  const leader = await getLeaderInfo();
  if (!self?.ip || !leader?.ip) return false;
  return self.ip === leader.ip;
}

/** @deprecated Compatibility shim — re-evaluates isLeader(); no lease is written. */
export async function tryAcquireLease() {
  return isLeader();
}

/** @deprecated Compatibility shim — re-evaluates isLeader(); no lease is written. */
export async function renewLease() {
  return isLeader();
}

/** @deprecated Compatibility shim — no lease state to clear. */
export async function releaseLease() {
  return true;
}
