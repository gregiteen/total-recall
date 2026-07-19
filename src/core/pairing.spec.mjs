import { describe, it, expect } from 'vitest';
import { buildPairingInfo } from './pairing.mjs';

describe('buildPairingInfo', () => {
  it('prefers LAN IPv4 for phone pairing and includes mesh + loopback', () => {
    const info = buildPairingInfo({
      port: 3000,
      protocol: 'http',
      meshIp: '100.64.0.3',
      listenHosts: ['127.0.0.1', '100.64.0.3'],
      listInterfaces: () => [
        {
          name: 'en0',
          kind: 'ethernet',
          addresses: [
            {
              address: '10.0.0.3',
              family: 'IPv4',
              internal: false,
              is_lan: true,
              is_overlay: false,
            },
          ],
        },
      ],
    });

    expect(info.port).toBe(3000);
    expect(info.endpoints.some((e) => e.kind === 'lan' && e.ip === '10.0.0.3')).toBe(true);
    expect(info.endpoints.some((e) => e.kind === 'mesh' && e.ip === '100.64.0.3')).toBe(true);
    expect(info.endpoints.some((e) => e.kind === 'loopback')).toBe(true);
    // LAN not bound → prefer mesh (phone needs Tailscale) over unreachable LAN.
    expect(info.preferred_url).toBe('http://100.64.0.3:3000');
    expect(info.warnings.some((w) => /not listening on LAN/i.test(w))).toBe(true);
  });

  it('recommends mesh when no LAN is available', () => {
    const info = buildPairingInfo({
      port: 3000,
      meshIp: '100.64.0.3',
      listenHosts: ['127.0.0.1', '100.64.0.3'],
      listInterfaces: () => [],
    });
    expect(info.preferred_url).toBe('http://100.64.0.3:3000');
    expect(info.endpoints.find((e) => e.recommended)?.kind).toBe('mesh');
  });

  it('recommends LAN when publicly bound', () => {
    const info = buildPairingInfo({
      port: 3000,
      meshIp: '100.64.0.3',
      listenHosts: ['0.0.0.0'],
      listInterfaces: () => [
        {
          name: 'en0',
          addresses: [
            { address: '10.0.0.3', family: 'IPv4', internal: false, is_lan: true, is_overlay: false },
          ],
        },
      ],
    });
    expect(info.preferred_url).toBe('http://10.0.0.3:3000');
  });
});
