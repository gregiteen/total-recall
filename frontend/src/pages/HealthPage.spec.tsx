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
    } as any);
    vi.mocked(api.checkUpdate).mockResolvedValue({ updateAvailable: false } as any);

    render(<HealthPage />);

    expect(screen.getByText(/System Health/i)).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getAllByText(/1h 0m/i)[0]).toBeInTheDocument();
      expect(screen.getByText(/healthy/i)).toBeInTheDocument();
    });
  });
});
