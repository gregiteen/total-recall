/**
 * bound-hosts — what the server ACTUALLY bound, as opposed to what it hoped to.
 *
 * The pairing card renders a QR code of the URL it believes a phone can reach.
 * It used to work that URL out by derivation: loopback, plus whatever
 * `getMeshIp()` reported at the moment the card was opened. That derivation is
 * wrong on any machine where the mesh came up AFTER the brain did.
 *
 * The Mac Mini is the worked example. Its brain started 2026-08-13 while
 * Tailscale was still starting, so `getMeshIp()` returned null and the bind
 * fell back to loopback only. A week later Tailscale answers perfectly, so the
 * card derived `listen_hosts = [127.0.0.1, 100.64.0.2]`, recommended the mesh
 * URL, and drew a QR for an address nothing has ever listened on -- while
 * reporting no warning, because every check downstream was reading the guess.
 *
 * A socket knows its own address. Registering each successful listen here means
 * the card reports observed truth, and "no other device can reach this brain"
 * becomes something the UI can state instead of something the user discovers.
 */

/** @type {Set<string>} */
const bound = new Set();

const LOOPBACK = new Set(['127.0.0.1', '::1', 'localhost']);

/** Record an address the server has successfully bound. */
export function registerBoundHost(host) {
  if (host === null || host === undefined || host === '') return;
  bound.add(String(host));
}

/** Forget an address (a listener closed, or a late bind was replaced). */
export function unregisterBoundHost(host) {
  bound.delete(String(host));
}

/** Every address currently listening. Order is insertion order. */
export function getBoundHosts() {
  return [...bound];
}

/** Test seam — module state is process-wide by design. */
export function resetBoundHosts() {
  bound.clear();
}

export function isLoopbackHost(host) {
  return LOOPBACK.has(String(host));
}

/**
 * Is this brain reachable from any device other than the one it runs on?
 *
 * `0.0.0.0` / `::` count as reachable: they accept from every interface.
 * An empty set means nothing has registered yet -- unknown, not unreachable,
 * so callers must not render that as a failure.
 *
 * @returns {boolean|null} null when nothing is known yet
 */
export function isReachableFromOtherDevices() {
  const hosts = getBoundHosts();
  if (!hosts.length) return null;
  return hosts.some((h) => !isLoopbackHost(h));
}
