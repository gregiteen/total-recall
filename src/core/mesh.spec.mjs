import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as child_process from 'node:child_process';
import { isMeshAvailable, getMeshIp, getMeshHostname, getMeshPeers } from './mesh.mjs';

vi.mock('node:child_process', () => {
  const execSync = vi.fn();
  return {
    execSync,
    default: { execSync }
  };
});

describe('mesh module', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('isMeshAvailable returns true if tailscale status succeeds', () => {
    vi.mocked(child_process.execSync).mockReturnValue(Buffer.from(''));
    expect(isMeshAvailable()).toBe(true);
  });

  it('isMeshAvailable returns false if tailscale status fails', () => {
    vi.mocked(child_process.execSync).mockImplementation(() => {
      throw new Error('command failed');
    });
    expect(isMeshAvailable()).toBe(false);
  });

  it('getMeshIp parses TailscaleIPs', () => {
    vi.mocked(child_process.execSync).mockImplementation((cmd) => {
      if (cmd === 'tailscale status') return Buffer.from('');
      if (cmd === 'tailscale status --json') {
        return Buffer.from(JSON.stringify({
          Self: { TailscaleIPs: ['100.64.0.1'] }
        }));
      }
      return Buffer.from('');
    });
    expect(getMeshIp()).toBe('100.64.0.1');
  });

  it('getMeshHostname parses DNSName', () => {
    vi.mocked(child_process.execSync).mockImplementation((cmd) => {
      if (cmd === 'tailscale status') return Buffer.from('');
      if (cmd === 'tailscale status --json') {
        return Buffer.from(JSON.stringify({
          Self: { DNSName: 'laptop.mesh.' }
        }));
      }
      return Buffer.from('');
    });
    expect(getMeshHostname()).toBe('laptop.mesh');
  });

  it('getMeshPeers returns peer list', () => {
    vi.mocked(child_process.execSync).mockImplementation((cmd) => {
      if (cmd === 'tailscale status') return Buffer.from('');
      if (cmd === 'tailscale status --json') {
        return Buffer.from(JSON.stringify({
          Peer: {
            'node1': { DNSName: 'macmini.mesh.', TailscaleIPs: ['100.64.0.2'], Online: true }
          }
        }));
      }
      return Buffer.from('');
    });
    const peers = getMeshPeers();
    expect(peers).toHaveLength(1);
    expect(peers[0].hostname).toBe('macmini.mesh');
    expect(peers[0].ip).toBe('100.64.0.2');
    expect(peers[0].online).toBe(true);
  });
});
