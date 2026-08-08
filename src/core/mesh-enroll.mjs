/**
 * Automatic mesh node enrollment.
 *
 * Total Recall discovers mesh peers through the local Tailscale client, but a
 * node that has never authenticated to the control server is invisible to the
 * mesh. This module closes that gap: it reads local client state, and — when a
 * Headscale credential is configured — mints a short-lived pre-auth key and
 * brings the node up unattended. With no credential it still surfaces the
 * interactive registration URL so the dashboard always has a working path.
 *
 * Portability rules (open source): no control-server URL, hostname, or device
 * name is hardcoded. Everything is read from the local client, the operator's
 * secret entry, or environment variables.
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { logger } from './logger.mjs';
import {
  createHeadscalePreAuthKey,
  describeHeadscaleAvailability,
  headscaleUrlFromEnv,
  normalizeControlUrl,
  resolveHeadscaleUser,
} from './headscale-client.mjs';

/** Enrollment states surfaced to the API/UI. */
export const ENROLLMENT_STATES = Object.freeze({
  ENROLLED: 'enrolled',
  NEEDS_LOGIN: 'needs_login',
  STOPPED: 'stopped',
  CLIENT_UNAVAILABLE: 'client_unavailable',
  UNKNOWN: 'unknown',
});

/** macOS ships the CLI inside the app bundle; PATH-only lookup misses it. */
const FALLBACK_BINARIES = [
  '/usr/local/bin/tailscale',
  '/opt/homebrew/bin/tailscale',
  '/Applications/Tailscale.app/Contents/MacOS/Tailscale',
  '/usr/bin/tailscale',
];

const STATUS_TIMEOUT_MS = 5_000;
const UP_TIMEOUT_MS = 90_000;
const LOGIN_PROBE_TIMEOUT_MS = 15_000;

/** Auto-enrollment retry floor — a failing control server must not be hammered. */
const AUTO_RETRY_INTERVAL_MS = 10 * 60_000;

let lastAutoAttemptAt = 0;
let lastAutoResult = null;

/** Reset throttle state (tests, and after an explicit user-triggered enroll). */
export function resetAutoEnrollThrottle() {
  lastAutoAttemptAt = 0;
  lastAutoResult = null;
}

/** Resolve the Tailscale CLI, honoring an explicit override first. */
export function resolveTailscaleBinary() {
  const override = (process.env.TR_TAILSCALE_BIN || '').trim();
  if (override) return override;
  for (const candidate of FALLBACK_BINARIES) {
    try {
      if (fs.existsSync(candidate)) return candidate;
    } catch {
      // permission errors fall through to PATH lookup
    }
  }
  return 'tailscale';
}

function runTailscale(args, { timeout = STATUS_TIMEOUT_MS } = {}) {
  const result = spawnSync(resolveTailscaleBinary(), args, {
    encoding: 'utf8',
    timeout,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  return {
    ok: result.status === 0,
    status: result.status,
    stdout: result.stdout || '',
    stderr: result.stderr || '',
    error: result.error || null,
  };
}

/** Raw `tailscale status --json`, or null when the client is unavailable. */
export function readTailscaleStatus() {
  const res = runTailscale(['status', '--json']);
  if (!res.stdout) return null;
  try {
    return JSON.parse(res.stdout);
  } catch {
    return null;
  }
}

/**
 * Local client preferences. `ControlURL` here is how we learn which control
 * server this node already targets without hardcoding one.
 */
export function readTailscalePrefs() {
  const res = runTailscale(['debug', 'prefs']);
  if (!res.stdout) return null;
  try {
    return JSON.parse(res.stdout);
  } catch {
    return null;
  }
}

function classifyState(status, prefs) {
  if (!status) return ENROLLMENT_STATES.CLIENT_UNAVAILABLE;
  const backend = String(status.BackendState || '');
  if (backend === 'Running' && (status.TailscaleIPs || []).length) {
    return ENROLLMENT_STATES.ENROLLED;
  }
  if (backend === 'NeedsLogin' || prefs?.LoggedOut === true) {
    return ENROLLMENT_STATES.NEEDS_LOGIN;
  }
  if (backend === 'Stopped') return ENROLLMENT_STATES.STOPPED;
  if (backend === 'Starting') return ENROLLMENT_STATES.UNKNOWN;
  return ENROLLMENT_STATES.UNKNOWN;
}

/**
 * Which control server should this node use?
 * Explicit argument → environment → configured secret → whatever the local
 * client already points at. Never a compiled-in default.
 */
export function resolveLoginServer({ explicit, secretUrl, prefs } = {}) {
  const candidates = [explicit, headscaleUrlFromEnv(), secretUrl, prefs?.ControlURL];
  for (const candidate of candidates) {
    const value = normalizeControlUrl(candidate || '');
    if (value) return value;
  }
  return null;
}

/**
 * Full enrollment picture for the API/UI: local client state, whether an
 * unattended enrollment is possible, and the interactive URL if one is pending.
 */
export async function getEnrollmentStatus({ brainDir } = {}) {
  const status = readTailscaleStatus();
  const prefs = readTailscalePrefs();
  const state = classifyState(status, prefs);
  const headscale = await describeHeadscaleAvailability(brainDir);
  const loginServer = resolveLoginServer({ secretUrl: headscale.url, prefs });

  return {
    state,
    enrolled: state === ENROLLMENT_STATES.ENROLLED,
    backend_state: status?.BackendState || null,
    auth_url: status?.AuthURL || null,
    ips: status?.TailscaleIPs || [],
    hostname: status?.Self?.HostName || os.hostname(),
    login_server: loginServer,
    can_auto_enroll: headscale.configured && Boolean(loginServer),
    auto_enroll_blocked_reason: headscale.configured ? null : headscale.reason,
    auto_enroll_enabled: autoEnrollEnabled(),
    client_available: Boolean(status),
    checked_at: new Date().toISOString(),
  };
}

/** Operators can disable unattended enrollment entirely. */
export function autoEnrollEnabled() {
  const raw = String(process.env.TR_MESH_AUTO_ENROLL ?? '').trim().toLowerCase();
  if (raw === '0' || raw === 'false' || raw === 'off') return false;
  return true;
}

/**
 * Write the pre-auth key to a 0600 temp file so it can be passed as
 * `--auth-key file:<path>`. A key in argv is visible to every process on the
 * box via `ps`; a key in a mode-0600 temp file is not.
 */
function withAuthKeyFile(key, fn) {
  const file = path.join(
    fs.mkdtempSync(path.join(os.tmpdir(), 'tr-enroll-')),
    'authkey',
  );
  try {
    fs.writeFileSync(file, key, { mode: 0o600 });
    return fn(file);
  } finally {
    try {
      fs.rmSync(path.dirname(file), { recursive: true, force: true });
    } catch {
      // best effort — the key expires on its own
    }
  }
}

/**
 * Build `tailscale up` arguments.
 *
 * `tailscale up` refuses to run if any flag is passed and an *unmentioned*
 * setting would change from its current value to the flag default. So whenever
 * we pass a flag at all, we must re-state this node's existing settings.
 * We restate them explicitly (rather than conditionally) so a preference can
 * never silently flip: joining the mesh must not reconfigure the user's node.
 *
 * `reset: true` is the escape hatch for a setting we do not model — it clears
 * unmentioned settings to defaults, so the flags below are still re-stated.
 */
export function buildUpArgs({ loginServer, prefs, authKeyFile, reset = false }) {
  const args = ['up'];
  const current = normalizeControlUrl(prefs?.ControlURL || '');
  const target = normalizeControlUrl(loginServer || '');
  const repointing = Boolean(target) && target !== current;

  // No flags at all — resuming an already-configured node — keeps every
  // setting untouched and sidesteps the complete-set rule entirely.
  if (!repointing && !authKeyFile && !reset) return args;

  // `--reset` clears every unmentioned setting to its default, and ControlURL
  // is one of them: without restating it here, a reset silently repoints the
  // node at Tailscale SaaS and the control server rejects the pre-auth key.
  if (repointing || (reset && target)) args.push(`--login-server=${target}`);
  if (reset) args.push('--reset');

  if (prefs) {
    args.push(`--accept-routes=${prefs.RouteAll === true}`);
    args.push(`--accept-dns=${prefs.CorpDNS !== false}`);
    if (prefs.ShieldsUp === true) args.push('--shields-up');
    if (prefs.RunSSH === true) args.push('--ssh');
    if (prefs.Hostname) args.push(`--hostname=${prefs.Hostname}`);
    if (Array.isArray(prefs.AdvertiseRoutes) && prefs.AdvertiseRoutes.length) {
      args.push(`--advertise-routes=${prefs.AdvertiseRoutes.join(',')}`);
    }
    if (Array.isArray(prefs.AdvertiseTags) && prefs.AdvertiseTags.length) {
      args.push(`--advertise-tags=${prefs.AdvertiseTags.join(',')}`);
    }
    if (prefs.ExitNodeIP) args.push(`--exit-node=${prefs.ExitNodeIP}`);
    if (prefs.ExitNodeAllowLANAccess === true) args.push('--exit-node-allow-lan-access');
  }

  if (authKeyFile) args.push(`--auth-key=file:${authKeyFile}`);
  return args;
}

/** Does this `tailscale up` failure mean "you didn't restate every setting"? */
export function isIncompleteSettingsError(stderr = '') {
  return /requires mentioning all\s*\n?non-default flags|--reset/i.test(String(stderr));
}

/**
 * Run `tailscale up`, retrying once with `--reset` if the client rejects the
 * command for an unmodeled non-default setting.
 */
function runUpWithResetFallback({ loginServer, prefs, authKeyFile }) {
  const first = runTailscale(buildUpArgs({ loginServer, prefs, authKeyFile }), {
    timeout: UP_TIMEOUT_MS,
  });
  if (first.ok || !isIncompleteSettingsError(first.stderr)) {
    return { ...first, usedReset: false };
  }
  // Without a known control server a reset would repoint the node to the
  // default SaaS control plane — worse than failing.
  if (!normalizeControlUrl(loginServer || '')) {
    return { ...first, usedReset: false };
  }
  const retry = runTailscale(buildUpArgs({ loginServer, prefs, authKeyFile, reset: true }), {
    timeout: UP_TIMEOUT_MS,
  });
  return { ...retry, usedReset: true };
}

/**
 * Ask the client to start an interactive login and return the URL it prints.
 * The probe is killed on timeout; the pending registration stays valid on the
 * control server, and the URL is then also readable from `status --json`.
 */
export function requestInteractiveAuthUrl({ loginServer } = {}) {
  const args = ['login'];
  const target = normalizeControlUrl(loginServer || '');
  if (target) args.push(`--login-server=${target}`);

  const res = runTailscale(args, { timeout: LOGIN_PROBE_TIMEOUT_MS });
  const combined = `${res.stdout}\n${res.stderr}`;
  const match = combined.match(/https?:\/\/\S+/);
  if (match) return match[0];
  return readTailscaleStatus()?.AuthURL || null;
}

/**
 * Bring this node onto the mesh.
 *
 * Unattended when a Headscale credential exists; otherwise returns the
 * interactive URL for the user to approve. Never throws — enrollment runs on a
 * daemon heartbeat and must not take the loop down.
 */
export async function enrollThisNode({ brainDir, loginServer: explicitServer, user, force } = {}) {
  const before = await getEnrollmentStatus({ brainDir });

  if (before.enrolled && !force) {
    return { ok: true, changed: false, state: before.state, status: before, reason: 'already-enrolled' };
  }
  if (!before.client_available) {
    return {
      ok: false,
      changed: false,
      state: before.state,
      status: before,
      reason: 'tailscale-client-unavailable',
      hint: 'Install Tailscale and start tailscaled, or set TR_TAILSCALE_BIN to the client path.',
    };
  }

  const prefs = readTailscalePrefs();

  // Already authenticated, just not running — no key needed.
  if (before.state === ENROLLMENT_STATES.STOPPED) {
    const res = runTailscale(buildUpArgs({ prefs, loginServer: null }), { timeout: UP_TIMEOUT_MS });
    const after = await getEnrollmentStatus({ brainDir });
    return {
      ok: res.ok && after.enrolled,
      changed: after.enrolled,
      state: after.state,
      status: after,
      method: 'resume',
      reason: res.ok ? null : (res.stderr || '').trim().slice(0, 300) || 'tailscale-up-failed',
    };
  }

  const headscale = await describeHeadscaleAvailability(brainDir);
  const target = resolveLoginServer({ explicit: explicitServer, secretUrl: headscale.url, prefs });

  if (headscale.configured && target) {
    try {
      // Resolve once so the client can try id then name across API versions.
      const userRef = await resolveHeadscaleUser(brainDir, user);
      const keyUser = userRef?.name || user || 'default';
      const { key } = await createHeadscalePreAuthKey({ userRef, ttlMinutes: 10 }, brainDir);
      const res = withAuthKeyFile(key, (authKeyFile) =>
        runUpWithResetFallback({ loginServer: target, prefs, authKeyFile }),
      );
      const after = await getEnrollmentStatus({ brainDir });
      if (res.ok && after.enrolled) {
        return {
          ok: true,
          changed: true,
          state: after.state,
          status: after,
          method: 'preauth-key',
          user: keyUser,
          used_reset: res.usedReset === true,
        };
      }
      return {
        ok: false,
        changed: false,
        state: after.state,
        status: after,
        method: 'preauth-key',
        used_reset: res.usedReset === true,
        reason: (res.stderr || '').trim().slice(0, 300) || 'tailscale-up-did-not-connect',
      };
    } catch (err) {
      // Fall through to the interactive path — a broken API key should not
      // leave the user with no way to enroll.
      logger.info('mesh-enroll', `Pre-auth enrollment failed, falling back to interactive: ${err.message}`);
    }
  }

  const authUrl = before.auth_url || requestInteractiveAuthUrl({ loginServer: target });
  const after = await getEnrollmentStatus({ brainDir });
  return {
    ok: false,
    changed: false,
    state: after.state,
    status: { ...after, auth_url: authUrl || after.auth_url },
    method: 'interactive',
    auth_url: authUrl || after.auth_url,
    reason: headscale.configured ? 'awaiting-user-approval' : headscale.reason,
    hint: headscale.configured
      ? 'Approve the registration URL to finish joining the mesh.'
      : 'Add a Headscale API key (provider: headscale) with its control-server URL to enroll automatically.',
  };
}

/**
 * Daemon entry point: enroll if needed, throttled, never throwing.
 * Returns a skip descriptor when there is nothing to do.
 */
export async function ensureEnrolled({ brainDir, now = Date.now() } = {}) {
  if (!autoEnrollEnabled()) {
    return { skipped: true, reason: 'auto-enroll-disabled' };
  }
  if (lastAutoAttemptAt && now - lastAutoAttemptAt < AUTO_RETRY_INTERVAL_MS) {
    return { skipped: true, reason: 'throttled', last_result: lastAutoResult };
  }

  try {
    const status = await getEnrollmentStatus({ brainDir });
    if (status.enrolled) {
      lastAutoResult = { ok: true, state: status.state };
      return { skipped: true, reason: 'already-enrolled', state: status.state };
    }
    if (!status.client_available) {
      lastAutoAttemptAt = now;
      lastAutoResult = { ok: false, state: status.state };
      return { skipped: true, reason: 'tailscale-client-unavailable', state: status.state };
    }
    if (!status.can_auto_enroll && status.state !== ENROLLMENT_STATES.STOPPED) {
      // Nothing unattended is possible; the dashboard shows the interactive URL.
      lastAutoAttemptAt = now;
      lastAutoResult = { ok: false, state: status.state };
      return {
        skipped: true,
        reason: status.auto_enroll_blocked_reason || 'no-automatic-path',
        state: status.state,
        auth_url: status.auth_url,
      };
    }

    lastAutoAttemptAt = now;
    const result = await enrollThisNode({ brainDir });
    lastAutoResult = { ok: result.ok, state: result.state };
    logger.info(
      'mesh-enroll',
      result.ok
        ? `Node enrolled on the mesh via ${result.method || 'unknown'} (state=${result.state})`
        : `Automatic enrollment incomplete: ${result.reason || 'unknown'} (state=${result.state})`,
    );
    return result;
  } catch (err) {
    lastAutoAttemptAt = now;
    lastAutoResult = { ok: false, error: err.message };
    logger.info('mesh-enroll', `Automatic enrollment error: ${err.message}`);
    return { skipped: true, reason: 'error', error: err.message };
  }
}
