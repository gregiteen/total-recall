/** A stopped run takes its agents, checkouts, unfinished branches and open threads with it. */
import { stopActiveProcesses } from './worker.mjs';
import { removeActiveWorktrees } from './worktree.mjs';
import { failOpenThreads } from './coordinator.mjs';

const SIGNALS = { SIGTERM: 143, SIGINT: 130, SIGHUP: 129 };
let installed = false;

export function stopOnTermination({ graceMs = 500 } = {}) {
  if (installed) return;
  installed = true;
  let stopping = false;
  for (const [signal, code] of Object.entries(SIGNALS)) process.on(signal, () => {
    if (stopping) return;
    stopping = true;
    stopActiveProcesses('SIGTERM');
    setTimeout(() => {
      stopActiveProcesses('SIGKILL');
      removeActiveWorktrees();
      failOpenThreads();
      process.exit(code);
    }, graceMs);
  });
}
