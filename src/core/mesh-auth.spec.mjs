import { describe, expect, it } from 'vitest';
import { isMeshOrLoopbackAddress, normalizeRemoteAddress } from './mesh-auth.mjs';

describe('mesh auth address validation', () => {
  it('accepts only loopback and the exact 100.64.0.0/10 range', () => {
    expect(isMeshOrLoopbackAddress('127.0.0.1')).toBe(true);
    expect(isMeshOrLoopbackAddress('::1')).toBe(true);
    expect(isMeshOrLoopbackAddress('100.64.0.1')).toBe(true);
    expect(isMeshOrLoopbackAddress('100.127.255.255')).toBe(true);
    expect(isMeshOrLoopbackAddress('100.63.255.255')).toBe(false);
    expect(isMeshOrLoopbackAddress('100.128.0.1')).toBe(false);
    expect(isMeshOrLoopbackAddress('100.999.0.1')).toBe(false);
  });

  it('normalizes IPv4-mapped addresses', () => {
    expect(normalizeRemoteAddress('::ffff:100.64.0.2')).toBe('100.64.0.2');
  });
});
