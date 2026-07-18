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
});
