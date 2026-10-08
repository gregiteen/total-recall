/** Optional plugin distribution/branding. The portable host does not import this module. */
import { discoverPlugins, validatePluginManifest } from './plugin-loader.mjs';
import { hashPluginDir, packPlugin, decodeBundle } from './plugin-bundle.mjs';
import { parsePeerSource, fetchPeerBundle } from './plugin-peers.mjs';
import { parsePublicPluginSource, fetchPublicBundle, publicPluginShareUrl } from './plugin-public.mjs';
import { installPlugin as installLocal, readPluginRecord, patchPluginRecord, describePlugin,
  findInstalled, emit, vaultFor } from './plugin-store.mjs';
export * from './plugin-store.mjs';

function describePluginWithShare(plugin) {
  const result = describePlugin(plugin);
  result.share_url = result.shared && result.sha256 ? publicPluginShareUrl(plugin.id, result.sha256) : null;
  return result;
}

async function resolveBundle(source, { peerDeps, publicDeps } = {}) {
  const peer = parsePeerSource(source);
  const publicSource = parsePublicPluginSource(source);
  if (!peer && !publicSource) return null;
  let bundle, sha256, sourceRecord, expectedId;
  if (publicSource) {
    ({ bundle, sha256 } = await fetchPublicBundle(source, publicDeps));
    sourceRecord = { kind: 'public', ref: source };
    expectedId = publicSource.id;
  } else {
    const received = await fetchPeerBundle(peer.hostname, peer.id, peerDeps);
    bundle = received.bundle;
    sha256 = received.advertised.sha256;
    sourceRecord = { kind: 'peer', ref: `peer:${received.peer.hostname}/${peer.id}`, peer_hostname: received.peer.hostname };
    expectedId = peer.id;
  }
  const decoded = decodeBundle(bundle, { expectedSha256: sha256 });
  const entry = decoded.entries.find(e => e.path === 'plugin.json');
  if (!entry) throw new Error('Shared plugin bundle has no plugin.json');
  const manifest = JSON.parse(entry.data.toString('utf8'));
  const validation = validatePluginManifest(manifest);
  if (!validation.valid) throw new Error(`Invalid plugin manifest: ${validation.errors.join('; ')}`);
  if (manifest.id !== expectedId) throw new Error(`Requested '${expectedId}' but bundle contained '${manifest.id}'`);
  return { manifest, entries: decoded.entries, sha256: decoded.sha256, source: sourceRecord };
}

export function installPlugin(source, options = {}) {
  return installLocal(source, { ...options, resolveBundle });
}

export async function setPluginShared(id, shared, options = {}) {
  const plugin = findInstalled(id, options);
  if (!plugin) throw new Error(`Plugin '${id}' is not installed`);
  if (shared && !plugin.valid) throw new Error(`Plugin '${id}' has an invalid manifest and cannot be shared`);
  await patchPluginRecord(plugin, { shared: !!shared, public_shared: !!shared });
  await emit(vaultFor(plugin), id, shared ? 'shared' : 'unshared', { scope: plugin.scope });
  return describePluginWithShare(plugin);
}

export async function setPluginBranding(id, branding, options = {}) {
  const plugin = findInstalled(id, options);
  if (!plugin) throw new Error(`Plugin '${id}' is not installed`);
  const record = readPluginRecord(plugin);
  if (record?.locked === true) {
    throw new Error(`Plugin '${id}' is locked against editing`);
  }
  const cleanBranding = {
    icon: typeof branding?.icon === 'string' ? branding.icon.trim() : (record?.branding?.icon || null),
    image: typeof branding?.image === 'string' ? branding.image.trim() : (record?.branding?.image || null),
    color: typeof branding?.color === 'string' ? branding.color.trim() : (record?.branding?.color || null),
    badge: typeof branding?.badge === 'string' ? branding.badge.trim() : (record?.branding?.badge || null)
  };
  await patchPluginRecord(plugin, { branding: cleanBranding });
  await emit(vaultFor(plugin), id, 'branding_updated', { branding: cleanBranding, scope: plugin.scope });
  return describePluginWithShare(plugin);
}

export async function setPluginLocked(id, locked, options = {}) {
  const plugin = findInstalled(id, options);
  if (!plugin) throw new Error(`Plugin '${id}' is not installed`);
  await patchPluginRecord(plugin, { locked: !!locked });
  await emit(vaultFor(plugin), id, locked ? 'locked' : 'unlocked', { scope: plugin.scope });
  return describePluginWithShare(plugin);
}

export async function deployPluginToStore(id, options = {}) {
  const plugin = findInstalled(id, options);
  if (!plugin) throw new Error(`Plugin '${id}' is not installed`);
  if (!plugin.valid) throw new Error(`Plugin '${id}' has an invalid manifest and cannot be deployed: ${plugin.errors.join('; ')}`);
  
  const autoLock = options.autoLock !== false;
  await patchPluginRecord(plugin, {
    shared: true,
    public_shared: true,
    store_deployed: true,
    store_deployed_at: new Date().toISOString(),
    locked: autoLock
  });
  await emit(vaultFor(plugin), id, 'store_deployed', {
    version: plugin.manifest?.version,
    scope: plugin.scope,
    locked: autoLock
  });
  return describePluginWithShare(plugin);
}

/** What this node offers to mesh peers: valid installed plugins whose record says shared. */
export function listSharedPlugins(projectRoot = process.cwd()) {
  const out = [];
  for (const plugin of discoverPlugins(projectRoot)) {
    if (!plugin.valid) continue;
    const record = readPluginRecord(plugin);
    if (record?.shared !== true) continue;
    try {
      const h = hashPluginDir(plugin.dir);
      out.push({
        id: plugin.id,
        name: plugin.manifest.name,
        version: plugin.manifest.version,
        description: plugin.manifest.description,
        use_cases: plugin.manifest.use_cases || [],
        sha256: h.sha256,
        file_count: h.file_count,
        size_bytes: h.size_bytes,
        _plugin: plugin
      });
    } catch {
      // Unreadable plugin directory: not offered.
    }
  }
  return out;
}

export function packSharedPlugin(id, projectRoot = process.cwd()) {
  const entry = listSharedPlugins(projectRoot).find((p) => p.id === id);
  if (!entry) return null;
  return packPlugin(entry._plugin.dir, entry._plugin.manifest);
}

/** Public sharing is a separate, explicit opt-in from legacy mesh sharing. */
export function packPublicPlugin(id, projectRoot = process.cwd()) {
  const plugin = discoverPlugins(projectRoot).find((p) => p.id === id && p.valid);
  if (!plugin || readPluginRecord(plugin)?.public_shared !== true) return null;
  return packPlugin(plugin.dir, plugin.manifest);
}
