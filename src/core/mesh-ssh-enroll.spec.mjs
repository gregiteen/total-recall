import { describe, expect, it } from 'vitest';
import { buildUpArgs, supportsTailscaleSsh } from './mesh-enroll.mjs';

// `hasDaemon` is passed explicitly throughout: left to probe the host, the
// answer would depend on whether the machine running the suite happens to have
// tailscaled installed, and the macOS cases would invert on a developer box
// with the Homebrew formula.
describe('supportsTailscaleSsh', () => {
  it('supports Linux', () => {
    expect(supportsTailscaleSsh({ platform: 'linux', env: {}, hasDaemon: false })).toBe(true);
  });

  // The sandboxed macOS GUI builds ship no tailscaled and silently never start
  // the SSH server, so the daemon binary is the only honest signal.
  it('rejects macOS GUI builds that have no tailscaled', () => {
    expect(supportsTailscaleSsh({ platform: 'darwin', env: {}, hasDaemon: false })).toBe(false);
  });

  // The open-source formula does ship one, and that build serves SSH fine —
  // treating all of macOS as incapable would leave those nodes on their own keys.
  it('supports macOS running the open-source tailscaled', () => {
    expect(supportsTailscaleSsh({ platform: 'darwin', env: {}, hasDaemon: true })).toBe(true);
  });

  it('rejects platforms that are client-only', () => {
    expect(supportsTailscaleSsh({ platform: 'win32', env: {}, hasDaemon: false })).toBe(false);
  });

  it('honours an explicit operator override in both directions', () => {
    expect(supportsTailscaleSsh({ platform: 'win32', env: { TR_TAILSCALE_SSH: '1' } })).toBe(true);
    expect(supportsTailscaleSsh({ platform: 'linux', env: { TR_TAILSCALE_SSH: '0' } })).toBe(false);
    expect(supportsTailscaleSsh({ platform: 'linux', env: { TR_TAILSCALE_SSH: 'off' } })).toBe(false);
  });
});

describe('buildUpArgs SSH handling', () => {
  it('enables SSH on a never-enrolled node that has no prefs to copy', () => {
    const args = buildUpArgs({
      loginServer: 'https://control.example.org',
      prefs: null,
      authKeyFile: '/tmp/key',
      enableSsh: true,
    });
    expect(args).toContain('--ssh');
  });

  it('does not add --ssh twice when prefs already have it', () => {
    const args = buildUpArgs({
      loginServer: 'https://control.example.org',
      prefs: { RunSSH: true },
      authKeyFile: '/tmp/key',
      enableSsh: true,
    });
    expect(args.filter((a) => a === '--ssh')).toHaveLength(1);
  });

  it('leaves SSH off when the platform cannot serve it', () => {
    const args = buildUpArgs({
      loginServer: 'https://control.example.org',
      prefs: null,
      authKeyFile: '/tmp/key',
      enableSsh: false,
    });
    expect(args).not.toContain('--ssh');
  });

  // Turning SSH on is a real state change, so the "nothing to say" early return
  // must not swallow it on an already-configured node.
  it('still issues flags when SSH is the only thing changing', () => {
    const args = buildUpArgs({ loginServer: null, prefs: { RunSSH: false }, enableSsh: true });
    expect(args).toContain('--ssh');
    expect(args.length).toBeGreaterThan(1);
  });

  it('stays a bare resume when nothing at all is changing', () => {
    const args = buildUpArgs({ loginServer: null, prefs: { RunSSH: true }, enableSsh: true });
    expect(args).toEqual(['up']);
  });

  // A --reset drops every unmentioned setting, so SSH has to be restated or
  // the retry path would quietly turn it back off.
  it('restates SSH through the reset fallback', () => {
    const args = buildUpArgs({
      loginServer: 'https://control.example.org',
      prefs: { RunSSH: true },
      authKeyFile: '/tmp/key',
      reset: true,
      enableSsh: true,
    });
    expect(args).toContain('--reset');
    expect(args).toContain('--ssh');
  });
});
