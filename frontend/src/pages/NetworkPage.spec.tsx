import { render, screen, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import NetworkPage from './NetworkPage';
import {
  getNetworkStats,
  getNetworkPolicy,
  getAuditLog
} from '../api/network';

vi.mock('../api/network', () => {
  const getStats = vi.fn();
  const getPolicy = vi.fn();
  const getAuditLog = vi.fn();
  const block = vi.fn();
  const unblock = vi.fn();
  return {
    getNetworkStats: getStats,
    getNetworkPolicy: getPolicy,
    getAuditLog: getAuditLog,
    blockDomain: block,
    unblockDomain: unblock,
    updateNetworkPolicy: vi.fn(),
    networkApi: {
      getStats,
      getPolicy,
      getAuditLog,
      blockDomain: block,
      unblockDomain: unblock,
    }
  };
});

describe('NetworkPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (getNetworkStats as any).mockResolvedValue({
      stats: { active: 2, queueLength: 0, errors: 0, timeouts: 0 }
    });
    (getNetworkPolicy as any).mockResolvedValue({
      blocked_domains: ['evil.com'],
      max_global_concurrency: 20
    });
    (getAuditLog as any).mockResolvedValue({
      audit: []
    });
  });

  it('renders loading state initially', () => {
    render(<NetworkPage />);
    expect(screen.getByText(/Loading network data.../i)).toBeInTheDocument();
  });

  it('renders network stats and firewall after loading', async () => {
    render(<NetworkPage />);
    
    await waitFor(() => {
      expect(screen.getAllByText(/Network Firewall/i)[0]).toBeInTheDocument();
    });

    expect(screen.getByText(/Active Connections/i)).toBeInTheDocument();
    expect(screen.getByText('2')).toBeInTheDocument();
    expect(screen.getByText('evil.com')).toBeInTheDocument();
  });
});
