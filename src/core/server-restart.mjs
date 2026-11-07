/**
 * server-restart — restart the brain server so freshly installed code is the
 * code that is actually running.
 *
 * Updating did not restart anything. `POST /api/update/run` installed
 * total-recall-brain@latest and returned a summary; the server kept serving the
 * modules Node had already loaded, and the update banner cleared — so a finished
 * update looked identical to a running one. Only the daemon had a restart
 * control; the server had none.
 *
 * The hard rule here: NEVER exit unless a supervisor will bring us back.
 * Exiting an unsupervised server is not a restart, it is an outage, so
 * supervision is proven (the job's reported PID is ours) rather than assumed.
 */
import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { processIdentity } from './startup-health.mjs';
import { runningServerStatus } from './running-server.mjs';

const GLOBAL_PACKAGE = 'total-recall-brain';
const HOLD_LIMIT_MS = 6 * 60 * 60 * 1000;

const LAUNCHD_LABELS = ['com.totalrecall.brain', 'com.totalrecall.server'];
const SYSTEMD_UNITS = ['total-recall-server', 'total-recall-server.service'];

function launchdPidFor(label) {
  try {
    const out = execFileSync('launchctl', ['list', label], { encoding: 'utf8', stdio: 'pipe' });
    const m = out.match(/"PID"\s*=\s*(\d+)/);
    return m ? Number(m[1]) : null;
  } catch {
    return null;
  }
}

function systemdPidFor(unit) {
  for (const scope of [['--user'], []]) {
    try {
      const out = execFileSync('systemctl', [...scope, 'show', '-p', 'MainPID', '--value', unit], {
        encoding: 'utf8',
        stdio: 'pipe',
      });
      const pid = Number(String(out).trim());
      if (pid > 0) return { pid, scope: scope.length ? 'user' : 'system' };
    } catch {
      /* unit not present in this scope */
    }
  }
  return null;
}

/**
 * Prove that a supervisor owns THIS process and will restart it.
 * `scope` says whose supervisor it is: `user` belongs to one login, `system` to the machine.
 * @returns {{supervised: boolean, kind: string|null, label: string|null, scope: string|null, reason: string}}
 */
export function detectSupervisor(pid = process.pid) {
  // An explicit opt-in for hosts running under a supervisor we cannot query
  // (docker restart policies, pm2, runit). The operator asserts respawn.
  if (process.env.TR_SUPERVISED === '1') {
    return { supervised: true, kind: 'declared', label: 'TR_SUPERVISED=1', scope: null, reason: 'declared by operator' };
  }
  if (process.platform === 'darwin') {
    for (const label of LAUNCHD_LABELS) {
      const jobPid = launchdPidFor(label);
      if (jobPid === pid) {
        // launchctl answers for the caller's domain, so as root this is a system daemon.
        const scope = process.getuid?.() === 0 ? 'system' : 'user';
        return { supervised: true, kind: 'launchd', label, scope, reason: `launchd job ${label} owns pid ${pid}` };
      }
    }
    return { supervised: false, kind: null, label: null, scope: null, reason: 'no launchd job reports this pid' };
  }
  for (const unit of SYSTEMD_UNITS) {
    const found = systemdPidFor(unit);
    if (found && found.pid === pid) {
      return { supervised: true, kind: 'systemd', label: unit, scope: found.scope, reason: `systemd ${found.scope} unit ${unit} owns pid ${pid}` };
    }
  }
  return { supervised: false, kind: null, label: null, scope: null, reason: 'no systemd unit reports this pid' };
}

/**
 * Schedule a graceful self-restart.
 *
 * Sends SIGTERM to ourselves rather than calling process.exit, so the existing
 * shutdown path runs: the HTTP server drains, background work finishes, and the
 * server PID lock is RELEASED. Skipping that lock release would leave the
 * respawned instance hitting the singleton guard and exiting immediately —
 * turning a restart into a permanent stop.
 *
 * The delay lets the HTTP response flush before the socket goes away.
 *
 * @returns {{scheduled: boolean, supervisor: object, delayMs?: number, reason?: string}}
 */
export function requestSelfRestart({ delayMs = 750, force = false } = {}) {
  const supervisor = detectSupervisor();
  if (!supervisor.supervised && !force) {
    return {
      scheduled: false,
      supervisor,
      reason:
        'refusing to exit: no supervisor would restart this process, so exiting would take the server down permanently. '
        + 'Run it under launchd/systemd, or set TR_SUPERVISED=1 if another supervisor guarantees respawn.',
    };
  }
  const timer = setTimeout(() => {
    process.kill(process.pid, 'SIGTERM');
  }, delayMs);
  timer.unref?.();
  return { scheduled: true, supervisor, delayMs };
}

/**
 * The version recorded in a package root's manifest, read from DISK rather than
 * from the ESM import cache.
 *
 * This is how we decide whether an update actually replaced the code backing
 * this process. `summary.updated > 0` cannot answer that: it counts registered
 * projects, and updating some other project's node_modules is no reason to
 * bounce this server. Comparing the manifest on disk against the version this
 * process booted with is directly observable and right in every install shape —
 * source tree (never changes from an npm install, so no restart), or a package
 * installed under a consumer repo (npm replaces the directory we are running
 * from, so restart).
 *
 * @param {string} rootDir package root to read
 * @returns {string|null}
 */
export function packageVersionOnDisk(rootDir) {
  try {
    const raw = fs.readFileSync(path.join(rootDir, 'package.json'), 'utf8');
    return JSON.parse(raw).version || null;
  } catch {
    return null;
  }
}

/**
 * Can maintenance replace the server on this host, and how?
 *
 * `npm install --global` moves the files under a running server and nothing else
 * moves the process, so a host that serves from that install stays on the release it
 * booted on. Replacing it has a gap, so maintenance does it only where a gap is allowed
 * and a restart is certain to help:
 *   - a per-user supervisor owns the process. A LaunchAgent or user unit belongs to one
 *     login; a system service is production, and `deploy release` replaces that with no gap.
 *   - the process runs the global install's entry, and that install is not a checkout
 *     (auto-pull owns a checkout) and is at the release. Otherwise a restart starts the
 *     same old code, or code nobody released.
 *
 * @returns {{method: 'restart', kind: string, label: string, pid: number}|{method: 'deploy'|'none', reason: string}}
 */
export function planServerReplacement({ brainDir, globalRoot, latest, env = process.env, identity = processIdentity, supervisor = detectSupervisor, versionOnDisk = packageVersionOnDisk } = {}) {
  const leave = (reason, method = 'none') => ({ method, reason });
  if (env.TR_SERVER_AUTO_RESTART === '0') return leave('TR_SERVER_AUTO_RESTART=0 leaves this server to the operator.');
  if (!globalRoot) return leave('The global npm root could not be read, so what a restart would start is unknown.');
  const install = path.join(globalRoot, GLOBAL_PACKAGE);
  const observed = identity(path.join(brainDir, 'server.pid'), path.join(install, 'src', 'server', 'index.mjs'));
  if (!observed.pid) return leave('The process serving this brain could not be identified.');
  const owner = supervisor(observed.pid);
  if (owner.supervised && owner.scope === 'system') return leave(`${owner.label} is a system service: replace it with total-recall deploy release.`, 'deploy');
  if (observed.status !== 'running') return leave(`The server does not run from the global install${observed.entry ? ` (it runs ${observed.entry})` : ''}, so a restart would not bring it to the release.`);
  if (fs.existsSync(path.join(install, '.git'))) return leave('The global install is a link to a git checkout, which auto-pull keeps current.');
  const onDisk = versionOnDisk(install);
  if (onDisk !== latest) return leave(`The global install is ${onDisk ?? 'unreadable'} and the release is ${latest}.`);
  if (!owner.supervised || owner.scope !== 'user') return leave(`Nothing maintenance can drive would bring the server back: ${owner.reason}.`);
  return { method: 'restart', kind: owner.kind, label: owner.label, pid: observed.pid };
}

/** Connections open to the server right now, or null when that cannot be read. */
export function openServerConnections({ pid, port, platform = process.platform, run = spawnSync } = {}) {
  const options = { encoding: 'utf8', timeout: 10000 };
  if (platform === 'linux') {
    const result = run('ss', ['-tnH', 'state', 'established', 'sport', '=', `:${port}`], options);
    if (result.error || result.status !== 0) return null;
    return result.stdout.split('\n').filter((line) => line.trim()).length;
  }
  const result = run('lsof', ['-nP', '-a', '-p', String(pid), '-iTCP', '-sTCP:ESTABLISHED', '-Fn'], options);
  if (result.error) return null;
  // lsof exits 1 when nothing matches, and also on a real failure, which is the one that writes to stderr.
  if (result.status !== 0 && (result.stdout?.trim() || result.stderr?.trim())) return null;
  return (result.stdout || '').split('\n').filter((line) => line.startsWith('n') && line.split('->')[0].endsWith(`:${port}`)).length;
}

/** The command that stops the server and starts it again, or null when the job is not there. */
function restartCommand(plan, { run, uid }) {
  if (plan.kind === 'systemd') return ['systemctl', ['--user', 'restart', plan.label]];
  // `gui` exists while the user is logged in; a Mac with no login session has only `user`.
  const target = [`gui/${uid}/${plan.label}`, `user/${uid}/${plan.label}`]
    .find((candidate) => run('launchctl', ['print', candidate], { encoding: 'utf8', timeout: 10000 }).status === 0);
  // kickstart -k delivers SIGTERM and waits (measured, launchd does not document it), so the
  // server drains and releases its PID lock, and it needs no KeepAlive to come back.
  return target ? ['launchctl', ['kickstart', '-k', target]] : null;
}

/**
 * Bring a stale server to the release, when `planServerReplacement` allows it.
 *
 * An open connection holds this back so nobody's work is cut off, for as long as
 * `holdLimitMs`: an open dashboard tab must not keep a host on an old release forever.
 * Replaced means /health reports the release, never that the command returned.
 *
 * @returns the server status to report, with `replacement` saying what happened.
 */
export async function replaceStaleServer({
  brainDir, server, globalRoot, previous, uid = process.getuid?.(), plan = planServerReplacement, connections = openServerConnections,
  run = spawnSync, observe = runningServerStatus, sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)), now = Date.now,
  idleWaitMs = 30000, healthWaitMs = 120000, pollMs = 2000, holdLimitMs = HOLD_LIMIT_MS,
} = {}) {
  let replacement;
  try {
    replacement = plan({ brainDir, globalRoot, latest: server.latest });
    if (replacement.method !== 'restart') return { ...server, replacement };

    const port = new URL(server.url).port;
    const idleBy = now() + idleWaitMs;
    let open = connections({ pid: replacement.pid, port });
    while (open !== 0 && now() < idleBy) {
      await sleep(pollMs);
      open = connections({ pid: replacement.pid, port });
    }
    if (open !== 0) {
      const heldSince = previous?.replacement?.state === 'held' ? previous.replacement.held_since : now();
      if (now() - heldSince < holdLimitMs) {
        const reason = open === null ? 'Open connections could not be read.' : `${open} connection(s) are open on the server.`;
        return { ...server, replacement: { ...replacement, state: 'held', held_since: heldSince, reason } };
      }
    }

    const command = restartCommand(replacement, { run, uid });
    if (!command) return { ...server, replacement: { ...replacement, state: 'failed', reason: `launchd has no job ${replacement.label} for this user.` } };
    const restarted = run(command[0], command[1], { encoding: 'utf8', timeout: 60000 });
    if (restarted.error || restarted.status !== 0) {
      const reason = `${command[0]} ${command[1].join(' ')} failed: ${restarted.error?.message || restarted.stderr?.trim() || `exit ${restarted.status}`}`;
      return { ...server, replacement: { ...replacement, state: 'failed', reason } };
    }

    const healthyBy = now() + healthWaitMs;
    let after;
    do {
      await sleep(pollMs);
      after = await observe({ brainDir, latest: server.latest, timeoutMs: 5000 });
    } while (after.status !== 'current' && now() < healthyBy);
    if (after.status === 'current') return { ...after, replacement: { ...replacement, state: 'replaced', from: server.running } };
    return { ...after, replacement: { ...replacement, state: 'failed', reason: `/health did not report ${server.latest} within ${healthWaitMs / 1000} seconds of the restart.` } };
  } catch (error) {
    return { ...server, replacement: { ...replacement, state: 'failed', reason: error.message } };
  }
}
