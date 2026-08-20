import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MobilePairing } from './MobilePairing';

vi.mock('../api', () => ({
  apiFetch: vi.fn(),
  getApiBase: vi.fn(() => ''),
}));

import { apiFetch } from '../api';

describe('MobilePairing', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders QR with preferred LAN/mesh URL from API', async () => {
    vi.mocked(apiFetch).mockResolvedValue({
      ok: true,
      json: async () => ({
        port: 3000,
        protocol: 'http',
        preferred_url: 'http://10.0.0.3:3000',
        listen_hosts: ['127.0.0.1', '100.64.0.3'],
        warnings: ['Brain is not listening on LAN'],
        endpoints: [
          {
            kind: 'lan',
            label: 'Local Wi‑Fi / LAN',
            ip: '10.0.0.3',
            url: 'http://10.0.0.3:3000',
            recommended: false,
            reachable_hint: 'Same Wi‑Fi',
          },
          {
            kind: 'mesh',
            label: 'Tailscale / mesh',
            ip: '100.64.0.3',
            url: 'http://100.64.0.3:3000',
            recommended: true,
            reachable_hint: 'Tailscale',
          },
        ],
      }),
    } as never);

    render(<MobilePairing />);
    await waitFor(() => {
      expect(screen.getByTestId('pairing-url').textContent).toContain('10.0.0.3:3000');
    });
    expect(screen.getByTestId('pairing-qr')).toBeTruthy();
    expect(screen.getByTestId('pairing-warnings')).toBeTruthy();
  });
  it('sends you to enrol the device instead of hand-waving "log into your tailnet"', async () => {
    // The old copy said "Log into your tailnet/headscale server" -- five words
    // covering an iOS flow that needs the alternate coordination server, a
    // keychain reset and server-side approval. Scanning a 100.64.x.x QR from a
    // phone that has not joined just times out.
    render(<MobilePairing />);
    expect(await screen.findByText(/Add a device to the tailnet/i)).toBeTruthy();
    expect(screen.getByText(/Reset Keychain/i)).toBeTruthy();
  });

  const pairingResponse = (over = {}) => ({
    ok: true,
    json: async () => ({
      port: 3000,
      protocol: 'http',
      preferred_url: 'http://100.64.0.2:3000',
      listen_hosts: ['127.0.0.1'],
      listen_hosts_source: 'actual',
      reachable_from_other_devices: false,
      warnings: ['This brain is listening on loopback only'],
      endpoints: [
        {
          kind: 'mesh',
          label: 'Tailscale / mesh',
          ip: '100.64.0.2',
          url: 'http://100.64.0.2:3000',
          recommended: true,
          reachable_hint: 'Tailscale',
          listening: false,
        },
      ],
      ...over,
    }),
  });

  it('says no device can reach the brain instead of drawing a QR that fails', async () => {
    // The Mac Mini shipped this card for a week: brain bound loopback-only
    // after losing the boot race to the mesh client, while the card happily
    // recommended a mesh URL nothing had ever listened on.
    vi.mocked(apiFetch).mockResolvedValue(pairingResponse() as never);

    render(<MobilePairing />);

    const alert = await screen.findByTestId('pairing-unreachable');
    expect(alert.textContent).toMatch(/No other device can reach this brain/i);
    // Naming the cause is what turns an error into something a user can act on.
    expect(alert.textContent).toMatch(/still starting when the brain launched/i);
    expect(alert.textContent).toMatch(/restart the brain/i);
    // And the code itself must not look scannable.
    expect(screen.getByTestId('pairing-qr-dead')).toBeTruthy();
  });

  it('flags the specific address that is not listening', async () => {
    vi.mocked(apiFetch).mockResolvedValue(pairingResponse() as never);
    render(<MobilePairing />);
    await screen.findByTestId('pairing-unreachable');
    expect(screen.getByTestId('pairing-endpoint-select').textContent).toMatch(/not listening/i);
  });

  it('stays quiet when the brain is genuinely reachable', async () => {
    vi.mocked(apiFetch).mockResolvedValue(
      pairingResponse({
        preferred_url: 'http://100.64.0.6:3000',
        listen_hosts: ['100.64.0.6', '127.0.0.1'],
        reachable_from_other_devices: true,
        warnings: [],
        endpoints: [
          {
            kind: 'mesh',
            label: 'Tailscale / mesh',
            ip: '100.64.0.6',
            url: 'http://100.64.0.6:3000',
            recommended: true,
            reachable_hint: 'Tailscale',
            listening: true,
          },
        ],
      }) as never,
    );
    render(<MobilePairing />);
    await waitFor(() => {
      expect(screen.getByTestId('pairing-url').textContent).toContain('100.64.0.6');
    });
    expect(screen.queryByTestId('pairing-unreachable')).toBeNull();
    expect(screen.queryByTestId('pairing-qr-dead')).toBeNull();
  });

  it('does not cry wolf when the server could not observe its own sockets', async () => {
    // `null` is unknown. Rendering unknown as a red banner would put a false
    // alarm on every install whose page load beat the listen callback.
    vi.mocked(apiFetch).mockResolvedValue(
      pairingResponse({ reachable_from_other_devices: null, listen_hosts_source: 'derived' }) as never,
    );
    render(<MobilePairing />);
    await waitFor(() => {
      expect(screen.getByTestId('pairing-url')).toBeTruthy();
    });
    expect(screen.queryByTestId('pairing-unreachable')).toBeNull();
  });
});
