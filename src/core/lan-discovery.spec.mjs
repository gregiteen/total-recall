import { describe, it, expect, vi } from 'vitest';
import { parseArpTable, discoverLanHosts, probeLanBrains, lanHostnameFromIp } from './lan-discovery.mjs';

describe('parseArpTable', () => {
  it('parses macOS/BSD arp -a lines', () => {
    const text = `
? (192.168.1.1) at aa:bb:cc:dd:ee:01 on en0 ifscope [ethernet]
? (192.168.1.50) at aa:bb:cc:dd:ee:02 on en0 ifscope [ethernet]
? (100.64.0.9) at aa:bb:cc:dd:ee:03 on utun2 ifscope permanent [ethernet]
`;
    const peers = parseArpTable(text);
    expect(peers).toHaveLength(2);
    expect(peers[0]).toMatchObject({ ip: '192.168.1.1', mac: 'aa:bb:cc:dd:ee:01', interface: 'en0' });
    expect(peers.find((p) => p.ip === '100.64.0.9')).toBeUndefined();
  });

  it('parses linux ip neigh lines', () => {
    const text = `
192.168.0.1 dev eth0 lladdr 11:22:33:44:55:66 REACHABLE
192.168.0.2 dev eth0 lladdr 11:22:33:44:55:77 STALE
`;
    const peers = parseArpTable(text);
    expect(peers).toHaveLength(2);
    expect(peers[1].ip).toBe('192.168.0.2');
  });
});

describe('discoverLanHosts', () => {
  it('filters self addresses and returns LAN-only peers', () => {
    const snap = discoverLanHosts({
      networkInterfaces: () => ({
        eth0: [
          {
            address: '192.168.1.10',
            family: 'IPv4',
            internal: false,
            mac: 'aa:aa:aa:aa:aa:aa',
            cidr: '192.168.1.10/24',
            netmask: '255.255.255.0',
          },
        ],
      }),
      arpText: `
? (192.168.1.10) at aa:aa:aa:aa:aa:aa on eth0 ifscope [ethernet]
? (192.168.1.20) at bb:bb:bb:bb:bb:bb on eth0 ifscope [ethernet]
`,
    });
    expect(snap.hosts).toHaveLength(1);
    expect(snap.hosts[0].ip).toBe('192.168.1.20');
    expect(snap.local_lan[0].address).toBe('192.168.1.10');
  });
});

describe('probeLanBrains', () => {
  it('marks reachable brains when /health succeeds', async () => {
    const throttledFetch = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({ product: 'total-recall' }),
    }));
    const results = await probeLanBrains(['192.168.1.30'], {
      port: 3000,
      throttledFetch,
      timeoutMs: 500,
    });
    expect(results).toHaveLength(1);
    expect(results[0].ok).toBe(true);
    expect(results[0].transport).toBe('lan');
    expect(throttledFetch).toHaveBeenCalledWith('http://192.168.1.30:3000/health', {}, 500);
  });
});

describe('lanHostnameFromIp', () => {
  it('builds a portable synthetic hostname from IP only', () => {
    expect(lanHostnameFromIp('192.168.1.20')).toBe('lan-192-168-1-20');
  });
});
