import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  FALLBACK_BINARIES,
  DARWIN_DAEMON_BINARIES,
  STATUS_TIMEOUT_MS,
  resolveTailscaleBinary,
  hasTailscaleDaemon,
} from './tailscale-cli.mjs';

describe('core: tailscale-cli', () => {
  const originalEnv = process.env.TR_TAILSCALE_BIN;

  afterEach(() => {
    if (originalEnv === undefined) {
      delete process.env.TR_TAILSCALE_BIN;
    } else {
      process.env.TR_TAILSCALE_BIN = originalEnv;
    }
  });

  it('exports expected constants', () => {
    expect(Array.isArray(FALLBACK_BINARIES)).toBe(true);
    expect(FALLBACK_BINARIES.length).toBeGreaterThan(0);
    expect(Array.isArray(DARWIN_DAEMON_BINARIES)).toBe(true);
    expect(STATUS_TIMEOUT_MS).toBe(10_000);
  });

  it('honors TR_TAILSCALE_BIN environment override', () => {
    process.env.TR_TAILSCALE_BIN = '/custom/bin/tailscale';
    expect(resolveTailscaleBinary()).toBe('/custom/bin/tailscale');
  });

  it('returns a string binary name or path', () => {
    delete process.env.TR_TAILSCALE_BIN;
    const resolved = resolveTailscaleBinary();
    expect(typeof resolved).toBe('string');
    expect(resolved.length).toBeGreaterThan(0);
  });

  it('checks daemon existence returning boolean', () => {
    const hasDaemon = hasTailscaleDaemon();
    expect(typeof hasDaemon).toBe('boolean');
  });
});
