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
    vi.mocked(getNetworkStats).mockResolvedValue({
      stats: {
        total: 2,
        blocked: 0,
        queueLength: 0,
        active: 2,
        completed: 0,
        errors: 0,
        timeouts: 0,
        peakActive: 2,
        peakQueue: 0,
        domains: {},
      },
      audit_count: 0,
    });
    vi.mocked(getNetworkPolicy).mockResolvedValue({
      id: 'test-policy',
      blocked_domains: ['evil.com'],
      max_global_concurrency: 20,
      max_per_domain_concurrency: 4,
      default_timeout_ms: 10000,
    });
    vi.mocked(getAuditLog).mockResolvedValue({
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
      expect(screen.getByText(/Active Connections/i)).toBeInTheDocument();
    });

    expect(screen.getByText('2')).toBeInTheDocument();
    expect(screen.getByText('evil.com')).toBeInTheDocument();
  });
});
