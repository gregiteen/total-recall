import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import SettingsPage from './SettingsPage';
import * as api from '../api';

vi.mock('../api');

describe('SettingsPage', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('renders without crashing', async () => {
    vi.mocked(api.fetchConfigJson).mockResolvedValue({
      security: { bind: {}, network: {}, rate_limits: {}, sandbox: {}, dashboard: {}, api: {} },
      budget: { budget: {} },
      brain: {}
    } as any);
    vi.mocked(api.fetchHealth).mockResolvedValue({ status: 'healthy', version: '1.0.0' });
    vi.mocked(api.checkUpdate).mockResolvedValue({ updateAvailable: false });
    vi.mocked(api.fetchBrains).mockResolvedValue([]);

    render(<SettingsPage />);

    expect(screen.getByText(/Loading Settings/i)).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.queryByText(/Loading Settings/i)).not.toBeInTheDocument();
    });

    expect(screen.getByText(/System Settings/i)).toBeInTheDocument();
  });
});
