/**
 * Whether a PID lock is believed.
 *
 * The case that motivated this: a lock file left holding PID 445, which the OS
 * had since reassigned to a macOS system daemon. The old check asked only
 * whether *something* was alive at that number, so the server exited with
 * "another server instance is already running" on every single boot, pointing
 * at a process that had nothing to do with it.
 */
import { describe, expect, it } from 'vitest';
import { entryPathHint, shouldHonorPidLock } from './pid-lock.mjs';

const ENTRY_HINT = 'server/index.mjs';
const OURS = '/usr/local/bin/node /opt/app/src/server/index.mjs';

function decide(pid, { alive = true, command = OURS } = {}) {
  return shouldHonorPidLock(pid, {
    isAlive: () => alive,
    readCommand: () => command,
    entryHint: ENTRY_HINT,
  });
}

describe('entryPathHint', () => {
  // Derived from the running file rather than written down, so it holds
  // wherever the package is installed and pins no checkout location.
  it('is the directory and file name of the entry point', () => {
    expect(entryPathHint('/anywhere/at/all/src/server/index.mjs')).toBe('server/index.mjs');
    expect(entryPathHint('/elsewhere/src/core/daemon-loop.mjs')).toBe('core/daemon-loop.mjs');
  });
});

// The daemon carried the same naive liveness check as the server, so it had the
// same failure: its lock file here pointed at a PID the OS had reassigned to an
// unrelated desktop app, which would have refused every start from then on.
describe('daemon locks', () => {
  const DAEMON_HINT = 'core/daemon-loop.mjs';

  it('releases a daemon lock whose PID now belongs to something else', () => {
    const verdict = shouldHonorPidLock(553, {
      isAlive: () => true,
      readCommand: () => '/Applications/Some.app/Contents/Frameworks/crashpad_handler',
      entryHint: DAEMON_HINT,
    });
    expect(verdict).toMatchObject({ honor: false, reason: 'pid-reused' });
  });

  it('honors a lock held by a real daemon', () => {
    const verdict = shouldHonorPidLock(777, {
      isAlive: () => true,
      readCommand: () => '/usr/local/bin/node /opt/app/src/core/daemon-loop.mjs',
      entryHint: DAEMON_HINT,
    });
    expect(verdict).toMatchObject({ honor: true, reason: 'alive-and-ours' });
  });
});

describe('shouldHonorPidLock', () => {
  it('honors a lock held by a live instance of this server', () => {
    expect(decide(1234)).toMatchObject({ honor: true, reason: 'alive-and-ours' });
  });

  it('releases a lock whose process is gone', () => {
    expect(decide(1234, { alive: false })).toMatchObject({ honor: false, reason: 'dead' });
  });

  // The bug, exactly: alive, but it is not us.
  it('releases a lock whose PID has been recycled by an unrelated program', () => {
    const verdict = decide(445, { command: '/usr/libexec/metrickitd' });
    expect(verdict).toMatchObject({ honor: false, reason: 'pid-reused' });
  });

  // Refusing to start is recoverable by deleting a file; two servers writing
  // one brain is not. So an unreadable command line keeps the lock.
  it('keeps the lock when the command line cannot be read', () => {
    expect(decide(1234, { command: null })).toMatchObject({
      honor: true,
      reason: 'alive-command-unknown',
    });
  });

  it('ignores a lock file that does not contain a usable PID', () => {
    expect(decide(Number.NaN)).toMatchObject({ honor: false, reason: 'invalid-pid' });
    expect(decide(0)).toMatchObject({ honor: false, reason: 'invalid-pid' });
    expect(decide(-1)).toMatchObject({ honor: false, reason: 'invalid-pid' });
  });

  it('is not fooled by a process that merely mentions node', () => {
    expect(decide(999, { command: '/usr/local/bin/node /opt/other/cli.mjs' })).toMatchObject({
      honor: false,
      reason: 'pid-reused',
    });
  });
});
