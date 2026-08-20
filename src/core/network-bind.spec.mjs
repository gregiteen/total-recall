import { describe, expect, it } from 'vitest';
import { resolveServerHost } from './network-bind.mjs';

describe('resolveServerHost', () => {
  it('falls back to loopback when neither config nor mesh is available', () => {
    expect(resolveServerHost()).toMatchObject({
      host: '127.0.0.1',
      usedLoopbackFallback: true,
    });
  });

  it('uses a mesh address when available', () => {
    expect(resolveServerHost({ meshIp: '100.64.0.2' }).host).toBe('100.64.0.2');
  });

  it('refuses public binds unless explicitly enabled in security config', () => {
    expect(resolveServerHost({ configuredHost: '0.0.0.0' })).toMatchObject({
      host: '127.0.0.1',
      publicBindRefused: true,
    });
    expect(resolveServerHost({ configuredHost: '::', allowPublicBind: true }).host).toBe('::');
  });

  it('lets a mesh address win when no host was configured by the user', () => {
    // The default security config used to carry `bind.host: '127.0.0.1'`,
    // which is indistinguishable here from a user who typed that on purpose --
    // configuredHost beats meshIp. So every install without a config file
    // discovered its mesh address and then discarded it, binding loopback
    // permanently and silently. The default now omits `host` so this path,
    // which was always correct, is the one that actually runs.
    expect(resolveServerHost({ configuredHost: undefined, meshIp: '100.64.0.2' }).host).toBe(
      '100.64.0.2',
    );
  });

  it('still honours an explicit loopback choice', () => {
    // Removing the default must not take the option away from someone who
    // genuinely wants the brain reachable only from its own machine.
    expect(resolveServerHost({ configuredHost: '127.0.0.1', meshIp: '100.64.0.2' }).host).toBe(
      '127.0.0.1',
    );
  });
});
