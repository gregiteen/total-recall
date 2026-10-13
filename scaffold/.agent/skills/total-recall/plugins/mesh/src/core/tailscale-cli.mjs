/**
 * Locating the Tailscale client.
 *
 * Kept separate from both discovery and enrollment because each needs the
 * binary but neither should depend on the other to find it. Folding this into
 * the enrollment module made status reads fail wherever enrollment was stubbed
 * — the lookup silently became `undefined`, and every mesh query returned an
 * error that looked like an empty mesh.
 */

import fs from 'node:fs';

/**
 * macOS ships the CLI inside the app bundle rather than on PATH, so a
 * PATH-only lookup fails on exactly the machines people install first.
 */
export const FALLBACK_BINARIES = [
  '/usr/local/bin/tailscale',
  '/opt/homebrew/bin/tailscale',
  '/Applications/Tailscale.app/Contents/MacOS/Tailscale',
  '/usr/bin/tailscale',
];

/**
 * Presence of a `tailscaled` is what separates the open-source build, which
 * can serve Tailscale SSH, from the sandboxed GUI builds, which cannot.
 */
export const DARWIN_DAEMON_BINARIES = [
  '/usr/local/bin/tailscaled',
  '/opt/homebrew/bin/tailscaled',
  '/usr/local/sbin/tailscaled',
  '/opt/homebrew/sbin/tailscaled',
];

/**
 * How long to wait on a `tailscale status` read.
 *
 * Measured at 1.2–1.7s on an idle machine, and longer whenever peers are spread
 * over a WAN or the host is busy. A tight timeout does not degrade gracefully:
 * the call returns nothing, the mesh reads as completely empty, and every
 * lookup reports a node as missing rather than unknown — indistinguishable from
 * a machine that was never enrolled. Shared so discovery and enrollment cannot
 * disagree about how patient to be.
 */
export const STATUS_TIMEOUT_MS = 10_000;

function existsSafe(candidate) {
  try {
    return fs.existsSync(candidate);
  } catch {
    // Permission errors fall through to the next candidate, then to PATH.
    return false;
  }
}

/** Resolve the Tailscale CLI, honoring an explicit override first. */
export function resolveTailscaleBinary() {
  const override = (process.env.TR_TAILSCALE_BIN || '').trim();
  if (override) return override;
  for (const candidate of FALLBACK_BINARIES) {
    if (existsSafe(candidate)) return candidate;
  }
  return 'tailscale';
}

/** Is an open-source `tailscaled` present (the SSH-server-capable build)? */
export function hasTailscaleDaemon() {
  return DARWIN_DAEMON_BINARIES.some(existsSafe);
}
