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
});
