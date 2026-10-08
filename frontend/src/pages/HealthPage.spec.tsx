import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import HealthPage from './HealthPage';
import * as api from '../api';

vi.mock('../api');

describe('HealthPage', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('renders correctly', async () => {
    vi.mocked(api.fetchHealth).mockResolvedValue({
      status: 'healthy',
      version: '1.0.0',
      uptime_seconds: 3600,
      timestamp: new Date().toISOString()
    } as never);
    vi.mocked(api.checkUpdate).mockResolvedValue({ updateAvailable: false } as never);

    render(<HealthPage />);

    expect(screen.getByText(/System Health/i)).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getAllByText(/1h 0m/i)[0]).toBeInTheDocument();
      expect(screen.getAllByText(/healthy/i)[0]).toBeInTheDocument();
    });
  });

  it('shows preview features without a host update prompt when only consumers are behind', async () => {
    vi.mocked(api.fetchHealth).mockResolvedValue({ status: 'healthy', version: '3.38.0', uptime_seconds: 10 } as never);
    vi.mocked(api.checkUpdate).mockResolvedValue({ updateAvailable: false, previewFeatures: true,
      consumerUpdatesAvailable: true, currentVersion: '3.38.0', latestVersion: '3.37.0' });
    render(<HealthPage />);
    expect(await screen.findByText('(Preview features)')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Update Now' })).not.toBeInTheDocument();
    expect(screen.queryByText('(Latest)')).not.toBeInTheDocument();
  });
});
