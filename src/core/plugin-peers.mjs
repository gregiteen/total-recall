/**
 * Peer-to-peer plugin discovery over the Total Recall mesh.
 *
 * There is no central catalog. Each node serves the plugins its owner chose to
 * share (GET /api/mesh/plugins, see routes/plugins-mesh.mjs) and this module
 * asks every online peer directly. What comes back is reported per peer
 * exactly as observed — reachable, offline, not configured, running a version
 * without plugin sharing, or failing — never smoothed over.
 */
import { listEnrichedMeshNodes, isMeshAvailable } from './mesh.mjs';
import { getMeshSyncAuthorization } from './mesh-auth.mjs';
import { throttledFetch } from './throttled-fetch.mjs';

const LIST_TIMEOUT_MS = 5_000;
const BUNDLE_TIMEOUT_MS = 20_000;
const MAX_BUNDLE_RESPONSE_BYTES = 8 * 1024 * 1024; // base64 of the 5 MB bundle cap, plus envelope

function serverPort() {
  const value = Number(process.env.TR_SERVER_PORT || process.env.PORT || 3000);
  return Number.isInteger(value) && value > 0 && value <= 65535 ? value : 3000;
}

/** Build a peer URL, refusing anything outside the mesh CGNAT range (100.64.0.0/10). */
export function meshPeerUrl(ip, route, port = serverPort()) {
  const octets = String(ip || '').split('.').map(Number);
  if (
    octets.length !== 4 ||
    octets.some((part) => !Number.isInteger(part) || part < 0 || part > 255) ||
    octets[0] !== 100 || octets[1] < 64 || octets[1] > 127
  ) {
    throw new Error(`Peer address ${ip} is outside the mesh range`);
  }
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Invalid peer brain port');
  return `http://${ip}:${port}${route}`;
}

function describeHttpFailure(status) {
  if (status === 404) return { status: 'unsupported', error: 'Peer does not serve plugins (older Total Recall version)' };
  if (status === 401) return { status: 'error', error: 'Peer rejected the mesh sync credential' };
  if (status === 403) return { status: 'error', error: 'Peer refused the request source address' };
  if (status === 503) return { status: 'not_configured', error: 'Mesh sync is not configured on the peer' };
  return { status: 'error', error: `Peer returned HTTP ${status}` };
}

async function readJsonOrNull(res) {
  const type = String(res.headers?.get?.('content-type') || '');
  if (type && !type.includes('json')) return null;
  try {
    const body = await res.json();
    return body && typeof body === 'object' ? body : null;
  } catch {
    return null;
  }
}

/**
 * Ask every mesh peer which plugins it shares.
 * @param {{ peers?: object[], fetchImpl?: Function, authorization?: string|null, meshAvailable?: boolean }} [deps]
 */
export async function listPeerPlugins(deps = {}) {
  const meshAvailable = deps.meshAvailable ?? isMeshAvailable();
  if (!meshAvailable) {
    return { mesh: { available: false, configured: false }, peers: [] };
  }

  const peers = (deps.peers ?? listEnrichedMeshNodes()).filter((p) => !p.self);
  let authorization = deps.authorization;
  if (authorization === undefined) {
    try {
      authorization = await getMeshSyncAuthorization();
    } catch {
      authorization = null;
    }
  }
  const doFetch = deps.fetchImpl || throttledFetch;

  const results = await Promise.all(peers.map(async (peer) => {
    const base = { hostname: peer.hostname, ip: peer.ip, online: !!peer.online, os: peer.os || null, plugins: [] };
    if (!peer.online) return { ...base, status: 'offline' };
    if (!authorization) {
      return { ...base, status: 'not_configured', error: 'TR_MESH_SYNC_TOKEN is not set on this node' };
    }
    try {
      const res = await doFetch(meshPeerUrl(peer.ip, '/api/mesh/plugins', peer.brain_port || serverPort()), { headers: { Authorization: authorization } }, LIST_TIMEOUT_MS);
      if (!res.ok) return { ...base, ...describeHttpFailure(res.status) };
      // An older brain has no such route and its SPA fallback answers with the
      // dashboard's index.html — that is "does not serve plugins", not a parse error.
      const body = await readJsonOrNull(res);
      if (!body) return { ...base, ...describeHttpFailure(404) };
      const plugins = Array.isArray(body?.plugins) ? body.plugins : [];
      return {
        ...base,
        status: 'ok',
        plugins: plugins
          .filter((p) => p && typeof p.id === 'string' && typeof p.sha256 === 'string')
          .map((p) => ({
            id: p.id,
            name: String(p.name || p.id),
            version: String(p.version || ''),
            description: String(p.description || ''),
            use_cases: Array.isArray(p.use_cases) ? p.use_cases.map(String) : [],
            sha256: p.sha256,
            file_count: Number(p.file_count) || 0,
            size_bytes: Number(p.size_bytes) || 0
          }))
      };
    } catch (err) {
      const msg = err?.message || String(err);
      return {
        ...base,
        status: 'unreachable',
        error: msg === 'fetch failed' ? `No Total Recall server answered at ${peer.ip}:${peer.brain_port || serverPort()}` : msg
      };
    }
  }));

  results.sort((a, b) => String(a.hostname).localeCompare(String(b.hostname)));
  return { mesh: { available: true, configured: !!authorization }, peers: results };
}

/** Parse `peer:<hostname>/<id>`. */
export function parsePeerSource(source) {
  const m = /^peer:([^/\s]+)\/([a-z][a-z0-9-]{1,63})$/.exec(String(source || '').trim());
  return m ? { hostname: m[1], id: m[2] } : null;
}

function sameHost(a, b) {
  const norm = (h) => String(h || '').toLowerCase().replace(/\.$/, '').split('.')[0];
  return norm(a) === norm(b);
}

/**
 * Fetch one plugin bundle from a named peer. The advertised hash comes from the
 * peer's own listing; plugin-bundle.decodeBundle() verifies the bytes against it.
 * @returns {Promise<{ bundle: object, advertised: object, peer: object }>}
 */
export async function fetchPeerBundle(hostname, id, deps = {}) {
  const peers = deps.peers ?? listEnrichedMeshNodes();
  const peer = peers.find((p) => !p.self && (sameHost(p.hostname, hostname) || p.ip === hostname));
  if (!peer) throw new Error(`No mesh peer named '${hostname}'`);
  if (!peer.online) throw new Error(`Mesh peer '${peer.hostname}' is offline`);

  const authorization = deps.authorization ?? await getMeshSyncAuthorization();
  const doFetch = deps.fetchImpl || throttledFetch;
  const headers = { Authorization: authorization };

  const listRes = await doFetch(meshPeerUrl(peer.ip, '/api/mesh/plugins', peer.brain_port || serverPort()), { headers }, LIST_TIMEOUT_MS);
  if (!listRes.ok) throw new Error(describeHttpFailure(listRes.status).error);
  const listing = await readJsonOrNull(listRes);
  if (!listing) throw new Error(describeHttpFailure(404).error);
  const advertised = (listing?.plugins || []).find((p) => p.id === id);
  if (!advertised) throw new Error(`Peer '${peer.hostname}' does not share plugin '${id}'`);

  const res = await doFetch(
    meshPeerUrl(peer.ip, `/api/mesh/plugins/${encodeURIComponent(id)}/bundle`, peer.brain_port || serverPort()),
    { headers },
    BUNDLE_TIMEOUT_MS
  );
  if (!res.ok) throw new Error(describeHttpFailure(res.status).error);
  const text = await res.text();
  if (text.length > MAX_BUNDLE_RESPONSE_BYTES) throw new Error('Peer bundle exceeds the size limit');
  return { bundle: JSON.parse(text), advertised, peer };
}
