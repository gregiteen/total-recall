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

  describe('reachability is observed, never assumed', () => {
    const LAPTOP_IFACES = () => [
      {
        name: 'en0',
        addresses: [
          { address: '10.0.0.3', family: 'IPv4', internal: false, is_lan: true, is_overlay: false },
        ],
      },
    ];

    it('does NOT invent a mesh binding when listen hosts are unknown', () => {
      // The regression. getMeshIp() answering means the mesh client is up now;
      // it says nothing about what this process bound. Deriving the mesh
      // address into listen_hosts is what made the card recommend, and draw a
      // QR code for, an address nothing had ever listened on.
      const info = buildPairingInfo({
        port: 3000,
        meshIp: '100.64.0.2',
        listenHosts: [],
        listInterfaces: () => [],
      });
      expect(info.listen_hosts).not.toContain('100.64.0.2');
      expect(info.listen_hosts_source).toBe('derived');
    });

    it('reports unknown — not working — when it cannot observe the sockets', () => {
      const info = buildPairingInfo({
        port: 3000,
        meshIp: '100.64.0.2',
        listInterfaces: LAPTOP_IFACES,
      });
      expect(info.reachable_from_other_devices).toBeNull();
      // A guessed green tick is worse than no tick.
      expect(info.endpoints.every((e) => e.listening === null)).toBe(true);
    });

    it('says plainly that no device can reach a loopback-only brain', () => {
      // The Mac Mini: brain up before the mesh client, bound 127.0.0.1 alone,
      // invisible to the tailnet for a week with nothing reporting it.
      const info = buildPairingInfo({
        port: 3000,
        meshIp: '100.64.0.2',
        listenHosts: ['127.0.0.1'],
        listInterfaces: LAPTOP_IFACES,
      });
      expect(info.reachable_from_other_devices).toBe(false);
      expect(info.listen_hosts_source).toBe('actual');
      // Headline first: every other warning is secondary to "nothing works".
      expect(info.warnings[0]).toMatch(/loopback only/i);
      expect(info.warnings[0]).toMatch(/no other device/i);
      expect(info.endpoints.find((e) => e.kind === 'mesh')?.listening).toBe(false);
      expect(info.endpoints.find((e) => e.kind === 'loopback')?.listening).toBe(true);
    });

    it('confirms reachability once the mesh address is genuinely bound', () => {
      const info = buildPairingInfo({
        port: 3000,
        meshIp: '100.64.0.6',
        listenHosts: ['100.64.0.6', '127.0.0.1'],
        listInterfaces: LAPTOP_IFACES,
      });
      expect(info.reachable_from_other_devices).toBe(true);
      expect(info.warnings.some((w) => /loopback only/i.test(w))).toBe(false);
      expect(info.endpoints.find((e) => e.ip === '100.64.0.6')?.listening).toBe(true);
      expect(info.preferred_url).toBe('http://100.64.0.6:3000');
    });

    it('counts a wildcard bind as reachable', () => {
      const info = buildPairingInfo({
        port: 3000,
        meshIp: '100.64.0.6',
        listenHosts: ['0.0.0.0'],
        listInterfaces: LAPTOP_IFACES,
      });
      expect(info.reachable_from_other_devices).toBe(true);
    });
  });
});
