import { render, screen, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import NetworkPage from './NetworkPage';
import { networkApi } from '../api/network';

vi.mock('../api/network', () => ({
  networkApi: {
    getStats: vi.fn(),
    getPolicy: vi.fn(),
    getAuditLog: vi.fn(),
    blockDomain: vi.fn(),
    unblockDomain: vi.fn()
  }
}));

describe('NetworkPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (networkApi.getStats as any).mockResolvedValue({
      stats: { active: 2, queueLength: 0, errors: 0, timeouts: 0 }
    });
    (networkApi.getPolicy as any).mockResolvedValue({
      blocked_domains: ['evil.com'],
      max_global_concurrency: 20
    });
    (networkApi.getAuditLog as any).mockResolvedValue({
      audit: []
    });
  });

  it('renders loading state initially', () => {
    render(<NetworkPage />);
    expect(screen.getByText(/Loading network settings.../i)).toBeInTheDocument();
  });

  it('renders network stats and firewall after loading', async () => {
    render(<NetworkPage />);
    
    await waitFor(() => {
      expect(screen.getByText(/Network Firewall & Dashboard/i)).toBeInTheDocument();
    });

    expect(screen.getByText(/In-Flight Connections/i)).toBeInTheDocument();
    expect(screen.getByText('2 / 20')).toBeInTheDocument();
    expect(screen.getByText('evil.com')).toBeInTheDocument();
  });
});
