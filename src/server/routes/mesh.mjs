import { Router } from 'express';
import { requireAuth, requireScope } from '../auth.mjs';
import { getLeaderInfo, isLeader } from '../../core/leader-election.mjs';
import {
  clearMeshStatusCache,
  getMeshPeers,
  getMeshHostname,
  listEnrichedMeshNodes,
  listMeshNodeEntities,
  attachSelfInterfaces,
  normalizeHostname,
  setMeshNodeAccess,
} from '../../core/mesh.mjs';
import {
  proposeAccessFromSshConfig,
  readSshConfig,
  resolveNodeAccess,
} from '../../core/mesh-access.mjs';
import {
  createHeadscalePreAuthKey,
  resolveHeadscaleConfig,
  resolveHeadscaleUser,
  headscaleFetch,
} from '../../core/headscale-client.mjs';

// headscale rejects anything else with a 500; validate up front instead.
const AUTH_REQUEST_PREFIX = 'hskey-authreq-';
import { throttledFetch } from '../../core/throttled-fetch.mjs';
import { defaultVaultRoot } from '../../core/vfs-documents.mjs';
import {
  listLocalInterfaces,
  summarizeInterfacesForEntity,
} from '../../core/network-interfaces.mjs';
import { discoverLanSnapshot, registerLanMeshNodes } from '../../core/lan-discovery.mjs';
import { detectDeviceIo, mergeIoProfiles, uiHintsFromIo } from '../../core/device-io.mjs';
import { appendVfsEvent, listVfsEvents } from '../../core/ssss-operation-service.mjs';
import {
  enrollThisNode,
  getEnrollmentStatus,
  resetAutoEnrollThrottle,
} from '../../core/mesh-enroll.mjs';
import { BRAIN_DIR } from './_shared.mjs';

const router = Router();

/** Last observed leader key for de-duped SSSS election events (process-local). */
let lastRecordedLeaderKey = null;

/**
 * Dedicated event workspace — never scan default.jsonl (can be 100MB+/100k+ events).
 * Isolates mesh election history into `.events/mesh-election.jsonl`.
 */
const MESH_ELECTION_WORKSPACE = 'mesh-election';

async function recordMeshElectionEvent(leader, note = 'observed') {
  if (!leader?.hostname && !leader?.ip) return null;
  const key = `${leader.hostname || ''}|${leader.ip || ''}`;
  if (note === 'observed' && lastRecordedLeaderKey === key) return null;
  lastRecordedLeaderKey = key;
  const at = new Date().toISOString();
  await appendVfsEvent(
    `mesh/election/${Date.now()}`,
    {
      kind: 'mesh_election',
      hostname: leader.hostname || null,
      ip: leader.ip || null,
      note: String(note || 'observed'),
      at,
      strategy: leader.strategy || 'lowest-mesh-ip',
    },
    {
      actorRole: 'system',
      intent: 'Record mesh leader election observation',
      workspaceId: MESH_ELECTION_WORKSPACE,
    },
  );
  return { hostname: leader.hostname, ip: leader.ip, note, at };
}

function meshServerPort() {
  const value = Number(process.env.TR_SERVER_PORT || process.env.PORT || 3000);
  return Number.isInteger(value) && value > 0 && value <= 65535 ? value : 3000;
}

function meshPeerUrl(ip, route) {
  return `http://${ip}:${meshServerPort()}${route}`;
}

router.get('/api/mesh/leader', requireAuth, requireScope('config:read'), async (req, res) => {
  const leaderInfo = await getLeaderInfo();
  const leader = await isLeader();
  res.json({
    leader: leaderInfo,
    is_current_node_leader: leader
  });
});

/**
 * Live peers merged with vault mesh_node entity variables (role, labels, notes, …).
 * Device detail is entity data — not product hardcoding.
 * Self node includes live interface kinds (wifi/ethernet/vpn_overlay/…).
 */
router.get('/api/mesh/nodes', requireAuth, requireScope('config:read'), async (req, res) => {
  const vaultRoot = defaultVaultRoot();
  let nodes = listEnrichedMeshNodes(vaultRoot);
  try {
    nodes = attachSelfInterfaces(nodes, summarizeInterfacesForEntity());
  } catch {
    // interfaces optional
  }
  // Attach live I/O profile to self (merge vault entity overrides).
  try {
    const liveIo = detectDeviceIo();
    nodes = nodes.map((n) => {
      if (!n.self) return n;
      const io = mergeIoProfiles(liveIo, n.io || null);
      return { ...n, io, ui_hints: io.ui_hints || uiHintsFromIo(io) };
    });
  } catch {
    // io optional
  }
  // Resolve "how do I actually reach this" server-side. The precedence rules
  // (explicit host over mesh address over LAN address) are domain logic; having
  // the UI reimplement them is how two answers to the same question appear.
  nodes = nodes.map((node) => ({ ...node, access_resolved: resolveNodeAccess(node) }));
  const entities = listMeshNodeEntities(vaultRoot);
  res.json({
    nodes,
    entity_count: entities.length,
    missing_access_count: nodes.filter((node) => !node.access_resolved.complete).length,
  });
});

/**
 * Turn a request body into an access patch.
 *
 * A key that is present but empty clears the stored value; a key that is absent
 * leaves it untouched. Without that distinction a value could be set from the
 * UI but never taken back.
 */
function accessPatchFromBody(body = {}) {
  const patch = { source: 'manual' };
  const text = (value) => String(value ?? '').trim() || null;
  if ('ssh_user' in body) patch.ssh_user = text(body.ssh_user);
  if ('ssh_host' in body) patch.ssh_host = text(body.ssh_host);
  if ('identity_file' in body) patch.identity_file = text(body.identity_file);
  if ('ssh_port' in body) {
    const raw = text(body.ssh_port);
    patch.ssh_port = raw === null ? null : Number.parseInt(raw, 10);
  }
  return patch;
}

/**
 * Record how to reach a node — the one fact the control server cannot supply.
 * Body: { node, ssh_user?, ssh_port?, ssh_host?, identity_file? }
 */
router.post('/api/mesh/access', requireAuth, requireScope('config:write'), async (req, res) => {
  const target = String(req.body?.node || '').trim();
  if (!target) {
    res.status(400).json({ success: false, message: 'node is required' });
    return;
  }

  const patch = accessPatchFromBody(req.body || {});
  if (patch.ssh_port != null && !(Number.isInteger(patch.ssh_port) && patch.ssh_port > 0 && patch.ssh_port <= 65535)) {
    res.status(400).json({ success: false, message: 'ssh_port must be between 1 and 65535' });
    return;
  }

  try {
    const result = await setMeshNodeAccess(target, patch, { vaultRoot: defaultVaultRoot() });
    if (!result.written) {
      const notFound = result.reason === 'node-not-found';
      res.status(notFound ? 404 : 500).json({
        success: false,
        message: notFound ? `No mesh node matches "${target}".` : 'The vault write was rejected.',
        reason: result.reason || null,
      });
      return;
    }
    res.json({ success: true, path: result.path, access: result.access });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message || 'access write failed' });
  }
});

/**
 * Which nodes could be given a login account from this host's ssh config.
 *
 * Read-only, and deliberately separate from applying: importing a config is a
 * judgement call, and a wrong login written to the vault is worse than none at
 * all — it fails exactly like an unreachable host, only now it looks authored.
 */
router.get('/api/mesh/access/proposals', requireAuth, requireScope('config:read'), async (_req, res) => {
  try {
    const nodes = listEnrichedMeshNodes(defaultVaultRoot());
    res.json({
      proposals: proposeAccessFromSshConfig(nodes, readSshConfig()),
      missing_access: nodes
        .filter((node) => !resolveNodeAccess(node).complete)
        .map((node) => node.hostname),
      checked_at: new Date().toISOString(),
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message || 'access proposal failed' });
  }
});

/** Apply every proposal from this host's ssh config to the node entities. */
router.post('/api/mesh/access/import', requireAuth, requireScope('config:write'), async (_req, res) => {
  try {
    const vaultRoot = defaultVaultRoot();
    const proposals = proposeAccessFromSshConfig(listEnrichedMeshNodes(vaultRoot), readSshConfig());
    const results = [];
    for (const proposal of proposals) {
      const result = await setMeshNodeAccess(proposal.hostname, proposal.access, { vaultRoot });
      results.push({
        hostname: proposal.hostname,
        ssh_user: proposal.access.ssh_user,
        matched_host: proposal.matched_host,
        written: Boolean(result.written),
        reason: result.reason || null,
      });
    }
    const saved = results.filter((r) => r.written).length;
    // Counting attempts as successes is how a failed write once got announced
    // as a success; the caller gets both numbers.
    res.json({
      success: saved === proposals.length,
      attempted: proposals.length,
      saved,
      failed: proposals.length - saved,
      results,
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message || 'access import failed' });
  }
});

/**
 * Enrollment state of THIS node on the mesh control server.
 * Reports whether an unattended enrollment is possible and, when it is not,
 * the interactive registration URL the user must approve.
 */
router.get('/api/mesh/enrollment', requireAuth, requireScope('config:read'), async (_req, res) => {
  try {
    res.json(await getEnrollmentStatus({ brainDir: BRAIN_DIR }));
  } catch (err) {
    res.status(500).json({ success: false, message: err.message || 'enrollment status failed' });
  }
});

/**
 * Enroll this node now. Mints a short-lived pre-auth key when a Headscale
 * credential is configured; otherwise returns the interactive URL.
 * Body: { login_server?, user?, force? }
 */
router.post('/api/mesh/enroll', requireAuth, requireScope('config:write'), async (req, res) => {
  try {
    // A user-triggered enroll always runs, regardless of the daemon backoff.
    resetAutoEnrollThrottle();
    const result = await enrollThisNode({
      brainDir: BRAIN_DIR,
      loginServer: req.body?.login_server,
      user: req.body?.user,
      force: req.body?.force === true,
    });
    if (result.changed) clearMeshStatusCache();
    res.json(result);
  } catch (err) {
    res.status(500).json({ success: false, message: err.message || 'enrollment failed' });
  }
});

/**
 * POST /api/mesh/preauthkey
 * Mint an enrollment key for a NEW device (a phone, a tablet, another laptop).
 *
 * /api/mesh/enroll only ever enrolls THIS host, so adding a phone had no API at
 * all and the only route in was the CLI — which a phone user does not have.
 *
 * Body: { reusable?: boolean, ephemeral?: boolean, ttlMinutes?: number }
 */
router.post('/api/mesh/preauthkey', requireAuth, requireScope('config:write'), async (req, res) => {
  try {
    const reusable = req.body?.reusable === true;
    const ephemeral = req.body?.ephemeral === true;
    // Short by default: an enrollment key is a bearer credential, and the window
    // only has to cover walking to the device. Capped so a UI cannot mint a
    // long-lived key by accident.
    const requested = Number(req.body?.ttlMinutes);
    const ttlMinutes = Number.isFinite(requested) ? Math.min(Math.max(requested, 1), 60) : 15;

    const { key, expiration } = await createHeadscalePreAuthKey(
      { reusable, ephemeral, ttlMinutes },
      BRAIN_DIR,
    );
    res.json({
      success: true,
      key,
      expiration,
      reusable,
      ephemeral,
      ttl_minutes: ttlMinutes,
      // Surfaced so the UI can show the exact control-server URL to type into a
      // phone; never include the token, only the URL.
      login_server: await resolveHeadscaleConfig(BRAIN_DIR).then((c) => c.url).catch(() => null),
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message || 'could not mint enrollment key' });
  }
});

/**
 * POST /api/mesh/register-node
 * Approve a device that registered interactively.
 *
 * This is the ONLY path that works for iOS. The upstream Tailscale iOS app
 * does not accept a pre-auth key when pointed at a custom control server, so a
 * phone always lands on headscale's "run this command on the server" page and
 * waits for server-side approval. Without this endpoint that approval was only
 * reachable over SSH + CLI, which is exactly the machine the user is not
 * holding.
 *
 * Body: { auth_id, user? }
 */
router.post('/api/mesh/register-node', requireAuth, requireScope('config:write'), async (req, res) => {
  try {
    const authId = String(req.body?.auth_id || '').trim();
    if (!authId) {
      return res.status(400).json({ success: false, message: 'auth_id is required (the hskey-authreq-… value shown on the device)' });
    }
    // Fail with the fix rather than passing a malformed id through to a 500.
    if (!authId.startsWith(AUTH_REQUEST_PREFIX)) {
      return res.status(400).json({
        success: false,
        message: `that does not look like a registration id — expected it to start with "${AUTH_REQUEST_PREFIX}". `
          + 'Copy the whole value from the device screen, not the surrounding command.',
      });
    }

    const user = await resolveHeadscaleUser(BRAIN_DIR, req.body?.user);
    const query = `?user=${encodeURIComponent(user)}&key=${encodeURIComponent(authId)}`;
    const result = await headscaleFetch(`/api/v1/node/register${query}`, { method: 'POST' }, BRAIN_DIR);
    const node = (typeof result === 'string' ? JSON.parse(result) : result)?.node ?? null;

    res.json({
      success: true,
      user,
      node: node && {
        id: node.id ?? null,
        name: node.name ?? node.givenName ?? null,
        ip_addresses: node.ipAddresses ?? [],
        online: node.online ?? false,
      },
      message: node?.name ? `${node.name} joined the tailnet.` : 'Device registered.',
    });
  } catch (err) {
    const msg = String(err?.message || '');
    // headscale answers 500 for an expired/unknown id; say so in those terms.
    const stale = /not found|expired|invalid/i.test(msg);
    res.status(stale ? 409 : 500).json({
      success: false,
      message: stale
        ? 'headscale has already forgotten that registration id. Reopening sign-in is usually NOT enough — '
          + 'iOS keeps its node key in the keychain and replays the same id forever, while the device keeps '
          + 'showing a page that looks perfectly valid. If the id you see does not change, turn on '
          + 'Settings → Tailscale → Reset Keychain, force-quit the app, then sign in again.'
        : msg || 'could not register device',
    });
  }
});

/**
 * Watch mode: arm the server to approve the next device that asks.
 *
 * POST   /api/mesh/watch   arm    (body: { ttlMinutes? })
 * GET    /api/mesh/watch   status
 * DELETE /api/mesh/watch   disarm
 *
 * This is the flow that actually works. The device generates a registration id
 * and waits; the server approves it. Nothing is typed, copied or scanned —
 * which matters because no Tailscale client can scan a QR to authenticate, and
 * carrying a 40-character key from a laptop to a phone by hand is not a flow
 * anyone completes.
 */
router.post('/api/mesh/watch', requireAuth, requireScope('config:write'), async (req, res) => {
  try {
    const { startWatch } = await import('../../core/registration-watch.mjs');
    const ttlMinutes = Number(req.body?.ttlMinutes);
    const result = await startWatch({
      brainDir: BRAIN_DIR,
      ttlMs: Number.isFinite(ttlMinutes) ? ttlMinutes * 60_000 : undefined,
      register: async (authId) => {
        const user = await resolveHeadscaleUser(BRAIN_DIR);
        const q = `?user=${encodeURIComponent(user)}&key=${encodeURIComponent(authId)}`;
        const out = await headscaleFetch(`/api/v1/node/register${q}`, { method: 'POST' }, BRAIN_DIR);
        const parsed = typeof out === 'string' ? JSON.parse(out) : out;
        const node = parsed?.node || null;
        return { id: node?.id ?? null, name: node?.givenName || node?.name || null, ip_addresses: node?.ipAddresses || [] };
      },
    });
    // `unavailable` is a real answer, not a failure: it tells the UI to offer
    // the manual paste box instead of a button that cannot work here.
    res.status(result.state === 'unavailable' ? 409 : 200).json(result);
  } catch (err) {
    res.status(500).json({ state: 'error', error: err.message || 'could not start watch' });
  }
});

router.get('/api/mesh/watch', requireAuth, requireScope('config:read'), async (_req, res) => {
  try {
    const { getWatchStatus } = await import('../../core/registration-watch.mjs');
    res.json(getWatchStatus());
  } catch (err) {
    res.status(500).json({ state: 'error', error: err.message });
  }
});

router.delete('/api/mesh/watch', requireAuth, requireScope('config:write'), async (_req, res) => {
  try {
    const { stopWatch } = await import('../../core/registration-watch.mjs');
    res.json(stopWatch());
  } catch (err) {
    res.status(500).json({ state: 'error', error: err.message });
  }
});

/**
 * This host's I/O capability profile for agent UI generation
 * (screen, touch, mic, speaker, keyboard, camera, headless, …).
 */
router.get('/api/mesh/io', requireAuth, requireScope('config:read'), async (_req, res) => {
  try {
    const live = detectDeviceIo();
    const entities = listMeshNodeEntities(defaultVaultRoot());
    const selfHost = normalizeHostname(getMeshHostname());
    const ent = entities.find(
      (e) => normalizeHostname(e.hostname) === selfHost,
    );
    const io = mergeIoProfiles(live, ent?.io || null);
    res.json({
      io,
      ui_hints: io.ui_hints || uiHintsFromIo(io),
      entity_path: ent?.vfs_path || null,
      measured_at: io.measured_at,
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message || 'I/O detection failed' });
  }
});

/**
 * Local NIC inventory with classified interface kinds.
 */
router.get('/api/mesh/interfaces', requireAuth, requireScope('config:read'), async (_req, res) => {
  const interfaces = listLocalInterfaces();
  res.json({
    interfaces,
    summary: summarizeInterfacesForEntity(interfaces),
    measured_at: new Date().toISOString(),
  });
});

/**
 * Discover LAN hosts (ARP/neighbor table) and probe TR /health on LAN IPs.
 * Query: ?probe=0 to skip health probes.
 */
router.get('/api/mesh/lan', requireAuth, requireScope('config:read'), async (req, res) => {
  const probe = String(req.query?.probe ?? '1') !== '0';
  try {
    const snapshot = await discoverLanSnapshot({
      probe,
      port: meshServerPort(),
      throttledFetch,
      maxProbes: Number(req.query?.limit) || 32,
    });
    res.json(snapshot);
  } catch (err) {
    res.status(500).json({ success: false, message: err.message || 'LAN discovery failed' });
  }
});

/**
 * Discover LAN TR-reachable hosts and upsert mesh_node entities (SSSS).
 * Body optional: { probe?: boolean, limit?: number }
 * Does not hardcode device names — hostname = lan-<ip-dashes> unless entity exists.
 */
router.post('/api/mesh/lan/register', requireAuth, requireScope('config:write'), async (req, res) => {
  const probe = req.body?.probe !== false;
  const limit = Number(req.body?.limit) || 32;
  try {
    const snapshot = await discoverLanSnapshot({
      probe,
      port: meshServerPort(),
      throttledFetch,
      maxProbes: limit,
    });
    const registration = await registerLanMeshNodes(snapshot.hosts, {
      vaultRoot: defaultVaultRoot(),
      onlyReachable: true,
    });
    res.json({
      success: true,
      discovery: {
        host_count: snapshot.host_count,
        tr_reachable_count: snapshot.tr_reachable_count,
        discovered_at: snapshot.discovered_at,
      },
      registration,
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message || 'LAN register failed' });
  }
});

router.post('/api/mesh/election/refresh', requireAuth, requireScope('config:write'), async (_req, res) => {
  clearMeshStatusCache();
  const leader = await getLeaderInfo();
  try {
    await recordMeshElectionEvent(leader, 'manual refresh');
  } catch {
    // event append is best-effort; election result still returns
  }
  res.json({
    leader,
    is_current_node_leader: await isLeader(),
  });
});

/**
 * Append-only mesh election observation (SSSS event). Used by dashboard when leader changes.
 * Body: { hostname?, ip?, note? } — if omitted, records current deterministic leader.
 */
router.post('/api/mesh/election/log', requireAuth, requireScope('config:write'), async (req, res) => {
  try {
    let leader = null;
    if (req.body?.hostname || req.body?.ip) {
      leader = {
        hostname: req.body.hostname || null,
        ip: req.body.ip || null,
        strategy: req.body.strategy || 'lowest-mesh-ip',
      };
    } else {
      leader = await getLeaderInfo();
    }
    const entry = await recordMeshElectionEvent(leader, req.body?.note || 'observed');
    res.json({ success: true, recorded: Boolean(entry), entry });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message || 'election log failed' });
  }
});

/**
 * Recent mesh election events from VFS event store (SSSS append-only).
 */
router.get('/api/mesh/election/history', requireAuth, requireScope('config:read'), async (_req, res) => {
  try {
    // Read only the mesh-election workspace (not the huge default stream).
    const events = (await listVfsEvents({ workspaceId: MESH_ELECTION_WORKSPACE }))
      .filter((event) => event.payload?.kind === 'mesh_election' || event.payload?.kind === undefined)
      .map((event) => {
        const p = event.payload || {};
        // Content may be raw payload if kernel stores content string as payload fields
        return {
          id: event.event_id,
          hostname: p.hostname ?? null,
          ip: p.ip ?? null,
          note: p.note || 'observed',
          at: p.at || event.timestamp || null,
          strategy: p.strategy,
        };
      })
      .filter((e) => e.hostname || e.ip || e.at);
    events.sort((a, b) => new Date(b.at || 0) - new Date(a.at || 0));
    res.json({ events: events.slice(0, 50), workspace: MESH_ELECTION_WORKSPACE });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message || 'election history failed' });
  }
});

/**
 * Measure RTT from this node to each peer's /health via the fetch gate
 * (proper authenticated API path — never browser no-cors).
 */
router.get('/api/mesh/latency', requireAuth, requireScope('config:read'), async (_req, res) => {
  const peers = getMeshPeers({ includeSelf: true });
  const port = meshServerPort();
  const latency_ms = {};
  const results = [];

  for (const peer of peers) {
    if (peer.self) {
      latency_ms[peer.hostname] = 0;
      results.push({ hostname: peer.hostname, ip: peer.ip, latency_ms: 0, self: true, ok: true });
      continue;
    }
    if (!peer.ip || !peer.online) {
      latency_ms[peer.hostname] = null;
      results.push({ hostname: peer.hostname, ip: peer.ip, latency_ms: null, self: false, ok: false, error: 'offline' });
      continue;
    }
    const start = Date.now();
    try {
      // WAN mesh RTT can exceed 3s under load; gate + Tailscale need headroom.
      const response = await throttledFetch(meshPeerUrl(peer.ip, '/health'), {}, 10_000);
      const ms = Date.now() - start;
      const ok = response.ok || response.status === 200;
      latency_ms[peer.hostname] = ok ? ms : null;
      results.push({ hostname: peer.hostname, ip: peer.ip, latency_ms: ok ? ms : null, self: false, ok, status: response.status });
    } catch (err) {
      latency_ms[peer.hostname] = null;
      results.push({
        hostname: peer.hostname,
        ip: peer.ip,
        latency_ms: null,
        self: false,
        ok: false,
        error: err.message || 'unreachable',
      });
    }
  }

  res.json({ latency_ms, results, port, measured_at: new Date().toISOString() });
});

export default router;
