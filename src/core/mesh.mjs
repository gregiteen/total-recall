import { spawnSync } from 'node:child_process';
import path from 'node:path';
import crypto from 'node:crypto';
import {
  defaultVaultRoot,
  findVfsDocumentByPath,
  listVfsDocumentsUnder,
} from './vfs-documents.mjs';

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

/**
 * Derive a stable, portable VFS slug from a live hostname.
 * No personal device names are hardcoded — slug follows discovery.
 */
export function meshNodeDocSlug(hostname) {
  const base = normalizeHostname(hostname) || 'unknown-node';
  const slug = base
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return slug || 'unknown-node';
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

/** Read vault mesh_node entity documents (install-specific variables). */
export function listMeshNodeEntities(vaultRoot = defaultVaultRoot()) {
  return listVfsDocumentsUnder('system/mesh-nodes', vaultRoot).filter(
    (doc) => doc.type === 'mesh_node',
  );
}

/**
 * Merge live control-plane peers with vault mesh_node entity variables.
 * Live online/ip always win; role/labels/capabilities/notes come from the entity.
 */
export function mergeLivePeersWithEntities(peers, entities = []) {
  const byHost = new Map();
  const byIp = new Map();
  for (const ent of entities) {
    const host = normalizeHostname(ent.hostname);
    if (host) byHost.set(host, ent);
    if (ent.ip) byIp.set(String(ent.ip), ent);
  }

  const merged = peers.map((peer) => {
    const host = normalizeHostname(peer.hostname);
    const ent = (host && byHost.get(host)) || (peer.ip && byIp.get(String(peer.ip))) || null;
    return enrichPeerWithEntity(peer, ent);
  });

  const seen = new Set(
    merged.map((m) => normalizeHostname(m.hostname) || m.ip).filter(Boolean),
  );

  // Vault-only entities (registered but not currently on the mesh).
  for (const ent of entities) {
    const key = normalizeHostname(ent.hostname) || ent.ip;
    if (!key || seen.has(key)) continue;
    seen.add(key);
    merged.push(
      enrichPeerWithEntity(
        {
          hostname: ent.hostname || null,
          ip: ent.ip || null,
          online: false,
          self: false,
          os: ent.os || null,
        },
        ent,
        { vault_only: true },
      ),
    );
  }

  return merged;
}

function enrichPeerWithEntity(peer, ent, extra = {}) {
  const transports = Array.isArray(peer.transports)
    ? peer.transports
    : Array.isArray(ent?.transports)
      ? ent.transports
      : peer.ip
        ? ['mesh']
        : [];
  return {
    hostname: peer.hostname,
    ip: peer.ip || ent?.ip || null,
    lan_ip: peer.lan_ip || ent?.lan_ip || null,
    online: !!peer.online,
    self: !!peer.self,
    os: peer.os || ent?.os || null,
    role: ent?.role ?? null,
    labels: Array.isArray(ent?.labels) ? ent.labels : [],
    capabilities: Array.isArray(ent?.capabilities) ? ent.capabilities : [],
    notes: ent?.notes ?? null,
    title: ent?.title || peer.hostname,
    description: ent?.description || null,
    last_heartbeat: ent?.last_heartbeat || null,
    entity_path: ent?.vfs_path || null,
    has_entity: !!ent,
    vault_only: !!extra.vault_only,
    transports: [...new Set(transports)],
    interfaces: Array.isArray(peer.interfaces)
      ? peer.interfaces
      : Array.isArray(ent?.interfaces)
        ? ent.interfaces
        : [],
    io: peer.io || ent?.io || null,
  };
}

/** Live peers + vault entity variables for API/UI. */
export function listEnrichedMeshNodes(vaultRoot = defaultVaultRoot()) {
  const live = getMeshPeers({ includeSelf: true }).map((p) => ({
    ...p,
    transports: p.ip ? ['mesh'] : [],
  }));
  const entities = listMeshNodeEntities(vaultRoot);
  return mergeLivePeersWithEntities(live, entities);
}

/**
 * Attach local interface snapshot + LAN IPs onto the self enriched node.
 * Interface list is live host data (entity variables), not a device name table.
 */
export function attachSelfInterfaces(nodes, interfacesSummary = null) {
  let summary = interfacesSummary;
  if (!summary) {
    try {
      // Lazy import path avoided — call from routes with precomputed summary.
      return nodes;
    } catch {
      return nodes;
    }
  }
  return nodes.map((n) => {
    if (!n.self) return n;
    const lanIps = summary
      .flatMap((i) => i.ipv4 || [])
      .filter(Boolean);
    return {
      ...n,
      interfaces: summary,
      lan_ip: lanIps[0] || n.lan_ip || null,
      transports: [...new Set([...(n.transports || []), ...(n.ip ? ['mesh'] : []), ...(lanIps.length ? ['lan'] : [])])],
    };
  });
}

function findEntityForSelf(self, vaultRoot) {
  const entities = listMeshNodeEntities(vaultRoot);
  const host = normalizeHostname(self.hostname);
  return (
    entities.find((e) => normalizeHostname(e.hostname) === host) ||
    entities.find((e) => e.ip && self.ip && String(e.ip) === String(self.ip)) ||
    null
  );
}

/**
 * Upsert **this** node's mesh_node entity from live discovery.
 * Does not hardcode device names — slug and fields come from Tailscale self.
 * Preserves existing entity variables (role, labels, capabilities, notes, body).
 */
export async function patchOwnMeshNode(options = {}) {
  const self = getMeshSelf();
  if (!self?.hostname) {
    return { self: null, written: false, reason: 'mesh-unavailable' };
  }

  const vaultRoot = options.vaultRoot || defaultVaultRoot();
  const existing = findEntityForSelf(self, vaultRoot);
  const slug = existing
    ? path.basename(existing.vfs_path, '.md')
    : meshNodeDocSlug(self.hostname);
  const vfsPath = existing?.vfs_path || `system/mesh-nodes/${slug}.md`;
  const now = new Date().toISOString();
  const status = self.online ? 'online' : 'offline';

  const { processViaPackageKernel } = await import('./ssss-kernel-bridge.mjs');

  const requiredMeta = {
    title: existing?.title || self.hostname,
    description:
      existing?.description ||
      `Mesh node entity for ${self.hostname} (variables live on this document; product code does not hardcode devices).`,
    timestamp: now,
  };

  let interfacesSummary = [];
  try {
    const { summarizeInterfacesForEntity } = await import('./network-interfaces.mjs');
    interfacesSummary = summarizeInterfacesForEntity();
  } catch {
    interfacesSummary = existing?.interfaces || [];
  }
  const lanIp =
    interfacesSummary.flatMap((i) => i.ipv4 || []).find(Boolean) || existing?.lan_ip || null;

  let ioProfile = existing?.io || null;
  try {
    const { detectDeviceIo, mergeIoProfiles } = await import('./device-io.mjs');
    const liveIo = detectDeviceIo();
    ioProfile = mergeIoProfiles(liveIo, existing?.io || null);
  } catch {
    // optional
  }

  // Fold I/O channels into capabilities tags for agents (deduped).
  const ioChannels = Array.isArray(ioProfile?.channels) ? ioProfile.channels : [];
  const priorCaps = Array.isArray(existing?.capabilities) ? existing.capabilities : [];
  const capabilities = [...new Set([...priorCaps, ...ioChannels.map((c) => `io:${c}`)])];

  const livePatches = {
    hostname: self.hostname,
    ip: self.ip,
    status,
    last_heartbeat: now,
    os: self.os,
    interfaces: interfacesSummary,
    lan_ip: lanIp,
    transports: [...new Set(['mesh', ...(lanIp ? ['lan'] : [])])],
    io: ioProfile,
    capabilities,
    ...requiredMeta,
  };

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
    const yamlLines = [
      '---',
      'type: mesh_node',
      `title: ${JSON.stringify(requiredMeta.title)}`,
      `description: ${JSON.stringify(requiredMeta.description)}`,
      `timestamp: ${now}`,
      `hostname: ${JSON.stringify(self.hostname)}`,
      `ip: ${self.ip == null ? 'null' : JSON.stringify(self.ip)}`,
      `status: ${status}`,
      `last_heartbeat: ${now}`,
      `os: ${self.os == null ? 'null' : JSON.stringify(self.os)}`,
      'role: null',
      'labels: []',
      'capabilities: []',
      'notes: null',
      `lan_ip: ${lanIp == null ? 'null' : JSON.stringify(lanIp)}`,
      `transports: ${JSON.stringify(livePatches.transports)}`,
      `interfaces: ${JSON.stringify(interfacesSummary)}`,
      `io: ${JSON.stringify(ioProfile)}`,
      `capabilities: ${JSON.stringify(capabilities)}`,
      '---',
      '',
      '<!-- Entity space: I/O (screen/touch/mic/speaker) + notes/labels via SSSS patch. Agents use io.channels / ui_hints. -->',
      '',
    ];
    result = await processViaPackageKernel(
      {
        type: 'operation',
        idempotency_key: crypto.randomUUID(),
        path: vfsPath,
        workspace_id: options.workspace_id || 'default',
        actor: { role: 'system' },
        content: yamlLines.join('\n'),
      },
      vaultRoot,
      { agentRole: 'system' },
    );
  }

  return {
    self,
    written: !!result?.success,
    path: vfsPath,
    result,
  };
}
