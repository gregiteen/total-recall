/**
 * LAN peer discovery — find hosts on local subnets and optionally probe
 * Total Recall brains for connectivity.
 *
 * No personal hostnames or fixed fleet lists. Peers come from OS ARP tables
 * and optional HTTP /health probes through the fetch gate.
 */
import { spawnSync } from 'node:child_process';
import { listLocalInterfaces, listLocalLanCidrs, isLanIpv4 } from './network-interfaces.mjs';

/**
 * Parse `arp -a` / `ip neigh` style output into { ip, mac, interface? }[].
 * Exported for unit tests.
 */
export function parseArpTable(text) {
  if (!text || typeof text !== 'string') return [];
  const peers = [];
  const seen = new Set();

  for (const line of text.split('\n')) {
    // macOS / BSD: ? (192.168.1.1) at aa:bb:cc:dd:ee:ff on en0 ifscope [ethernet]
    // Linux ip neigh: 192.168.1.1 dev eth0 lladdr aa:bb:cc:dd:ee:ff REACHABLE
    // Linux arp -n: 192.168.1.1 ether aa:bb:cc:dd:ee:ff C eth0
    let ip = null;
    let mac = null;
    let iface = null;

    const bsd = line.match(/\((\d+\.\d+\.\d+\.\d+)\)\s+at\s+([0-9a-f:]+)\s+on\s+(\S+)/i);
    if (bsd) {
      ip = bsd[1];
      mac = bsd[2].toLowerCase();
      iface = bsd[3];
    } else {
      const neigh = line.match(/^(\d+\.\d+\.\d+\.\d+)\s+dev\s+(\S+)\s+lladdr\s+([0-9a-f:]+)/i);
      if (neigh) {
        ip = neigh[1];
        iface = neigh[2];
        mac = neigh[3].toLowerCase();
      } else {
        const linuxArp = line.match(/^(\d+\.\d+\.\d+\.\d+)\s+\S+\s+([0-9a-f:]+)\s+\S+\s+(\S+)/i);
        if (linuxArp) {
          ip = linuxArp[1];
          mac = linuxArp[2].toLowerCase();
          iface = linuxArp[3];
        }
      }
    }

    if (!ip || !isLanIpv4(ip)) continue;
    if (!mac || mac === 'ff:ff:ff:ff:ff:ff' || mac.includes('incomplete')) continue;
    if (seen.has(ip)) continue;
    seen.add(ip);
    peers.push({ ip, mac, interface: iface || null, source: 'arp' });
  }

  return peers;
}

function readArpTableText(deps = {}) {
  if (typeof deps.arpText === 'string') return deps.arpText;
  const spawn = deps.spawnSync || spawnSync;

  // Prefer `ip neigh` on Linux; fall back to `arp -a` (macOS/BSD/Linux).
  const ipNeigh = spawn('ip', ['neigh'], {
    encoding: 'utf8',
    timeout: 3_000,
    stdio: ['ignore', 'pipe', 'ignore'],
  });
  if (ipNeigh.status === 0 && ipNeigh.stdout) return String(ipNeigh.stdout);

  const arp = spawn('arp', ['-a'], {
    encoding: 'utf8',
    timeout: 3_000,
    stdio: ['ignore', 'pipe', 'ignore'],
  });
  if (arp.status === 0 && arp.stdout) return String(arp.stdout);
  return '';
}

/**
 * Discover LAN hosts from the ARP/neighbor table, scoped to local LAN subnets when possible.
 * @param {{ arpText?: string, spawnSync?: Function, networkInterfaces?: Function }} [deps]
 */
export function discoverLanHosts(deps = {}) {
  const interfaces = listLocalInterfaces(deps);
  const lanCidrs = listLocalLanCidrs(interfaces);
  const localIps = new Set(
    interfaces.flatMap((i) => i.addresses.filter((a) => a.family === 'IPv4').map((a) => a.address)),
  );

  const raw = parseArpTable(readArpTableText(deps));
  const peers = raw.filter((p) => !localIps.has(p.ip));

  return {
    discovered_at: new Date().toISOString(),
    local_lan: lanCidrs,
    hosts: peers,
    host_count: peers.length,
  };
}

/**
 * Probe candidate IPs for a Total Recall /health endpoint.
 * Uses throttledFetch so traffic respects the network gate.
 *
 * @param {string[]} ips
 * @param {{ port?: number, timeoutMs?: number, throttledFetch?: Function }} [opts]
 */
export async function probeLanBrains(ips, opts = {}) {
  const port = opts.port || Number(process.env.TR_SERVER_PORT || process.env.PORT || 3000);
  const timeoutMs = opts.timeoutMs || 1500;
  const fetchImpl = opts.throttledFetch;
  if (!fetchImpl) {
    const { throttledFetch } = await import('./throttled-fetch.mjs');
    return probeLanBrains(ips, { ...opts, throttledFetch });
  }

  const results = [];
  for (const ip of ips) {
    if (!isLanIpv4(ip)) continue;
    const url = `http://${ip}:${port}/health`;
    const start = Date.now();
    try {
      const res = await fetchImpl(url, {}, timeoutMs);
      const ms = Date.now() - start;
      let body = null;
      try {
        body = typeof res.json === 'function' ? await res.json() : null;
      } catch {
        body = null;
      }
      const ok = res.ok || res.status === 200;
      results.push({
        ip,
        port,
        ok,
        status: res.status,
        latency_ms: ok ? ms : null,
        product: body?.product || body?.name || (ok ? 'total-recall?' : null),
        transport: 'lan',
      });
    } catch (err) {
      results.push({
        ip,
        port,
        ok: false,
        status: null,
        latency_ms: null,
        error: err.message || 'unreachable',
        transport: 'lan',
      });
    }
  }
  return results;
}

/**
 * Full LAN snapshot: interfaces + ARP hosts + optional brain probes.
 */
export async function discoverLanSnapshot(options = {}) {
  const interfaces = listLocalInterfaces(options);
  const discovery = discoverLanHosts(options);
  const probe = options.probe !== false;
  let brains = [];
  if (probe && discovery.hosts.length) {
    // Cap probes to avoid flooding large subnets.
    const limit = Math.min(options.maxProbes || 32, discovery.hosts.length);
    const ips = discovery.hosts.slice(0, limit).map((h) => h.ip);
    brains = await probeLanBrains(ips, options);
  }

  const brainByIp = new Map(brains.filter((b) => b.ok).map((b) => [b.ip, b]));
  const hosts = discovery.hosts.map((h) => {
    const brain = brainByIp.get(h.ip);
    return {
      ...h,
      tr_reachable: !!brain,
      tr_latency_ms: brain?.latency_ms ?? null,
      tr_port: brain?.port ?? null,
      transports: brain ? ['lan'] : [],
    };
  });

  return {
    discovered_at: discovery.discovered_at,
    interfaces: interfaces.filter((i) => !i.internal),
    local_lan: discovery.local_lan,
    hosts,
    host_count: hosts.length,
    tr_reachable_count: hosts.filter((h) => h.tr_reachable).length,
  };
}

/**
 * Synthetic hostname for a LAN IP when reverse DNS is unavailable.
 * Portable — derived only from the IP, never a personal device nickname.
 */
export function lanHostnameFromIp(ip) {
  const safe = String(ip || '')
    .replace(/[^0-9.]+/g, '')
    .replace(/\./g, '-');
  return safe ? `lan-${safe}` : 'lan-unknown';
}

/**
 * Upsert vault mesh_node entities for LAN hosts that answer Total Recall /health.
 * Identity keys: lan_ip (and optional reverse hostname). Does not invent fleet nicknames.
 *
 * @param {Array<{ ip: string, mac?: string, tr_reachable?: boolean, tr_port?: number, tr_latency_ms?: number, interface?: string }>} hosts
 * @param {{ vaultRoot?: string, workspace_id?: string, onlyReachable?: boolean }} [options]
 */
export async function registerLanMeshNodes(hosts, options = {}) {
  const { defaultVaultRoot, findVfsDocumentByPath, listVfsDocumentsUnder } = await import('./vfs-documents.mjs');
  const { meshNodeDocSlug } = await import('./mesh.mjs');
  const { processViaPackageKernel } = await import('./ssss-kernel-bridge.mjs');
  const crypto = await import('node:crypto');
  const path = await import('node:path');

  const vaultRoot = options.vaultRoot || defaultVaultRoot();
  const onlyReachable = options.onlyReachable !== false;
  const candidates = (hosts || []).filter((h) => h?.ip && isLanIpv4(h.ip) && (!onlyReachable || h.tr_reachable));

  const entities = listVfsDocumentsUnder('system/mesh-nodes', vaultRoot).filter((d) => d.type === 'mesh_node');
  const byLanIp = new Map();
  for (const e of entities) {
    if (e.lan_ip) byLanIp.set(String(e.lan_ip), e);
    if (e.ip && isLanIpv4(String(e.ip))) byLanIp.set(String(e.ip), e);
  }

  const results = [];
  const now = new Date().toISOString();

  for (const host of candidates) {
    const existing = byLanIp.get(String(host.ip));
    const hostname = existing?.hostname || lanHostnameFromIp(host.ip);
    const slug = existing
      ? path.basename(existing.vfs_path, '.md')
      : meshNodeDocSlug(hostname);
    const vfsPath = existing?.vfs_path || `system/mesh-nodes/${slug}.md`;

    const title = existing?.title || hostname;
    const description =
      existing?.description ||
      `LAN-discovered Total Recall peer at ${host.ip} (entity variables; not product hardcoding).`;

    const labels = Array.isArray(existing?.labels)
      ? [...new Set([...existing.labels, 'lan-discovered'])]
      : ['lan-discovered'];

    const transports = [...new Set([...(existing?.transports || []), 'lan'])];
    const capabilities = Array.isArray(existing?.capabilities)
      ? [...new Set([...existing.capabilities, 'transport:lan'])]
      : ['transport:lan'];

    const livePatches = {
      title,
      description,
      timestamp: now,
      hostname,
      lan_ip: host.ip,
      // Prefer not to overwrite mesh overlay IP if entity already has one on CGNAT
      status: 'online',
      last_heartbeat: now,
      transports,
      labels,
      capabilities,
      notes: existing?.notes ?? null,
      role: existing?.role ?? null,
    };
    // Only set primary ip to LAN if no mesh ip is recorded
    if (!existing?.ip || isLanIpv4(String(existing.ip))) {
      livePatches.ip = host.ip;
    }

    let result;
    if (existing || findVfsDocumentByPath(vfsPath, vaultRoot)) {
      result = await processViaPackageKernel(
        {
          type: 'patch',
          idempotency_key: crypto.randomUUID(),
          path: vfsPath,
          workspace_id: options.workspace_id || 'default',
          actor: { role: 'system' },
          patches: livePatches,
        },
        vaultRoot,
        { agentRole: 'system' },
      );
    } else {
      const content = [
        '---',
        'type: mesh_node',
        `title: ${JSON.stringify(title)}`,
        `description: ${JSON.stringify(description)}`,
        `timestamp: ${now}`,
        `hostname: ${JSON.stringify(hostname)}`,
        `ip: ${JSON.stringify(host.ip)}`,
        `lan_ip: ${JSON.stringify(host.ip)}`,
        'status: online',
        `last_heartbeat: ${now}`,
        'role: null',
        `labels: ${JSON.stringify(labels)}`,
        `capabilities: ${JSON.stringify(capabilities)}`,
        'notes: null',
        `transports: ${JSON.stringify(transports)}`,
        '---',
        '',
        '<!-- LAN-discovered TR peer. Enrich with role/io via SSSS patch. -->',
        '',
      ].join('\n');
      result = await processViaPackageKernel(
        {
          type: 'operation',
          idempotency_key: crypto.randomUUID(),
          path: vfsPath,
          workspace_id: options.workspace_id || 'default',
          actor: { role: 'system' },
          content,
        },
        vaultRoot,
        { agentRole: 'system' },
      );
    }

    results.push({
      ip: host.ip,
      hostname,
      path: vfsPath,
      written: !!result?.success,
      action: existing ? 'patched' : 'created',
      error: result?.success ? null : result?.validation?.errors?.join('; ') || 'failed',
    });
  }

  return {
    registered_at: now,
    attempted: candidates.length,
    results,
    written_count: results.filter((r) => r.written).length,
  };
}
