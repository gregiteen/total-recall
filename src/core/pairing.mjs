/**
 * Mobile pairing endpoints — reachable URLs for QR codes.
 * Never hardcodes personal hostnames; derives from live interfaces + server port.
 *
 * `listenHosts` MUST be the addresses the server actually bound. This used to be
 * derived as "loopback plus whatever getMeshIp() says right now", which is a
 * guess that silently fabricates a binding: a brain that lost the boot race
 * against the mesh client is listening on loopback alone, yet the derivation
 * claimed the mesh address too. The card then recommended that address and drew
 * a QR code for it, with no warning, because every reachability check below
 * reads these hosts. One machine served that dead QR for a week.
 *
 * When the caller cannot observe the real bindings the result is still returned,
 * but flagged `listen_hosts_source: 'derived'` and `reachable_from_other_devices:
 * null` — unknown, which the UI must not render as working.
 */
import { listLocalInterfaces, isLanIpv4, isOverlayIpv4 } from './network-interfaces.mjs';
import { getMeshIp } from './mesh.mjs';

/**
 * @param {{
 *   port?: number,
 *   protocol?: 'http'|'https',
 *   listInterfaces?: () => Array,
 *   meshIp?: string|null,
 *   listenHosts?: string[],
 * }} [opts]
 */
export function buildPairingInfo(opts = {}) {
  const port = Number(opts.port || process.env.TR_SERVER_PORT || process.env.PORT || 3000);
  const protocol = opts.protocol === 'https' ? 'https' : 'http';
  const interfaces = typeof opts.listInterfaces === 'function'
    ? opts.listInterfaces()
    : listLocalInterfaces();
  const meshIp = opts.meshIp !== undefined ? opts.meshIp : getMeshIp();
  const observedHosts = Array.isArray(opts.listenHosts) && opts.listenHosts.length > 0;
  const listenHosts = observedHosts ? opts.listenHosts : deriveListenHosts();
  const listenHostsSource = observedHosts ? 'actual' : 'derived';

  /** @type {Array<{ kind: string, label: string, ip: string, url: string, interface?: string, recommended: boolean, reachable_hint: string }>} */
  const endpoints = [];
  const seen = new Set();

  const add = (kind, label, ip, ifaceName, recommended, hint) => {
    if (!ip || seen.has(ip)) return;
    seen.add(ip);
    const hostPart = ip.includes(':') ? `[${ip}]` : ip;
    endpoints.push({
      kind,
      label,
      ip,
      url: `${protocol}://${hostPart}:${port}`,
      interface: ifaceName || null,
      recommended: !!recommended,
      reachable_hint: hint,
      // Filled in below, once listenHosts is known to be observed or guessed.
      listening: null,
    });
  };

  // LAN IPv4s first (phone on same Wi‑Fi)
  for (const iface of interfaces) {
    for (const addr of iface.addresses || []) {
      if (addr.family !== 'IPv4' || addr.internal) continue;
      if (addr.is_lan || isLanIpv4(addr.address)) {
        add(
          'lan',
          'Local Wi‑Fi / LAN',
          addr.address,
          iface.name,
          true,
          'Phone must be on the same Wi‑Fi. Brain must accept LAN connections (bind 0.0.0.0 or this IP).',
        );
      }
    }
  }

  // Mesh / Tailscale overlay
  if (meshIp && isOverlayIpv4(meshIp)) {
    add(
      'mesh',
      'Tailscale / mesh',
      meshIp,
      null,
      endpoints.length === 0,
      'Phone needs Tailscale (or mesh) installed and online on the same tailnet.',
    );
  }
  for (const iface of interfaces) {
    for (const addr of iface.addresses || []) {
      if (addr.family !== 'IPv4' || addr.internal) continue;
      if (addr.is_overlay || isOverlayIpv4(addr.address)) {
        add(
          'mesh',
          'Tailscale / mesh',
          addr.address,
          iface.name,
          endpoints.every((e) => e.kind !== 'lan'),
          'Phone needs Tailscale (or mesh) installed and online on the same tailnet.',
        );
      }
    }
  }

  // Loopback last (only useful on the same machine)
  add(
    'loopback',
    'This computer only',
    '127.0.0.1',
    'lo',
    false,
    'Only works on this machine — not for phone pairing.',
  );

  const lanBound = listenHosts.some((h) => h === '0.0.0.0' || isLanIpv4(h));
  const meshBound = listenHosts.some((h) => h === meshIp || isOverlayIpv4(h) || h === '0.0.0.0');
  const warnings = [];

  if (!endpoints.some((e) => e.kind === 'lan')) {
    warnings.push('No LAN IPv4 found — connect this machine to Wi‑Fi/Ethernet for same-network pairing.');
  } else if (!lanBound) {
    warnings.push(
      'Brain is not listening on LAN (only loopback/mesh). Phone on plain Wi‑Fi cannot use the LAN URL until the brain binds 0.0.0.0 (Allow Public Bind + restart) or you use Tailscale on the phone.',
    );
  }

  // Prefer an address the server is actually listening on when possible.
  const isListening = (ip) =>
    listenHosts.includes(ip) ||
    listenHosts.includes('0.0.0.0') ||
    (ip === '127.0.0.1' && listenHosts.includes('127.0.0.1'));

  for (const e of endpoints) {
    e.recommended = false;
  }

  let preferred =
    endpoints.find((e) => e.kind === 'lan' && lanBound && isListening(e.ip)) ||
    endpoints.find((e) => e.kind === 'mesh' && (meshBound || isListening(e.ip))) ||
    endpoints.find((e) => e.kind === 'lan') ||
    endpoints.find((e) => e.kind === 'mesh') ||
    endpoints.find((e) => e.kind === 'loopback') ||
    endpoints[0] ||
    null;

  // When LAN exists but is not bound, prefer mesh if available (works today with Tailscale phones).
  if (preferred?.kind === 'lan' && !lanBound) {
    const meshEp = endpoints.find((e) => e.kind === 'mesh');
    if (meshEp) preferred = meshEp;
  }

  if (preferred) {
    for (const e of endpoints) e.recommended = e.ip === preferred.ip;
  }

  if (endpoints.some((e) => e.kind === 'mesh') && !meshBound && meshIp) {
    warnings.push(`Mesh IP ${meshIp} is present but may not be the active listen address.`);
  }

  // Only claim a per-endpoint verdict when the bindings were observed. A guess
  // that renders as a green tick is worse than no tick at all.
  for (const e of endpoints) {
    e.listening = observedHosts ? isListening(e.ip) : null;
  }

  const reachable = observedHosts
    ? listenHosts.some((h) => h !== '127.0.0.1' && h !== '::1' && h !== 'localhost')
    : null;

  if (reachable === false) {
    // The headline problem, stated first: no QR on this card can work.
    warnings.unshift(
      `This brain is listening on loopback only (${listenHosts.join(', ')}), so no other `
      + 'device can open its UI — a phone scanning any code here will fail to connect. '
      + 'This usually means the mesh client was still starting when the brain launched. '
      + 'Restart the brain once the mesh is up, or set a bind host, and this resolves.',
    );
  }

  return {
    port,
    protocol,
    listen_hosts: listenHosts,
    listen_hosts_source: listenHostsSource,
    reachable_from_other_devices: reachable,
    preferred_url: preferred?.url || null,
    endpoints,
    warnings,
    measured_at: new Date().toISOString(),
  };
}

/**
 * Last-resort guess for callers that cannot observe the real sockets.
 *
 * Deliberately does NOT include the mesh address. `getMeshIp()` reporting one
 * means the mesh client is up *now* — it says nothing about whether this
 * process bound it, and assuming so is exactly the bug this module documents.
 * Only an explicitly configured host is added, because that one was at least
 * requested.
 */
function deriveListenHosts() {
  const hosts = new Set(['127.0.0.1']);
  const envHost = process.env.HOST || process.env.TR_HOST;
  if (envHost) hosts.add(envHost);
  return [...hosts];
}
