/**
 * Replace the brain server on this host with no gap.
 *
 * Runs on the node and is called by `total-recall deploy` through the mesh. The server is
 * one process on a fixed port and the old one cannot cooperate, so traffic moves in the
 * kernel: a nat rule rewrites the port of new connections, connections already open stay
 * where they are, and the client's address is unchanged, so loopback and mesh callers are
 * still recognized for what they are.
 *
 *   stage   Start the release on the next port from its verified install, and check it.
 *   switch  Rewrite new connections to it, in one transaction.
 *   retire  Replace the home unit behind the rule, take the rule away, stop the staged one.
 *
 * Nothing stays behind: the host ends with the same unit on the same port and no rule. The
 * rule and this file's state are gone after a reboot, and the unit then starts normally.
 * If the new home instance does not verify, traffic stays on the staged one.
 */
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { randomInt } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const moduleRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

export const HOME_UNIT = 'total-recall-server.service';
export const BRIDGE_UNIT = 'total-recall-server-bridge.service';
export const CONVERGE_UNIT = 'total-recall-server-converge.service';
export const SWAP_CHAIN = 'TR_SERVER_SWAP';
/** Below the default ephemeral range, so no ordinary client can land here by chance. */
export const PROBE_SOURCE_PORTS = [30000, 30999];

const IPV4 = /^\d{1,3}(?:\.\d{1,3}){3}$/;

// ─── Rules ──────────────────────────────────────────────────────────────────────

/**
 * Applied with `iptables-restore --noflush`, so both directions flip in one transaction.
 * The nat table is consulted only for a packet creating a new connection, and DNAT with no
 * address changes only the port. Local probes return early so they can reach the home port
 * behind the rule.
 */
export function swapOnRules({ addresses, homePort, bridgePort }) {
  if (!addresses.length) throw new Error('No listening address to move.');
  return [
    '*nat',
    `:${SWAP_CHAIN} - [0:0]`,
    `-A ${SWAP_CHAIN} -p tcp -s 127.0.0.1 --sport ${PROBE_SOURCE_PORTS[0]}:${PROBE_SOURCE_PORTS[1]} -j RETURN`,
    ...addresses.map((address) => `-A ${SWAP_CHAIN} -p tcp -d ${address} --dport ${homePort} -j DNAT --to-destination :${bridgePort}`),
    `-I PREROUTING 1 -j ${SWAP_CHAIN}`,
    `-I OUTPUT 1 -j ${SWAP_CHAIN}`,
    'COMMIT',
    '',
  ].join('\n');
}

export function swapOffRules() {
  return ['*nat', `-D PREROUTING -j ${SWAP_CHAIN}`, `-D OUTPUT -j ${SWAP_CHAIN}`, `-F ${SWAP_CHAIN}`, `-X ${SWAP_CHAIN}`, 'COMMIT', ''].join('\n');
}

// ─── Reading the host ───────────────────────────────────────────────────────────

/** `Environment=` as `systemctl show` prints it: space separated, quoted when a value has spaces. */
export function parseEnvironment(value = '') {
  const environment = {};
  for (const match of value.matchAll(/"([^"]*)"|(\S+)/g)) {
    const pair = match[1] ?? match[2];
    const at = pair.indexOf('=');
    if (at > 0) environment[pair.slice(0, at)] = pair.slice(at + 1);
  }
  return environment;
}

/** Local addresses from `ss -ltnH`. */
export function parseListeners(text = '') {
  return text.split('\n').map((line) => line.trim().split(/\s+/)[3]).filter(Boolean)
    .map((local) => local.slice(0, local.lastIndexOf(':')));
}

function run(ctx, binary, args, { input, timeout = 30000 } = {}) {
  const result = ctx.exec(binary, args, { encoding: 'utf8', timeout, input, maxBuffer: 4 * 1024 * 1024 });
  return { ok: result.status === 0, stdout: String(result.stdout || ''), stderr: String(result.stderr || ''), error: result.error };
}

function must(ctx, binary, args, options) {
  const result = run(ctx, binary, args, options);
  if (!result.ok) throw new Error(`${binary} ${args[0] || ''} failed: ${(result.stderr || result.error?.message || 'no output').trim().slice(-400)}`);
  return result.stdout;
}

export function readHomeUnit(ctx) {
  const shown = {};
  for (const line of must(ctx, 'systemctl', ['show', HOME_UNIT, '-p', 'LoadState', '-p', 'ActiveState', '-p', 'MainPID', '-p', 'WorkingDirectory', '-p', 'Environment']).split('\n')) {
    const at = line.indexOf('=');
    if (at > 0) shown[line.slice(0, at)] = line.slice(at + 1);
  }
  if (shown.LoadState !== 'loaded') throw new Error(`${HOME_UNIT} is not installed on this host, and this runner replaces only that unit.`);
  const environment = parseEnvironment(shown.Environment);
  const port = Number(environment.PORT);
  if (!Number.isInteger(port) || port < 1) throw new Error(`${HOME_UNIT} sets no PORT.`);
  return { active: shown.ActiveState === 'active', mainPid: Number(shown.MainPID), workingDirectory: shown.WorkingDirectory, environment, port };
}

const unitActive = (ctx, unit) => run(ctx, 'systemctl', ['is-active', '--quiet', unit]).ok;
const chainExists = (ctx) => run(ctx, 'iptables', ['-t', 'nat', '-S', SWAP_CHAIN]).ok;
const applyRules = (ctx, rules) => must(ctx, 'iptables-restore', ['--noflush'], { input: rules });
const listeners = (ctx, port) => parseListeners(must(ctx, 'ss', ['-ltnH', `sport = :${port}`]));
const established = (ctx, port) => must(ctx, 'ss', ['-tnH', 'state', 'established', `sport = :${port}`]).split('\n').filter(Boolean).length;

/** Ask an instance over HTTP. A local probe stays on a loopback source so `requireAuthOrLocal` accepts it. */
export function httpProbe({ host = '127.0.0.1', port, path: target, exempt = false, timeoutMs = 5000 }) {
  return new Promise((resolve, reject) => {
    const source = exempt ? { localAddress: '127.0.0.1', localPort: randomInt(PROBE_SOURCE_PORTS[0], PROBE_SOURCE_PORTS[1] + 1) } : {};
    const request = http.get({ host, port, path: target, agent: false, timeout: timeoutMs, ...source }, (response) => {
      let text = '';
      response.setEncoding('utf8');
      response.on('data', (chunk) => { text += chunk; });
      response.on('end', () => {
        try { resolve({ status: response.statusCode, body: JSON.parse(text) }); } catch { resolve({ status: response.statusCode, body: null }); }
      });
    });
    request.on('timeout', () => request.destroy(new Error(`No answer from ${host}:${port} within ${timeoutMs} ms`)));
    request.on('error', reject);
  });
}

async function deployment(ctx, target) {
  const { status, body } = await ctx.probe({ path: '/health/deployment', ...target });
  return status === 200 && body?.status === 'ok' ? body : null;
}

async function waitFor(ctx, description, ms, check) {
  const deadline = ctx.now() + ms;
  let last;
  for (;;) {
    try {
      const value = await check();
      if (value) return value;
      last = undefined;
    } catch (error) { last = error; }
    if (ctx.now() >= deadline) throw new Error(`${description} did not happen within ${Math.round(ms / 1000)} s${last ? `: ${last.message}` : ''}`);
    await ctx.sleep(ctx.pollMs);
  }
}

/** Wait for open connections to finish. Streams that never do are closed at the deadline and reconnect. */
async function drain(ctx, port) {
  const deadline = ctx.now() + ctx.drainMs;
  for (;;) {
    const open = established(ctx, port);
    if (open === 0 || ctx.now() >= deadline) return open;
    await ctx.sleep(ctx.pollMs);
  }
}

function readState(ctx) {
  try { return JSON.parse(ctx.fs.readFileSync(ctx.stateFile, 'utf8')); } catch { return null; }
}

function writeState(ctx, state) {
  const temporary = `${ctx.stateFile}.${process.pid}.tmp`;
  ctx.fs.writeFileSync(temporary, JSON.stringify(state, null, 2));
  ctx.fs.renameSync(temporary, ctx.stateFile);
}

function stopBridge(ctx) {
  run(ctx, 'systemctl', ['stop', BRIDGE_UNIT], { timeout: 60000 });
  run(ctx, 'systemctl', ['reset-failed', BRIDGE_UNIT]);
}

// ─── Stage ──────────────────────────────────────────────────────────────────────

function assertCheckoutCanMove(ctx, unit, version) {
  const directory = unit.workingDirectory;
  const real = (file) => { try { return ctx.fs.realpathSync(file); } catch { return file; } };
  if (real(directory) === real(ctx.packageRoot)) throw new Error('The replacement must be an install separate from the checkout the server runs from.');
  if (!ctx.fs.existsSync(path.join(directory, '.git'))) throw new Error(`${directory} is not a git checkout, so it cannot follow a release.`);
  const current = JSON.parse(ctx.fs.readFileSync(path.join(directory, 'package.json'), 'utf8'));
  if (current.name !== ctx.pkg.name) throw new Error(`${directory} holds ${current.name}, not ${ctx.pkg.name}.`);
  if (current.version !== version && must(ctx, 'git', ['-C', directory, 'status', '--porcelain']).trim()) {
    throw new Error(`${directory} has uncommitted changes, so it could not move to ${version}. Nothing was changed.`);
  }
}

/**
 * The rule only leaves open connections alone because conntrack already knows them. Proved on a
 * real kernel: with tracking off, the first packet of a connection opened before the rule counts
 * as new, gets rewritten to the staged port, and the client receives a reset.
 */
function assertConnectionsTracked(ctx) {
  let tracked = 0;
  try { tracked = Number(ctx.fs.readFileSync(ctx.conntrackCountFile, 'utf8')); } catch { /* not loaded */ }
  if (!(tracked > 0)) throw new Error('Connection tracking is not active on this host, so moving traffic would reset every open connection. Nothing was changed.');
}

function assertMaintenanceIdle(ctx, brainDir) {
  const lock = path.join(brainDir, 'memory-derived', 'automatic-brain-updates.json.lock');
  if (!ctx.fs.existsSync(lock)) return;
  const pid = Number(ctx.fs.readFileSync(lock, 'utf8'));
  if (pid && ctx.isAlive(pid)) throw new Error(`Maintenance is running (PID ${pid}). Stage again when it finishes.`);
}

export async function stage(input, ctx) {
  const { version, slot, operationKey } = input;
  const deploymentId = `${ctx.pkg.name}@${version}`;
  const receipt = (state) => ({ operationKey, verified: true, isolated: true, slot, version, deploymentId, port: state.bridgePort, healthUrl: state.healthUrl });
  if (ctx.pkg.version !== version) throw new Error(`This install is ${ctx.pkg.version}. Install ${ctx.pkg.name}@${version} on this host, then stage again.`);
  if (chainExists(ctx)) throw new Error('A swap is in progress: traffic is on the staged server. Finish it with deploy retire.');

  const previous = readState(ctx);
  if (unitActive(ctx, BRIDGE_UNIT)) {
    const staged = previous && await deployment(ctx, { port: previous.bridgePort }).catch(() => null);
    if (staged?.deploymentId === deploymentId && previous.deploymentId === deploymentId) return receipt(previous);
    throw new Error(`${BRIDGE_UNIT} is already running something else. Stop it before staging ${version}.`);
  }

  const unit = readHomeUnit(ctx);
  const homePort = unit.port;
  const bridgePort = homePort + 1;
  const home = await ctx.probe({ port: homePort, path: '/health', timeoutMs: 15000 }).catch(() => null);
  const agentDir = home?.body?.vfs?.path;
  if (!agentDir) throw new Error(`Nothing answers on port ${homePort}, so there is no server to replace. Start ${HOME_UNIT} first.`);
  assertMaintenanceIdle(ctx, path.join(agentDir, 'skills', 'total-recall'));
  assertCheckoutCanMove(ctx, unit, version);
  assertConnectionsTracked(ctx);
  const addresses = listeners(ctx, homePort);
  const unsupported = addresses.filter((address) => !IPV4.test(address) || address === '0.0.0.0');
  if (!addresses.length || unsupported.length) throw new Error(`Cannot move port ${homePort}: it listens on ${addresses.join(', ') || 'nothing'}, and only specific IPv4 addresses are handled.`);
  if (listeners(ctx, bridgePort).length) throw new Error(`Port ${bridgePort} is in use, and the staged server needs it.`);

  const environment = {
    ...unit.environment,
    NODE_ENV: 'production',
    PORT: String(bridgePort),
    AGENT_DIR: agentDir,
    DISABLE_DAEMON: 'true',
    TR_MONITOR_PORT: '0',
    TR_PACKAGE_ROOT: ctx.packageRoot,
    TR_SERVER_PID_FILE: `${path.dirname(ctx.stateFile)}/total-recall-server-bridge.pid`,
  };
  run(ctx, 'systemctl', ['reset-failed', BRIDGE_UNIT]);
  must(ctx, 'systemd-run', [
    '--unit', BRIDGE_UNIT,
    '--collect',
    '--description=Total Recall brain server, staged for a swap',
    `--working-directory=${unit.workingDirectory}`,
    '-p', 'Restart=on-failure',
    '-p', 'RestartSec=2',
    ...Object.entries(environment).map(([key, value]) => `--setenv=${key}=${value}`),
    ctx.nodePath,
    path.join(ctx.packageRoot, 'src', 'server', 'index.mjs'),
  ]);
  try {
    await waitFor(ctx, `Version ${version} answering on port ${bridgePort}`, ctx.bootMs, async () => {
      const staged = await deployment(ctx, { port: bridgePort });
      return staged?.deploymentId === deploymentId && addresses.every((address) => listeners(ctx, bridgePort).includes(address));
    });
    const stagedHealth = await ctx.probe({ port: bridgePort, path: '/health', timeoutMs: 15000 });
    if (stagedHealth.body?.vfs?.path !== agentDir) throw new Error(`The staged server opened ${stagedHealth.body?.vfs?.path}, not ${agentDir}.`);
  } catch (error) {
    stopBridge(ctx);
    throw error;
  }
  const state = {
    version,
    deploymentId,
    name: ctx.pkg.name,
    homePort,
    bridgePort,
    addresses,
    healthUrl: `http://${addresses.find((address) => address !== '127.0.0.1') || '127.0.0.1'}:${bridgePort}/health/deployment`,
    liveUrl: `http://${addresses.find((address) => address !== '127.0.0.1') || '127.0.0.1'}:${homePort}/health/deployment`,
    phase: 'staged',
  };
  writeState(ctx, state);
  return receipt(state);
}

// ─── Switch ─────────────────────────────────────────────────────────────────────

export async function switchTraffic(input, ctx) {
  const { slot, deploymentId, previousDeploymentId, operationKey } = input;
  const state = readState(ctx);
  if (!state || state.deploymentId !== deploymentId) throw new Error('No staged release matches this switch. Stage it first.');
  const staged = await deployment(ctx, { port: state.bridgePort }).catch(() => null);
  if (staged?.deploymentId !== deploymentId) throw new Error(`The staged server is not answering on port ${state.bridgePort}. Nothing was switched.`);

  if (!chainExists(ctx)) {
    if (!previousDeploymentId) {
      // The first managed release has no previous slot. Name what is really serving so it retires too.
      const home = await ctx.probe({ port: state.homePort, path: '/health', timeoutMs: 15000 });
      if (!home.body?.version) throw new Error(`Port ${state.homePort} did not report what it serves. Nothing was switched.`);
      state.displaced = { version: home.body.version, deploymentId: `${state.name}@${home.body.version}`, port: state.homePort };
    }
    applyRules(ctx, swapOnRules(state));
  }
  try {
    for (const host of state.addresses) {
      const seen = await deployment(ctx, { host, port: state.homePort });
      if (seen?.pid !== staged.pid) throw new Error(`${host}:${state.homePort} is served by PID ${seen?.pid}, not the staged PID ${staged.pid}.`);
    }
  } catch (error) {
    applyRules(ctx, swapOffRules());
    throw new Error(`Traffic did not reach the staged server, so the rule was removed. ${error.message}`);
  }
  state.phase = 'switched';
  writeState(ctx, state);
  return { operationKey, verified: true, graceful: true, activeSlot: slot, deploymentId, ...(state.displaced ? { displaced: state.displaced } : {}) };
}

// ─── Retire ─────────────────────────────────────────────────────────────────────

/** Long work runs in its own unit: it must outlive a mesh call and the server being replaced. */
export async function retire(input, ctx) {
  const { deploymentId, operationKey } = input;
  const state = readState(ctx);
  if (!state || !['switched', 'converged'].includes(state.phase)) throw new Error('No switched release to retire behind.');
  const job = state.converge;
  if (job?.status === 'done') {
    return { operationKey, verified: true, deploymentId, stopped: true, filesRemoved: true, drained: true, closedConnections: job.closedConnections ?? 0, activePort: state.homePort, activeHealthUrl: state.liveUrl };
  }
  if (unitActive(ctx, CONVERGE_UNIT)) return { operationKey, pending: true, phase: job?.phase || 'starting' };
  if (job?.status === 'failed' && !job.reported) {
    state.converge = { ...job, reported: true };
    writeState(ctx, state);
    throw new Error(`${job.phase}: ${job.error}. Traffic stays on the staged server. Retire again to retry.`);
  }
  state.converge = { status: 'running', phase: 'starting' };
  writeState(ctx, state);
  run(ctx, 'systemctl', ['reset-failed', CONVERGE_UNIT]);
  must(ctx, 'systemd-run', ['--unit', CONVERGE_UNIT, '--collect', '--description=Total Recall brain server swap', ctx.nodePath, ctx.entry, 'converge']);
  return { operationKey, pending: true, phase: 'starting' };
}

/** Replace the home unit behind the rule. Traffic leaves the staged server only after the new home verifies. */
export async function converge(ctx) {
  const state = readState(ctx);
  if (!state) throw new Error('No swap state on this host.');
  const update = (fields) => { state.converge = { ...state.converge, ...fields }; writeState(ctx, state); };
  update({ status: 'running', phase: 'starting', error: null, reported: false });
  try {
    const unit = readHomeUnit(ctx);
    const already = await deployment(ctx, { port: state.homePort, exempt: true }).catch(() => null);
    if (already?.deploymentId !== state.deploymentId) {
      update({ phase: 'draining the old server' });
      const closedConnections = await drain(ctx, state.homePort);
      update({ phase: 'stopping the old server', closedConnections });
      must(ctx, 'systemctl', ['stop', HOME_UNIT], { timeout: 180000 });
      update({ phase: 'moving the checkout' });
      await ctx.moveCheckout({ directory: unit.workingDirectory, name: state.name, version: state.version, artifactRoot: ctx.packageRoot, exec: ctx.exec });
      update({ phase: 'starting the new server' });
      must(ctx, 'systemctl', ['start', HOME_UNIT], { timeout: 60000 });
    }
    const home = await waitFor(ctx, `${HOME_UNIT} reporting ${state.version}`, ctx.homeBootMs, async () => {
      const seen = await deployment(ctx, { port: state.homePort, exempt: true });
      return seen?.deploymentId === state.deploymentId ? seen : null;
    });
    update({ phase: 'waiting for the daemon' });
    await waitFor(ctx, 'The daemon running under the new server', ctx.daemonMs, async () => {
      const health = await ctx.probe({ port: state.homePort, path: '/health', exempt: true, timeoutMs: 15000 });
      return health.body?.daemon === 'running';
    });

    update({ phase: 'moving traffic home' });
    const mainPid = readHomeUnit(ctx).mainPid;
    if (home.pid !== mainPid) throw new Error(`Port ${state.homePort} is served by PID ${home.pid}, not ${HOME_UNIT}'s PID ${mainPid}.`);
    if (chainExists(ctx)) applyRules(ctx, swapOffRules());
    try {
      for (const host of state.addresses) {
        const seen = await deployment(ctx, { host, port: state.homePort });
        if (seen?.pid !== home.pid) throw new Error(`${host}:${state.homePort} is served by PID ${seen?.pid}, not ${home.pid}.`);
      }
    } catch (error) {
      applyRules(ctx, swapOnRules(state));
      throw error;
    }

    update({ phase: 'draining the staged server' });
    const stagedOpen = await drain(ctx, state.bridgePort);
    update({ phase: 'stopping the staged server' });
    stopBridge(ctx);
    if (unitActive(ctx, BRIDGE_UNIT)) throw new Error(`${BRIDGE_UNIT} did not stop.`);
    state.phase = 'converged';
    update({ status: 'done', phase: 'done', closedConnections: (state.converge.closedConnections ?? 0) + stagedOpen });
  } catch (error) {
    update({ status: 'failed', error: error.message });
    throw error;
  }
  return state.converge;
}

/** Move the checkout while nothing runs from it. The dashboard is not in git, so it comes from the verified install. */
export async function moveCheckout({ directory, name, version, artifactRoot, exec }) {
  const current = JSON.parse(fs.readFileSync(path.join(directory, 'package.json'), 'utf8')).version;
  if (current !== version) {
    const { updateSourceBrainPackage } = await import('./source-brain-updates.mjs');
    const moved = updateSourceBrainPackage({ directory, name, version, exec });
    if (!moved.ok) throw new Error(`The checkout could not move to ${version}: ${moved.error}`);
  }
  const dist = path.join(artifactRoot, 'frontend', 'dist');
  if (!fs.existsSync(dist)) return;
  const target = path.join(directory, 'frontend', 'dist');
  const temporary = `${target}.${process.pid}`;
  fs.cpSync(dist, temporary, { recursive: true });
  fs.rmSync(target, { recursive: true, force: true });
  fs.renameSync(temporary, target);
}

// ─── Status and entry point ─────────────────────────────────────────────────────

export async function status(ctx) {
  const unit = readHomeUnit(ctx);
  const state = readState(ctx);
  const home = await ctx.probe({ port: unit.port, path: '/health', exempt: true, timeoutMs: 15000 }).catch(() => null);
  return {
    install: { name: ctx.pkg.name, version: ctx.pkg.version, root: ctx.packageRoot },
    home: { unit: HOME_UNIT, active: unit.active, mainPid: unit.mainPid, port: unit.port, directory: unit.workingDirectory, version: home?.body?.version ?? null, daemon: home?.body?.daemon ?? null, listening: listeners(ctx, unit.port) },
    rule: chainExists(ctx),
    staged: unitActive(ctx, BRIDGE_UNIT),
    converging: unitActive(ctx, CONVERGE_UNIT),
    swap: state,
  };
}

export function hostContext(overrides = {}) {
  return {
    exec: spawnSync,
    probe: httpProbe,
    fs,
    sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
    now: Date.now,
    isAlive: (pid) => { try { process.kill(pid, 0); return true; } catch { return false; } },
    moveCheckout,
    stateFile: '/run/total-recall-server-release.json',
    conntrackCountFile: '/proc/sys/net/netfilter/nf_conntrack_count',
    packageRoot: moduleRoot,
    pkg: JSON.parse(fs.readFileSync(path.join(moduleRoot, 'package.json'), 'utf8')),
    nodePath: process.execPath,
    entry: path.join(moduleRoot, 'bin', 'total-recall-server-release.mjs'),
    pollMs: 1000,
    bootMs: 25000,
    homeBootMs: 180000,
    daemonMs: 120000,
    drainMs: 30000,
    ...overrides,
  };
}

const HELP = `
  total-recall-server-release — replace the brain server on this host with no gap

  Called on the node by 'total-recall deploy' through the mesh. Linux with systemd only.
  Run it through 'total-recall deploy release <version> --adapter-secret <reference>'.

  Usage:
    total-recall-server-release status            Read the swap state; changes nothing
    total-recall-server-release stage <payload>   Start the release on the next port and verify it
    total-recall-server-release switch <payload>  Move new connections to it
    total-recall-server-release retire <payload>  Replace the home unit, then move traffic home
    total-recall-server-release converge          The detached work behind retire

  A payload is base64url JSON from the deploy plugin.
`;

/** Prints one JSON document on stdout, which is what the deploy plugin reads through the mesh. */
export async function main(argv, { write = (text) => process.stdout.write(text), makeContext = hostContext, platform = process.platform } = {}) {
  const [operation, payload, ...extra] = argv;
  if (!operation || operation === '--help' || operation === '-h') { write(HELP); return 0; }
  const handlers = { status: (_input, ctx) => status(ctx), converge: (_input, ctx) => converge(ctx), stage, switch: switchTraffic, retire };
  const answer = (document) => write(`${JSON.stringify(document)}\n`);
  if (!Object.hasOwn(handlers, operation)) { answer({ verified: false, error: `Unknown operation: ${operation}` }); return 1; }
  const takesPayload = ['stage', 'switch', 'retire'].includes(operation);
  if (extra.length || (!takesPayload && payload)) { answer({ verified: false, error: `Unexpected argument: ${extra[0] || payload}` }); return 1; }
  if (platform !== 'linux') { answer({ verified: false, error: 'This runner needs Linux with systemd and iptables.' }); return 1; }
  let input = {};
  if (takesPayload) {
    try { input = JSON.parse(Buffer.from(String(payload), 'base64url').toString('utf8')); } catch { answer({ verified: false, error: 'The payload is not base64url JSON.' }); return 1; }
  }
  try {
    answer(await handlers[operation](input, makeContext()));
    return 0;
  } catch (error) {
    answer({ operationKey: input.operationKey, verified: false, error: error.message });
    return 1;
  }
}
