/**
 * Mobile pairing endpoints — reachable URLs for QR codes.
 * Never hardcodes personal hostnames; derives from live interfaces + server port.
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
  const listenHosts = Array.isArray(opts.listenHosts)
    ? opts.listenHosts
    : deriveListenHosts(meshIp);

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

  return {
    port,
    protocol,
    listen_hosts: listenHosts,
    preferred_url: preferred?.url || null,
    endpoints,
    warnings,
    measured_at: new Date().toISOString(),
  };
}

function deriveListenHosts(meshIp) {
  const hosts = new Set(['127.0.0.1']);
  if (meshIp) hosts.add(meshIp);
  const envHost = process.env.HOST || process.env.TR_HOST;
  if (envHost) hosts.add(envHost);
  // Production dual-bind pattern in server/index.mjs
  if (meshIp && meshIp !== '127.0.0.1') {
    hosts.add(meshIp);
    hosts.add('127.0.0.1');
  }
  return [...hosts];
}
