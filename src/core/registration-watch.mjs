/**
 * registration-watch — arm the server to approve the next device that asks.
 *
 * The pairing UI was built backwards: it minted a key, drew a QR nobody can
 * scan (no Tailscale client scans QR codes to authenticate — tailscale#8267,
 * #13377, #14184 are still open feature requests), and asked the user to carry
 * a 40-character secret from a laptop to a phone by hand.
 *
 * The direction that actually works is the reverse. The device generates a
 * registration id and waits; the server approves it. Done as a watcher this is
 * a single button: arm it, sign in on the phone, and it connects with nothing
 * typed or copied anywhere.
 *
 * The constraint is that headscale exposes no pending-registration API — the
 * entry lives in an in-memory cache and is visible only in the server's log
 * output. So watch mode needs a log source, and where none is configured this
 * module reports `unavailable` rather than pretending: the UI then falls back
 * to pasting the id by hand.
 *
 * Nothing here names a host. The log command comes from configuration.
 */
import { execFile } from 'node:child_process';
import { logger } from './logger.mjs';

/** headscale prints the id in the register URL; this is the only shape we need. */
const AUTH_ID = /hskey-authreq-[A-Za-z0-9._-]+/g;

const DEFAULT_TTL_MS = 5 * 60 * 1000;
const POLL_MS = 2000;
// The registration cache entry only lives while the client holds the request
// open, so a slow poll is the difference between catching it and missing it.
const MAX_TTL_MS = 15 * 60 * 1000;

/** @type {{state: string, since: number, expiresAt: number, id: string|null, node: object|null, error: string|null, timer: any}|null} */
let current = null;
// The terminal result must outlive the watch. The UI learns the outcome by
// polling, so discarding it on stop meant a device could join and the page
// would only ever see 'idle' -- a success nobody is told about.
let last = null;

/**
 * Where to read headscale's log output from.
 *
 * Resolution order, all configuration — never a hardcoded host:
 *   1. TR_HEADSCALE_LOG_CMD  — an explicit shell command
 *   2. the `headscale_log_command` field on the stored headscale API key
 *
 * @returns {Promise<{cmd: string} | null>}
 */
export async function resolveLogSource(brainDir, { findMeta } = {}) {
  const fromEnv = (process.env.TR_HEADSCALE_LOG_CMD || '').trim();
  if (fromEnv) return { cmd: fromEnv, origin: 'TR_HEADSCALE_LOG_CMD' };
  try {
    const lookup = findMeta || (await import('./headscale-client.mjs')).findHeadscaleKeyMeta;
    const meta = await lookup(brainDir);
    const cmd = (meta?.headscale_log_command || '').trim();
    if (cmd) return { cmd, origin: 'headscale key config' };
  } catch {
    /* not configured */
  }
  return null;
}

/** Run the configured log command and return its output. */
function readLog(cmd, { timeoutMs = 8000 } = {}) {
  return new Promise((resolve) => {
    // Shell form is required: operators configure things like
    // `ssh host 'docker logs --since 2m headscale'`.
    execFile('/bin/sh', ['-c', cmd], { timeout: timeoutMs, maxBuffer: 8 * 1024 * 1024 }, (err, stdout, stderr) => {
      if (err && !stdout) return resolve({ ok: false, error: (stderr || err.message || '').slice(0, 300) });
      resolve({ ok: true, text: `${stdout || ''}\n${stderr || ''}` });
    });
  });
}

/** Newest registration id in a chunk of log text, or null. */
export function latestAuthId(text) {
  const found = String(text || '').match(AUTH_ID);
  return found && found.length ? found[found.length - 1] : null;
}

export function getWatchStatus() {
  if (!current) return last || { state: 'idle' };
  const { timer, ...rest } = current;
  return { ...rest, remaining_ms: Math.max(0, current.expiresAt - Date.now()) };
}

/** Forget the last terminal result, so a new watch starts from a clean slate. */
export function clearWatchResult() {
  last = null;
}

export function stopWatch(state = 'stopped') {
  if (!current) {
    const prior = last || { state: 'idle' };
    last = null;
    return prior.state === 'idle' ? prior : { ...prior, state: 'stopped' };
  }
  clearTimeout(current.timer);
  const { timer, ...rest } = current;
  const final = { ...rest, state, remaining_ms: 0 };
  current = null;
  // Keep registered/expired so the UI can report it; a manual stop is not news.
  last = state === 'stopped' ? null : final;
  return final;
}

/**
 * Arm the watcher.
 *
 * @param {object} opts
 * @param {string} opts.brainDir
 * @param {number} [opts.ttlMs]
 * @param {(id: string) => Promise<object>} opts.register  approve one id
 * @param {() => Promise<{cmd: string}|null>} [opts.logSource]
 */
export async function startWatch({ brainDir, ttlMs, register, logSource } = {}) {
  if (current) return { ...getWatchStatus(), already_running: true };
  last = null;

  const resolve = logSource || (() => resolveLogSource(brainDir));
  const source = await resolve();
  if (!source) {
    return {
      state: 'unavailable',
      error:
        'Watch mode needs to read the headscale server log, and no log source is configured. '
        + 'headscale has no pending-registration API, so there is nowhere else to see a device waiting. '
        + 'Set TR_HEADSCALE_LOG_CMD (for example a command that tails the headscale service on its host), '
        + 'or paste the code from the device instead.',
    };
  }

  const ttl = Math.min(Math.max(Number(ttlMs) || DEFAULT_TTL_MS, 30_000), MAX_TTL_MS);
  // Ids already in the log are from earlier attempts. headscale has forgotten
  // them, so approving one always fails -- and worse, it would consume the
  // watch and report success on a device that never connected.
  const seed = await readLog(source.cmd);
  const seen = new Set();
  if (seed.ok) {
    for (const id of String(seed.text).match(AUTH_ID) || []) seen.add(id);
  }

  current = {
    state: 'watching',
    since: Date.now(),
    expiresAt: Date.now() + ttl,
    id: null,
    node: null,
    error: seed.ok ? null : `log source failed: ${seed.error}`,
    source: source.origin,
    ignored_existing: seen.size,
    timer: null,
  };

  const tick = async () => {
    if (!current || current.state !== 'watching') return;
    if (Date.now() >= current.expiresAt) {
      logger.info('registration-watch', 'watch expired with no new device');
      stopWatch('expired');
      return;
    }
    const out = await readLog(source.cmd);
    if (out.ok) {
      const ids = (String(out.text).match(AUTH_ID) || []).filter((id) => !seen.has(id));
      if (ids.length) {
        const id = ids[ids.length - 1];
        seen.add(id);
        current.id = id;
        try {
          const node = await register(id);
          current.node = node;
          logger.info('registration-watch', `approved ${node?.name || 'device'} from watch`);
          stopWatch('registered');
          return;
        } catch (err) {
          // A failure here is usually the cache having already dropped it.
          // Keep watching: the next sign-in attempt produces a fresh id.
          current.error = err?.message || 'register failed';
          logger.warn('registration-watch', `approve failed for ${id}: ${current.error}`);
        }
      }
    } else {
      current.error = `log source failed: ${out.error}`;
    }
    current.timer = setTimeout(tick, POLL_MS);
    current.timer.unref?.();
  };

  current.timer = setTimeout(tick, POLL_MS);
  current.timer.unref?.();
  return getWatchStatus();
}
