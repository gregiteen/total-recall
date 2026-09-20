import fs from 'node:fs';
import path from 'node:path';
import { getMeshPeers, getMeshSelf } from './mesh.mjs';
import { brainDir } from './config.mjs';

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

/**
 * Operator pin for which node leads.
 *
 * Lowest-online-IP is deterministic, but it says nothing about whether that node
 * can actually run the daemon. On this mesh the shared droplet holds the lowest
 * IP (100.64.0.1) and runs no Total Recall at all — it captured leadership
 * permanently, so it could never serve `/api/secrets/sync` and every other node
 * idled as a follower: no research, no dream cycle, no surface recompile,
 * anywhere. Followers skip the task loop entirely, so "lowest IP" quietly became
 * "nobody works".
 *
 * Set `TR_LEADER_IP` to the mesh IP of the machine that owns the canonical brain
 * on EVERY node that runs Total Recall, so they all agree on the answer. A node
 * whose own IP is not the pin never leads. When the pinned node is offline nobody
 * leads — fail-closed, which is the right default for an explicit operator
 * choice, and far better than electing a leader that cannot do the work.
 */
export function leaderPin(brain = brainDir) {
  const raw = String(process.env.TR_LEADER_IP || '').trim();
  if (raw) return raw;

  // File fallback. The env var only exists when the supervisor supplies it:
  // `total-recall daemon start` from a plain shell has no TR_LEADER_IP, so the
  // pin silently disappeared and the node became a follower of the lowest-IP
  // peer — the droplet, which runs no Total Recall. That is the exact
  // "lowest IP quietly became nobody works" outage this pin was added to fix,
  // and it is invisible: the daemon starts, looks healthy, and does nothing.
  try {
    const file = path.join(brain, 'config', 'leader.json');
    if (!fs.existsSync(file)) return null;
    const parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
    const ip = String(parsed?.leaderIp || '').trim();
    return ip || null;
  } catch {
    return null;
  }
}

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

  const pin = leaderPin();
  if (pin) {
    const pinned = nodes.find((node) => node.ip === pin);
    if (!pinned) return null;
    return { hostname: pinned.hostname, ip: pinned.ip, strategy: 'pinned-mesh-ip' };
  }

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
