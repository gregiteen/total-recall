import { describe, it, expect } from 'vitest';
import {
  classifyInterfaceKind,
  isLanIpv4,
  isOverlayIpv4,
  listLocalInterfaces,
  summarizeInterfacesForEntity,
} from './network-interfaces.mjs';

describe('classifyInterfaceKind', () => {
  it('classifies common portable interface name patterns', () => {
    expect(classifyInterfaceKind('lo0', { internal: true })).toBe('loopback');
    expect(classifyInterfaceKind('wlan0')).toBe('wifi');
    expect(classifyInterfaceKind('eth0')).toBe('ethernet');
    expect(classifyInterfaceKind('en1')).toBe('ethernet');
    expect(classifyInterfaceKind('utun3')).toBe('vpn_overlay');
    expect(classifyInterfaceKind('tailscale0')).toBe('vpn_overlay');
    expect(classifyInterfaceKind('bridge0')).toBe('bridge');
  });
});

describe('address range helpers', () => {
  it('detects private LAN vs overlay ranges', () => {
    expect(isLanIpv4('192.168.1.10')).toBe(true);
    expect(isLanIpv4('10.0.0.5')).toBe(true);
    expect(isLanIpv4('172.16.0.2')).toBe(true);
    expect(isLanIpv4('8.8.8.8')).toBe(false);
    expect(isOverlayIpv4('100.64.0.1')).toBe(true);
    expect(isLanIpv4('100.64.0.1')).toBe(false);
  });
});

describe('listLocalInterfaces', () => {
  it('maps injected os.networkInterfaces without device-specific names', () => {
    const interfaces = listLocalInterfaces({
      networkInterfaces: () => ({
        lo0: [{ address: '127.0.0.1', family: 'IPv4', internal: true, mac: '00:00:00:00:00:00' }],
        eth0: [
          {
            address: '192.168.10.20',
            family: 'IPv4',
            internal: false,
            mac: 'aa:bb:cc:dd:ee:ff',
            netmask: '255.255.255.0',
            cidr: '192.168.10.20/24',
          },
        ],
        utun2: [{ address: '100.64.0.5', family: 'IPv4', internal: false, mac: '00:00:00:00:00:00' }],
      }),
    });
    expect(interfaces.find((i) => i.name === 'eth0')?.kind).toBe('ethernet');
    expect(interfaces.find((i) => i.name === 'eth0')?.has_lan_ipv4).toBe(true);
    expect(interfaces.find((i) => i.name === 'utun2')?.kind).toBe('vpn_overlay');
    expect(interfaces.find((i) => i.name === 'utun2')?.has_overlay_ipv4).toBe(true);

    const summary = summarizeInterfacesForEntity(interfaces);
    expect(summary.some((s) => s.name === 'lo0')).toBe(false);
    expect(summary.find((s) => s.name === 'eth0')?.ipv4).toContain('192.168.10.20');
  });
});
