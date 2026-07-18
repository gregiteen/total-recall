/**
 * Local network interface discovery + best-effort type classification.
 *
 * Interface names/types are live variables of the host device entity — never
 * hardcoded fleet hostnames. Classification is heuristic from OS interface
 * names (portable patterns only).
 */
import os from 'node:os';

/** @typedef {'loopback'|'wifi'|'ethernet'|'bridge'|'vpn_overlay'|'other'} InterfaceKind */

/**
 * Best-effort interface kind from OS interface name.
 * Patterns are generic (en/eth/wlan/utun/…), not device-specific.
 * @param {string} name
 * @param {{ internal?: boolean }} [addr]
 * @returns {InterfaceKind}
 */
export function classifyInterfaceKind(name, addr = {}) {
  const n = String(name || '').toLowerCase();
  if (addr.internal || n === 'lo' || n.startsWith('lo')) return 'loopback';
  if (
    n.includes('wlan') ||
    n.includes('wifi') ||
    n.startsWith('wl') ||
    n === 'airport' ||
    /^awdl\d*$/.test(n) ||
    /^llw\d*$/.test(n)
  ) {
    return 'wifi';
  }
  if (
    n.startsWith('utun') ||
    n.startsWith('tun') ||
    n.startsWith('tap') ||
    n.includes('tailscale') ||
    n.includes('wg') ||
    n.startsWith('ipsec') ||
    n.startsWith('ppp') ||
    n.includes('vpn')
  ) {
    return 'vpn_overlay';
  }
  if (n.startsWith('bridge') || n.startsWith('br') || n.startsWith('ap') || n.startsWith('veth')) {
    return 'bridge';
  }
  // Common ethernet patterns across Linux/BSD/Windows (eth*, en*, Ethernet)
  if (n.startsWith('eth') || n.startsWith('en') || n.includes('ethernet') || n.startsWith('em') || n.startsWith('igb')) {
    return 'ethernet';
  }
  return 'other';
}

/**
 * True for RFC1918 / link-local IPv4 used for LAN discovery.
 * CGNAT 100.64/10 is treated as overlay (Tailscale-style), not LAN.
 */
export function isLanIpv4(address) {
  if (!address || typeof address !== 'string') return false;
  const parts = address.split('.').map((p) => Number(p));
  if (parts.length !== 4 || parts.some((p) => !Number.isFinite(p) || p < 0 || p > 255)) return false;
  const [a, b] = parts;
  if (a === 10) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 169 && b === 254) return true; // link-local
  return false;
}

/** Tailscale / carrier-grade NAT range (not classic LAN). */
export function isOverlayIpv4(address) {
  if (!address || typeof address !== 'string') return false;
  const parts = address.split('.').map((p) => Number(p));
  if (parts.length !== 4) return false;
  return parts[0] === 100 && parts[1] >= 64 && parts[1] <= 127;
}

/**
 * List host network interfaces with classified kinds and addresses.
 * @param {{ networkInterfaces?: () => object }} [deps] inject for tests
 */
export function listLocalInterfaces(deps = {}) {
  const raw = (deps.networkInterfaces || os.networkInterfaces)() || {};
  const interfaces = [];

  for (const [name, addrs] of Object.entries(raw)) {
    if (!Array.isArray(addrs) || addrs.length === 0) continue;
    const kind = classifyInterfaceKind(name, addrs[0] || {});
    const addresses = addrs.map((a) => ({
      address: a.address,
      family: a.family === 'IPv6' || a.family === 6 ? 'IPv6' : 'IPv4',
      netmask: a.netmask || null,
      cidr: a.cidr || null,
      mac: a.mac || null,
      internal: !!a.internal,
      scopeid: a.scopeid,
      is_lan: a.family !== 'IPv6' && a.family !== 6 && !a.internal && isLanIpv4(a.address),
      is_overlay: a.family !== 'IPv6' && a.family !== 6 && isOverlayIpv4(a.address),
    }));

    interfaces.push({
      name,
      kind,
      mac: addrs.find((a) => a.mac && a.mac !== '00:00:00:00:00:00')?.mac || null,
      internal: addrs.every((a) => a.internal),
      addresses,
      has_lan_ipv4: addresses.some((a) => a.is_lan),
      has_overlay_ipv4: addresses.some((a) => a.is_overlay),
    });
  }

  return interfaces.sort((a, b) => a.name.localeCompare(b.name));
}

/** Summary suitable for mesh_node entity variable `interfaces`. */
export function summarizeInterfacesForEntity(interfaces = listLocalInterfaces()) {
  return interfaces
    .filter((iface) => !iface.internal)
    .map((iface) => ({
      name: iface.name,
      kind: iface.kind,
      mac: iface.mac,
      ipv4: iface.addresses
        .filter((a) => a.family === 'IPv4' && !a.internal)
        .map((a) => a.address),
      ipv6: iface.addresses
        .filter((a) => a.family === 'IPv6' && !a.internal)
        .map((a) => a.address),
    }));
}

/** Primary LAN IPv4s on this host (for ARP/subnet scoping). */
export function listLocalLanCidrs(interfaces = listLocalInterfaces()) {
  const out = [];
  for (const iface of interfaces) {
    for (const a of iface.addresses) {
      if (a.family === 'IPv4' && a.is_lan && a.cidr) {
        out.push({
          interface: iface.name,
          kind: iface.kind,
          address: a.address,
          cidr: a.cidr,
          netmask: a.netmask,
        });
      }
    }
  }
  return out;
}
