/**
 * Deciding whether a PID lock is real.
 *
 * A lock file records the PID of the running server, and the obvious liveness
 * test is `process.kill(pid, 0)` — it throws if nothing is there. What it
 * cannot tell you is *what* is there. PIDs are recycled, aggressively so after
 * a reboot, and the number in a stale lock file is as likely to belong to a
 * system daemon as to anything of ours. Observed in the wild: a lock left
 * pointing at PID 445, which the OS had since handed to `metrickitd`. The
 * liveness check passed, the server exited with "another server instance is
 * already running", and it did so on every boot from then on — an outage with
 * an error message that sent you looking for a process that was never there.
 *
 * So liveness is necessary but not sufficient: the process has to look like the
 * program that wrote the lock before the lock is honored. Shared by the server
 * and the daemon, which had the same check and therefore the same bug.
 */

import { spawnSync } from 'node:child_process';
import path from 'node:path';

/**
 * The tail of an entry path (`server/index.mjs`, `core/daemon-loop.mjs`),
 * derived from the caller's own module URL rather than written down, so it stays
 * correct wherever the package is installed and hardcodes no checkout location.
 */
export function entryPathHint(entryPath) {
  return path.join(path.basename(path.dirname(entryPath)), path.basename(entryPath));
}

/** Read a process's command line, or null when it cannot be determined. */
export function readProcessCommand(pid) {
  try {
    const res = spawnSync('ps', ['-o', 'command=', '-p', String(pid)], {
      encoding: 'utf8',
      timeout: 5_000,
    });
    if (res.status !== 0 || !res.stdout) return null;
    return res.stdout.trim() || null;
  } catch {
    return null;
  }
}

/**
 * Should the lock held by `pid` block startup?
 *
 * `isAlive` and `readCommand` are injected so the decision can be tested
 * without spawning processes or guessing at PIDs.
 */
export function shouldHonorPidLock(pid, { isAlive, readCommand, entryHint }) {
  if (!pid || !Number.isInteger(pid) || pid <= 0) return { honor: false, reason: 'invalid-pid' };
  if (!isAlive(pid)) return { honor: false, reason: 'dead' };

  const command = readCommand(pid);
  // Without a readable command line we cannot distinguish a real instance from
  // a recycled number. Honor the lock: a refusal to start is recoverable by
  // deleting the file, whereas two servers sharing one brain is not.
  if (!command) return { honor: true, reason: 'alive-command-unknown' };

  if (!command.includes(entryHint)) {
    return { honor: false, reason: 'pid-reused', command };
  }
  return { honor: true, reason: 'alive-and-ours', command };
}
