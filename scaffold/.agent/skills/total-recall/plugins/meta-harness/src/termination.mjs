/** Stop agents first. Let the operation save its work and return before the process exits. */
import { cancelExecution, cancellationResult } from './worker.mjs';
import { removeActiveWorktrees } from './worktree.mjs';
import { failOpenThreads } from './coordinator.mjs';

const SIGNALS = { SIGTERM: 143, SIGINT: 130, SIGHUP: 129 };
let installed = false;

export function stopOnTermination({ graceMs = 500 } = {}) {
  if (installed) return;
  installed = true;
  for (const [signal, code] of Object.entries(SIGNALS)) process.on(signal, () => {
    if (cancellationResult()) return;
    cancelExecution(signal, graceMs);
    process.exitCode = code;
  });
  // Also cover callers that use the lifecycle helper without the CLI wrapper.
  process.once('beforeExit', () => { if (cancellationResult()) finishCancellation(); });
}

export function finishCancellation(result) {
  const cancelled = cancellationResult();
  if (!cancelled) return result;
  const saved = removeActiveWorktrees({ preserveChanges: true });
  failOpenThreads('The run was cancelled.');
  process.exitCode = cancelled.exitCode;
  return { ...result, ...cancelled, ...(saved.length ? { saved } : {}) };
}
