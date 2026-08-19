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
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

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
 * @returns {{supervised: boolean, kind: string|null, label: string|null, reason: string}}
 */
export function detectSupervisor(pid = process.pid) {
  // An explicit opt-in for hosts running under a supervisor we cannot query
  // (docker restart policies, pm2, runit). The operator asserts respawn.
  if (process.env.TR_SUPERVISED === '1') {
    return { supervised: true, kind: 'declared', label: 'TR_SUPERVISED=1', reason: 'declared by operator' };
  }
  if (process.platform === 'darwin') {
    for (const label of LAUNCHD_LABELS) {
      const jobPid = launchdPidFor(label);
      if (jobPid === pid) {
        return { supervised: true, kind: 'launchd', label, reason: `launchd job ${label} owns pid ${pid}` };
      }
    }
    return { supervised: false, kind: null, label: null, reason: 'no launchd job reports this pid' };
  }
  for (const unit of SYSTEMD_UNITS) {
    const found = systemdPidFor(unit);
    if (found && found.pid === pid) {
      return { supervised: true, kind: 'systemd', label: unit, reason: `systemd ${found.scope} unit ${unit} owns pid ${pid}` };
    }
  }
  return { supervised: false, kind: null, label: null, reason: 'no systemd unit reports this pid' };
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
