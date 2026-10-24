import { spawn } from 'node:child_process';
import path from 'node:path';

export const INVOKE_LIMITS = Object.freeze({ timeoutMs: 60000, outputBytes: 262144, concurrency: 4, perKey: 1 });

export class InvokeError extends Error {
  constructor(status, code, message, result = null) {
    super(message); this.status = status; this.code = code; this.result = result;
  }
}

/** Deliberate allowlist: no tokens, NODE_OPTIONS, preload hooks or secret-store selectors. */
export function invokeEnvironment(full, source = process.env) {
  const env = { FORCE_COLOR: '0', NO_COLOR: '1' };
  for (const name of ['PATH', 'LANG', 'LC_ALL', 'TZ', 'TMPDIR', 'SystemRoot']) {
    if (source[name]) env[name] = source[name];
  }
  // Full mode is intentionally trusted host administration, including the auth
  // owner's credential resolution. Ambient API keys still are not inherited.
  if (full) for (const name of ['HOME', 'USER', 'AGENT_DIR', 'TR_SECRETS_BRAIN', 'TR_SECRETS_PASSWORD']) {
    if (source[name]) env[name] = source[name];
  }
  return env;
}

/** Bounded direct-argv child; cancellation kills its POSIX process group. */
export async function executeInvokeChild({ entry, args = [], cwd, env, input, timeoutMs, signal,
  limits = INVOKE_LIMITS, nodeArgs = [] }) {
  if (process.platform === 'win32') throw new InvokeError(503, 'unsupported-platform', 'Process-group enforcement is unavailable on this platform.');
  const timeout = timeoutMs === undefined ? limits.timeoutMs : Number(timeoutMs);
  if (!Number.isFinite(timeout) || timeout <= 0) throw new InvokeError(400, 'invalid-timeout', 'timeoutMs must be positive and finite.');
  if (signal?.aborted) throw new InvokeError(403, 'authority-ended', 'Caller authority ended before execution.');
  return await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [...nodeArgs, entry, ...args], {
      cwd, env, shell: false, detached: true, stdio: ['pipe', 'pipe', 'pipe'],
    });
    const chunks = { stdout: [], stderr: [] };
    let bytes = 0, reason = null;
    const kill = why => {
      reason ||= why;
      if (child.pid) try { process.kill(-child.pid, 'SIGKILL'); } catch (err) {
        if (err.code !== 'ESRCH') child.kill('SIGKILL');
      }
    };
    const abort = () => kill('authority-ended');
    const timer = setTimeout(() => kill('timeout'), Math.min(timeout, limits.timeoutMs));
    signal?.addEventListener('abort', abort, { once: true });
    if (signal?.aborted) abort();
    for (const channel of ['stdout', 'stderr']) child[channel].on('data', chunk => {
      const remaining = Math.max(0, limits.outputBytes - bytes);
      if (remaining) chunks[channel].push(chunk.subarray(0, remaining));
      bytes += chunk.length;
      if (bytes > limits.outputBytes) kill('output-limit');
    });
    child.stdin.on('error', () => {}); // An early exit may close stdin first.
    child.stdin.end(input || '');
    child.once('error', () => {
      clearTimeout(timer); signal?.removeEventListener('abort', abort);
      reject(new InvokeError(503, 'spawn-failed', 'Execution could not start.'));
    });
    child.once('close', (code, terminationSignal) => {
      // Also retire descendants after a normally exiting parent.
      if (child.pid) try { process.kill(-child.pid, 'SIGKILL'); } catch {}
      clearTimeout(timer); signal?.removeEventListener('abort', abort);
      resolve({ exit_code: code, signal: terminationSignal, stdout: Buffer.concat(chunks.stdout).toString(),
        stderr: Buffer.concat(chunks.stderr).toString(), truncated: bytes > limits.outputBytes,
        timed_out: reason === 'timeout', termination_reason: reason });
    });
  });
}

export function requireSuccessfulRun(run) {
  if (run.exit_code !== 0 || run.termination_reason || run.truncated) {
    const code = run.termination_reason || 'nonzero-exit';
    throw new InvokeError(code === 'timeout' ? 504 : code === 'authority-ended' ? 403 : 422,
      code, 'Execution did not complete successfully.', run);
  }
  return run;
}

export function absoluteTarget(target, fallback) {
  if (target === undefined) return fallback;
  if (typeof target !== 'string' || !path.isAbsolute(target) || target.includes('\0')) {
    throw new InvokeError(400, 'invalid-target', 'Full developer target must be an absolute working directory.');
  }
  return target;
}
