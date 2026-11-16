/** Read-only observations and explicitly requested local managed startup. No persistent state. */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { isIP } from 'node:net';
import { readProcessCommand } from './pid-lock.mjs';
import { CLI_COMMANDS } from './cli-commands.mjs';

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
export const cliEntry = path.join(packageRoot, 'bin/total-recall.mjs');

/** Whether this package's dashboard bundle is as new as its frontend sources (the server rebuilds it). */
async function defaultDashboardCheck() {
  try {
    const { checkDistFreshness, dashboardTargets } = await import('./dashboard-bundle.mjs');
    if (!fs.existsSync(path.join(packageRoot, 'frontend', 'package.json'))) return { status: 'not-shipped' };
    const result = await checkDistFreshness(dashboardTargets(packageRoot));
    const status = result.ok ? 'current' : result.reason === 'missing-bundle' ? 'missing' : 'stale';
    return {
      status,
      ...(result.bundle ? { built_at: new Date(result.bundle.mtimeMs).toISOString() } : {}),
      ...(!result.ok && result.source ? { newer_source: path.relative(packageRoot, result.source.path) } : {}),
    };
  } catch (error) {
    return { status: 'unknown', reason: error.message };
  }
}

export function runBounded(binary, args, { cwd = process.cwd(), timeoutMs = 15000, maxBytes = 262144 } = {}) {
  return new Promise(resolve => {
    let child, output = '', stderr = '', size = 0, reason = null, settled = false, timer, escalation;
    const finish = code => { if (settled) return; settled = true; clearTimeout(timer); resolve({ code, output, stderr: stderr.slice(-2000), reason }); };
    const kill = signal => { try { if (process.platform !== 'win32' && child.pid) process.kill(-child.pid, signal); else child.kill(signal); } catch {} };
    const stop = why => { if (reason || settled) return; reason = why; kill('SIGTERM'); escalation = setTimeout(() => { kill('SIGKILL'); finish(null); }, 500); };
    try { child = spawn(binary, args, { cwd, shell: false, detached: process.platform !== 'win32', stdio: ['ignore', 'pipe', 'pipe'] }); }
    catch { reason = 'spawn-failed'; finish(null); return; }
    timer = setTimeout(() => stop('timeout'), timeoutMs);
    child.on('error', () => { reason = 'spawn-failed'; clearTimeout(escalation); finish(null); });
    child.stdout.on('data', chunk => { size += chunk.length; if (size <= maxBytes) output += chunk.toString(); else stop('output-limit'); });
    child.stderr.on('data', chunk => { size += chunk.length; if (size <= maxBytes) stderr += chunk.toString(); else stop('output-limit'); });
    child.on('close', code => { if (!reason) finish(code); });
  });
}

export async function verifyListener(pid, url, { run = runBounded, cwd = process.cwd() } = {}) {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  const port = url.port || (url.protocol === 'https:' ? '443' : '80');
  const result = await run('lsof', ['-nP', `-iTCP:${port}`, '-sTCP:LISTEN', '-Fp'], { cwd, timeoutMs: 5000 });
  return result.code === 0 && !result.reason && result.output.split(/\r?\n/).includes(`p${pid}`);
}

/** A process's working directory, or null when it cannot be determined. */
export function readProcessCwd(pid, { run = spawnSync } = {}) {
  try {
    const res = run('lsof', ['-a', '-p', String(pid), '-d', 'cwd', '-Fn'], { encoding: 'utf8', timeout: 5_000 });
    if (res.status !== 0 || !res.stdout) return null;
    const line = res.stdout.split(/\r?\n/).find(l => l.startsWith('n'));
    return line ? line.slice(1) || null : null;
  } catch { return null; }
}

/**
 * Does the process holding `pid` look like the entry at `hint`?
 *
 * A launch agent starts its program with a path relative to the service's
 * WorkingDirectory (`node src/server/index.mjs`), so the recorded command line
 * carries no absolute path. Resolving it against the *caller's* cwd made this
 * check depend on where the operator happened to stand: `total-recall startup
 * check` run from any other directory reported a healthy local server as
 * `server-process-unverified`. Resolve against the process's own cwd instead,
 * An unresolved entry is unknown; a matching suffix alone cannot identify an
 * installation and must never authorize lifecycle actions.
 */
export function processIdentity(pidFile, hint, { alive = pid => { try { process.kill(pid, 0); return true; } catch (err) { if (err.code === 'ESRCH') return false; throw err; } }, command = readProcessCommand, cwd = readProcessCwd } = {}) {
  let pid;
  try { pid = Number(fs.readFileSync(pidFile, 'utf8').trim()); }
  catch (err) { return err.code === 'ENOENT' ? { status: 'not-started' } : { status: 'unknown', reason: 'pid-unreadable' }; }
  if (!Number.isInteger(pid) || pid <= 0) return { status: 'unknown', reason: 'invalid-pid' };
  try { if (!alive(pid)) return { status: 'stopped' }; }
  catch { return { status: 'unknown', reason: 'process-liveness-unavailable', pid }; }
  let cmd;
  try { cmd = command(pid); } catch { /* unknown below */ }
  if (!cmd) return { status: 'unknown', reason: 'process-identity-unavailable', pid };
  const script = cmd.trim().match(/^(?:\S*node(?:\s+--[^ ]+)*)\s+(\S+)/)?.[1];
  let entry = null;
  if (script) {
    // Absolute script paths resolve directly; relative ones resolve against the
    // process's own working directory, never the caller's.
    try {
      const base = path.isAbsolute(script) ? null : cwd(pid);
      if (!path.isAbsolute(script) && !base) throw new Error('Missing process cwd');
      entry = fs.realpathSync(base ? path.resolve(base, script) : script);
      if (entry === fs.realpathSync(hint)) return { status: 'running', pid, entry };
    } catch { return { status: 'unknown', reason: 'process-entry-unavailable', pid }; }
  }
  return { status: 'conflict', reason: 'foreign-pid', pid, ...(entry ? { entry } : {}) };
}

/** The single installation-aware daemon observation for status and lifecycle. */
export function observeDaemon(brainDir, { identity = processIdentity, expectedEntry = path.join(packageRoot, 'src', 'core', 'daemon-loop.mjs') } = {}) {
  const expected_entry = expectedEntry;
  return { ...identity(path.join(brainDir, 'daemon.pid'), expected_entry), expected_entry, source: 'local-pid' };
}

/** Read Mesh's existing explicit placement, never infer delegation from election alone. */
export async function configuredDaemonPlacement(brainDir, { cwd = process.cwd(), load } = {}) {
  try {
    load ||= (await import('./plugin-runtime.mjs')).loadPluginModule;
    const owner = await load('mesh', 'leader-election', { projectRoot: cwd });
    const pin = owner.leaderPin(brainDir);
    if (!pin) return { mode: 'local' };
    if (isIP(pin) !== 4) return { mode: 'unknown', reason: 'invalid-leader-pin' };
    const mesh = await load('mesh', 'mesh', { projectRoot: cwd });
    const self = mesh.getMeshSelf();
    if (!self?.ip) return { mode: 'unknown', reason: 'mesh-self-unverified' };
    if (self.ip === pin) return { mode: 'local' };
    // getLeaderInfo is scoped by the owner runtime. Require it to agree with
    // this caller's explicit brain pin AND port, so another root cannot delegate
    // this brain's work through its own configuration.
    const port = owner.leaderPort(brainDir);
    const leader = await owner.getLeaderInfo();
    if (!Number.isInteger(port) || port < 1 || port > 65535
        || leader?.strategy !== 'pinned-mesh-ip' || leader.ip !== pin || leader.port !== port) {
      return { mode: 'unknown', reason: 'configured-leader-unverified' };
    }
    return { mode: 'remote', ip: pin, port };
  } catch { return { mode: 'unknown', reason: 'daemon-placement-unavailable' }; }
}

export const PEER_PROBE_HEADER = 'x-total-recall-health-probe';
// Mesh peers can be a WAN hop away: anything under 10 s reported a reachable
// cloud peer as down. The deadline stays; only the request path stops waiting.
export const PEER_PROBE_TIMEOUT_MS = 10000;
export const PEER_REFRESH_AFTER_MS = 5000;
export const PEER_OBSERVATION_MAX_AGE_MS = 30000;
const peerObservations = new Map();
const peerInflight = new Map();

/**
 * One credential-free look at the configured leader's /health. The marker
 * header asks a peer that understands it to answer from its own process only,
 * so a probed node never probes its own leader. A peer that predates the marker
 * simply ignores it; its observation of this node is non-blocking too, so a
 * reciprocal pin still cannot chain requests.
 */
async function probeLeader(url, fetchImpl, timeoutMs) {
  const failure = (status, reason) => ({ status, reason });
  try {
    // Never send this brain's PAT, cookies or any other credential to a peer,
    // and never follow redirects.
    const response = await fetchStartup(url, { redirect: 'error', credentials: 'omit',
      headers: { [PEER_PROBE_HEADER]: 'peer' } }, fetchImpl, timeoutMs);
    if (!response.ok) return failure('failed', 'leader-health-http-failure');
    let body;
    try { body = await response.json(); }
    catch { return failure('unknown', 'unrecognized-leader-health'); }
    const verdict = healthVerdict(body);
    if (verdict.status !== 'ready' || body.status !== 'healthy') {
      return failure(verdict.status === 'ready' ? 'degraded' : verdict.status, verdict.reason || 'leader-reports-degraded');
    }
    // A peer's own delegated report cannot prove this endpoint runs the worker.
    if (body.daemon_observation && (body.daemon_observation.source !== 'local-pid' || body.daemon_observation.status !== 'running')) {
      return failure('unknown', 'leader-daemon-unverified');
    }
    return body.daemon === 'running' ? { status: 'running' } : failure('failed', 'leader-daemon-not-running');
  } catch { return failure('offline', 'leader-health-unreachable'); }
}

function startPeerRefresh(url, { fetchImpl, timeoutMs, now, cache, inflight }) {
  const key = url.origin;
  if (inflight.has(key)) return inflight.get(key);
  const pending = probeLeader(url, fetchImpl, timeoutMs).then(verdict => {
    const entry = { at: now(), verdict };
    cache.set(key, entry);
    return entry;
  }).finally(() => inflight.delete(key));
  inflight.set(key, pending);
  return pending;
}

/**
 * Peer observation for a request path that must not wait on the network.
 * It answers at once from the last real observation and refreshes in the
 * background. With no observation yet it says so (warming); once an observation
 * is too old to trust it says that too. It never serves a stale success.
 */
function cachedPeerObservation(url, options) {
  const { now, cache, refreshAfterMs, maxAgeMs } = options;
  const hit = cache.get(url.origin);
  const age = hit ? now() - hit.at : null;
  if (!hit || age >= refreshAfterMs) void startPeerRefresh(url, options);
  if (!hit) return { status: 'unknown', reason: 'leader-observation-warming', warming: true };
  const seen = { observed_at: new Date(hit.at).toISOString(), age_ms: age };
  if (age > maxAgeMs) return { status: 'unknown', reason: 'leader-observation-stale', stale: true, last_status: hit.verdict.status, ...seen };
  return { ...hit.verdict, cached: true, ...seen };
}

const placementObservations = new Map();
const placementInflight = new Map();

/**
 * Resolve the configured placement off the request path. Discovery loads plugin
 * modules and reads Mesh state, which can wait on the network on a cold start, so
 * it starts after the current request has been answered and fills a cache.
 */
function startPlacementRefresh(key, { placement, brainDir, cwd, now, placements, placementPending }) {
  if (placementPending.has(key)) return;
  const pending = new Promise(resolve => setImmediate(resolve))
    .then(() => placement(brainDir, { cwd }))
    .catch(() => ({ mode: 'unknown', reason: 'daemon-placement-unavailable' }))
    .then(value => { placements.set(key, { at: now(), value }); })
    .finally(() => placementPending.delete(key));
  placementPending.set(key, pending);
}

/**
 * Effective worker readiness, separate from the strict local lock observation.
 * Used only by startup/status/health; never authorizes local process lifecycle.
 * The local process is always read live and synchronously. By default placement
 * and the peer are read live too (startup check, status). A long-running server
 * passes `nonBlocking`: placement discovery and the peer probe both run in the
 * background, so a slow Mesh or peer can never hold up its own /health. Until
 * placement is known, the report is the strict local observation, marked
 * `warming`; a conflicting or unidentifiable local process is never hidden.
 */
export async function observeRuntimeDaemon(brainDir, { identity = processIdentity, localObservation,
  placement = configuredDaemonPlacement, fetchImpl = fetch, cwd = process.cwd(),
  peerTimeoutMs = PEER_PROBE_TIMEOUT_MS, nonBlocking = false, now = Date.now,
  refreshAfterMs = PEER_REFRESH_AFTER_MS, maxAgeMs = PEER_OBSERVATION_MAX_AGE_MS,
  cache = peerObservations, inflight = peerInflight,
  placements = placementObservations, placementPending = placementInflight } = {}) {
  const local = localObservation ?? observeDaemon(brainDir, { identity });
  let owner;
  if (nonBlocking) {
    const key = `${brainDir}\0${cwd}`;
    const hit = placements.get(key);
    const age = hit ? now() - hit.at : null;
    if (!hit || age >= refreshAfterMs) startPlacementRefresh(key, { placement, brainDir, cwd, now, placements, placementPending });
    if (!hit || age > maxAgeMs) {
      return { ...local, local, placement: { mode: 'unknown' }, warming: !hit, stale: Boolean(hit),
        placement_reason: hit ? 'daemon-placement-stale' : 'daemon-placement-warming' };
    }
    owner = hit.value;
  } else {
    try { owner = await placement(brainDir, { cwd }); }
    catch { owner = { mode: 'unknown', reason: 'daemon-placement-unavailable' }; }
  }
  if (owner?.mode === 'local') return local;
  const result = { status: 'unknown', source: 'configured-leader-health',
    scope: 'configured-background-worker-only; no cross-brain synchronization verified', local,
    placement: owner?.mode === 'remote' ? { mode: 'remote', ip: owner.ip, port: owner.port } : { mode: 'unknown' } };
  // Delegation never conceals a live foreign or unidentifiable local process.
  if (['conflict', 'unknown'].includes(local.status)) return { ...local, local, placement: result.placement };
  if (owner?.mode !== 'remote' || isIP(owner.ip) !== 4 || !Number.isInteger(owner.port) || owner.port < 1 || owner.port > 65535) {
    return { ...result, reason: owner?.reason || 'configured-leader-unverified' };
  }
  const url = new URL(`http://${owner.ip}:${owner.port}/health`);
  result.owner_url = url.origin;
  const options = { fetchImpl, timeoutMs: peerTimeoutMs, now, cache, inflight, refreshAfterMs, maxAgeMs };
  if (nonBlocking) return { ...result, ...cachedPeerObservation(url, options) };
  const entry = await startPeerRefresh(url, options);
  return { ...result, ...entry.verdict, observed_at: new Date(entry.at).toISOString(), cached: false, age_ms: 0 };
}

/**
 * Whose daemon a status report is looking at, when the command line and the server are two installs.
 *
 * On a systemd host they always are: server-release requires the unit to run from a checkout apart
 * from the installed package. The server starts its daemon from that checkout, so the installed
 * command saw a healthy daemon as a foreign program and reported a conflict on every run, and an
 * agent reading that report offered to stop it. When the server on this host reports the same PID
 * and entry as its own running daemon, the daemon is that server's, and status says so.
 * For display only. Lifecycle reads the strict observation and still refuses another install's daemon.
 */
export function daemonOwnedByLocalServer(observation, health) {
  const served = health?.daemon_observation?.local ?? health?.daemon_observation;
  const local = observation?.local ? daemonOwnedByLocalServer(observation.local, health) : undefined;
  const nested = local ? { local } : {};
  if (observation?.status !== 'conflict' || observation.reason !== 'foreign-pid' || !observation.entry
      || served?.status !== 'running' || served.source !== 'local-pid'
      || served.pid !== observation.pid || served.entry !== observation.entry) {
    return local ? { ...observation, ...nested } : observation;
  }
  const { reason: _reason, ...rest } = observation;
  return { ...rest, ...nested, status: 'running', expected_entry: served.entry,
    cli_expected_entry: observation.expected_entry, verified_by: 'local-server-health' };
}

export function daemonStatusString({ status }) {
  return status === 'not-started' ? 'not_started' : status === 'stopped' ? 'dead' : status;
}

/** Keep the server's own readiness separate from overall worker readiness. */
export function runtimeHealthFields(daemonObservation, serverReady) {
  const daemon = daemonStatusString(daemonObservation);
  const placementKnown = daemonObservation.placement?.mode !== 'unknown'
    && !daemonObservation.warming && !daemonObservation.stale;
  return { status: serverReady && daemon === 'running' && placementKnown ? 'healthy' : 'degraded',
    server_ready: serverReady, daemon, daemon_observation: daemonObservation };
}

export function healthVerdict(body) {
  if (!body || typeof body.version !== 'string' || !Number.isFinite(body.uptime_seconds)
      || !Object.hasOwn(body, 'embedding_coverage') || !Object.hasOwn(body, 'daemon') || !body.vfs) {
    return { status: 'unknown', reason: 'unrecognized-health-response' };
  }
  if (body.vfs.exists !== true || body.vfs.skill_exists !== true) return { status: 'degraded', reason: 'vfs-unavailable' };
  // New health responses distinguish a usable server from missing worker
  // readiness, so ensure can recover a stopped local daemon without concealing
  // unrelated server failures. Older degraded responses stay failures.
  if (body.status !== 'healthy' && !(body.status === 'degraded' && body.server_ready === true)) return { status: 'degraded', reason: 'server-reports-degraded' };
  return { status: 'ready', version: body.version };
}

/** A server older than the code beside it: healthy, and not what was installed. */
export function serverCodeDrift(running, onDisk) {
  if (!running || !onDisk || running === onDisk) return null;
  return { running, on_disk: onDisk };
}

function packageVersionOnDisk() {
  try { return JSON.parse(fs.readFileSync(path.join(packageRoot, 'package.json'), 'utf8')).version; } catch { return null; }
}

export function appVerdict(result) {
  if (result.reason || result.code !== 0) return { status: 'failed', reason: result.reason || 'check-exit-failed' };
  let body;
  try { body = JSON.parse(result.output); } catch { return { status: 'unknown', reason: 'invalid-check-json' }; }
  return body?.ok === true && ['ready', 'healthy', 'running'].includes(body.status)
    ? { status: 'ready' } : { status: 'failed', reason: 'app-not-ready' };
}

function projectCommand(cwd, name) {
  const reserved = new Set(Object.keys(CLI_COMMANDS));
  if (reserved.has(name) || !/^[a-z][a-z0-9-]{0,63}$/.test(name || '')) return false;
  const file = path.join(cwd, '.agent', 'commands', name + '.mjs');
  try { return fs.statSync(file).isFile() && fs.realpathSync(file).startsWith(fs.realpathSync(cwd) + path.sep) ? file : false; } catch { return false; }
}

// Retry only transport failures, once. HTTP/auth failures are returned unchanged.
export async function fetchStartup(url, options = {}, fetchImpl = fetch, timeoutMs = 10000) {
  for (let attempt = 0; attempt < 2; attempt++) {
    try { return await fetchImpl(url, { ...options, signal: AbortSignal.timeout(timeoutMs) }); }
    catch (error) { if (attempt === 1) throw error; }
  }
}

export async function startupHealth({ cwd = process.cwd(), brainDir, brainUrl = null, token = null, brainId = null, ensure = false,
  appCheck = null, appStart = null, run = runBounded, fetchImpl = fetch, onDiskVersion = packageVersionOnDisk, listener = verifyListener, platform = process.platform, home = os.homedir(), identity = processIdentity,
  dashboardCheck = null, pluginChecks = null, daemonPlacement = configuredDaemonPlacement } = {}) {
  const actions = [];
  const serverFile = path.join(brainDir, 'server.pid');
  const report = { checked_at: new Date().toISOString(), server: { status: 'not-configured' }, brain: { status: 'unknown' }, daemon: { status: 'unknown' },
    ssss: { status: 'unknown', role: 'document-engine-tooling; no standalone daemon required' }, app: { status: 'not-declared' }, actions };
  let local = false, remoteDaemon = { status: 'unknown', source: 'remote-health' };
  try { const url = new URL(brainUrl); local = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname); if (url.username || url.password || !['http:', 'https:'].includes(url.protocol)) throw new Error(); }
  catch { brainUrl = null; }
  const probeServer = async () => {
    if (!brainUrl) return { status: 'not-configured' };
    try {
      const response = await fetchStartup(new URL('/health', brainUrl), { headers: token ? { Authorization: `Bearer ${token}` } : {}, redirect: 'error' }, fetchImpl);
      if (!response.ok) return { status: 'failed', reason: 'health-http-failure' };
      const body = await response.json();
      const verdict = healthVerdict(body);
      remoteDaemon = { status: body.daemon === 'running' ? 'running' : ['dead', 'stopped', 'not-started'].includes(body.daemon) ? 'stopped' : 'unknown', source: 'remote-health' };
      if (local) {
        const own = identity(serverFile, path.join(packageRoot, 'src', 'server', 'index.mjs'));
        if (own.status !== 'running') {
          const actualRoot = own.entry?.endsWith(path.join('src', 'server', 'index.mjs'))
            ? path.resolve(path.dirname(own.entry), '../..') : null;
          return { status: own.status === 'conflict' ? 'conflict' : 'unknown',
            reason: actualRoot ? `server runs from ${actualRoot}; expected ${packageRoot}; run total-recall server ensure` : 'server-process-unverified' };
        }
        if (!await listener(own.pid, new URL(brainUrl), { run, cwd })) return { status: 'unknown', reason: 'server-listener-unverified' };
      }
      const drift = local && verdict.status === 'ready' ? serverCodeDrift(verdict.version, onDiskVersion()) : null;
      return { ...verdict, ...(drift ? { stale: drift } : {}), source: local ? 'local-verified-listener' : 'remote-health' };
    } catch { return { status: 'offline', reason: 'health-unreachable' }; }
  };
  report.server = await probeServer();
  const probeDaemon = () => observeRuntimeDaemon(brainDir, { identity, placement: daemonPlacement, fetchImpl, cwd });
  report.daemon = local ? await probeDaemon() : remoteDaemon;
  const serverIdentity = local ? identity(serverFile, path.join(packageRoot, 'src', 'server', 'index.mjs')) : null;
  if (ensure && local && report.server.status === 'offline' && ['not-started', 'stopped'].includes(serverIdentity.status)) {
    const plist = path.join(home, 'Library', 'LaunchAgents', 'com.totalrecall.server.plist');
    if (platform === 'darwin' && fs.existsSync(plist)) {
      let started = await run('launchctl', ['start', 'com.totalrecall.server'], { cwd });
      if (started.code !== 0) started = await run('launchctl', ['load', plist], { cwd });
      actions.push({ component: 'server', action: 'existing-user-service-start', accepted: started.code === 0 && !started.reason });
      if (started.code === 0 && !started.reason) for (let i = 0; i < 10; i++) {
        report.server = await probeServer(); if (report.server.status !== 'offline') break;
        await new Promise(resolve => setTimeout(resolve, 300));
      }
    } else actions.push({ component: 'server', action: 'not-started', reason: 'no-existing-user-service' });
  }
  if (ensure && local && report.server.status === 'ready' && report.daemon.source === 'local-pid' && !report.daemon.placement && ['not-started', 'stopped'].includes(report.daemon.status)) {
    // Delegate lifecycle to the existing CLI. Never restart a live/unknown process.
    if (platform === 'linux' && fs.existsSync('/run/systemd/system')) actions.push({ component: 'daemon', action: 'not-started', reason: 'system-service-needs-owning-deploy' });
    else {
      const result = await run(process.execPath, [cliEntry, 'daemon', 'start'], { cwd });
      actions.push({ component: 'daemon', action: 'cli-start', accepted: result.code === 0 && !result.reason });
      for (let i = 0; i < 10; i++) {
        report.daemon = await probeDaemon(); if (report.daemon.status === 'running') break;
        await new Promise(resolve => setTimeout(resolve, 200));
      }
    }
  }
  if (brainUrl) {
    try {
      const url = new URL('/api/instructions', brainUrl);
      if (brainId) url.searchParams.set('brain', brainId);
      const response = await fetchStartup(url, { headers: token ? { Authorization: `Bearer ${token}` } : {}, redirect: 'error' }, fetchImpl);
      if (!response.ok) report.brain = { status: 'failed', reason: `instructions-http-${response.status}` };
      else {
        const text = await response.text();
        const type = response.headers?.get?.('content-type') || '';
        let valid = text.trim().length > 0 && !type.includes('html') && !/^\s*<(?:!doctype|html)/i.test(text);
        if (type.includes('json')) { try { const body = JSON.parse(text); valid = typeof body.content === 'string' && body.content.length > 0; } catch { valid = false; } }
        report.brain = { status: valid ? 'ready' : 'unknown', scope: 'instructions-access-only; selected project identity not independently verified', reason: valid ? undefined : 'unrecognized-instructions-response' };
      }
    } catch { report.brain = { status: 'offline', reason: 'instructions-unreachable' }; }
  }
  // SSSS is tooling that may be vendored by the project under test, installed
  // alongside this package, or only on PATH. Searching `cwd` alone reported a
  // working install as `unavailable` whenever the operator ran the check from
  // anywhere other than a repository root, which made `shared_ready` depend on
  // the caller's directory rather than on the machine.
  const candidates = [
    path.join(cwd, 'ssss'),
    path.join(cwd, 'node_modules', '.bin', 'ssss'),
    path.join(packageRoot, 'node_modules', '.bin', 'ssss'),
    path.join(packageRoot, '..', '.bin', 'ssss'),
  ];
  const tool = candidates.find(file => { try { fs.accessSync(file, fs.constants.X_OK); return fs.statSync(file).isFile(); } catch { return false; } }) || 'ssss';
  const tooling = await run(tool, ['--help'], { cwd });
  report.ssss = { status: tooling.code === 0 && !tooling.reason && /ssss/i.test(tooling.output) ? 'available' : 'unavailable', role: report.ssss.role };
  const runApp = async name => {
    const file = projectCommand(cwd, name);
    if (!file) return { code: 1, reason: 'invalid-current-repo-command', output: '' };
    const invoke = `import { pathToFileURL } from 'node:url'; const file = process.argv[1]; const name = process.argv[2]; const handler = await import(pathToFileURL(file)); if (typeof handler.run === 'function') await handler.run([process.execPath,file,name,'--json']); else if (typeof handler.default === 'function') await handler.default(['--json']); else throw new Error('Missing command handler');`;
    return run(process.execPath, ['--input-type=module', '-e', invoke, file, name], { cwd });
  };
  if (appCheck) {
    if (!projectCommand(cwd, appCheck)) report.app = { status: 'not-configured', reason: 'check-not-current-repo-command' };
    else {
      report.app = appVerdict(await runApp(appCheck));
      if (ensure && report.app.status !== 'ready' && appStart && projectCommand(cwd, appStart)) {
        const started = await runApp(appStart);
        actions.push({ component: 'app', action: 'declared-command-start', accepted: started.code === 0 && !started.reason });
        report.app = appVerdict(await runApp(appCheck));
      }
    }
  }
  const { inspectRequiredPlugins } = await import('./required-plugins.mjs');
  report.required_plugins = inspectRequiredPlugins(brainDir);
  // Reported, not part of readiness: a stale dashboard or unfinished work still
  // leaves the runtime usable, but neither may stay invisible.
  report.dashboard = await (dashboardCheck ?? defaultDashboardCheck)();
  report.plugin_checks = await (pluginChecks ?? (async () => {
    const { runPluginStartupChecks } = await import('./plugin-startup-checks.mjs');
    return runPluginStartupChecks({ cwd });
  }))();
  report.shared_ready = report.required_plugins.status === 'ready' && report.server.status === 'ready' && report.brain.status === 'ready' && report.daemon.status === 'running' && report.ssss.status === 'available';
  report.ready_scope = appCheck ? 'shared-and-declared-current-repo-app' : 'shared-runtime-only';
  report.ready = report.shared_ready && (!appCheck || report.app.status === 'ready');
  return report;
}
