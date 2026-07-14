import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import SettingsPage from './SettingsPage';
import * as api from '../api';

vi.mock('../api');

describe('SettingsPage', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('renders without crashing', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    
    vi.mocked(api.fetchConfigJson).mockResolvedValue({
      security: { bind: {}, network: {}, rate_limits: {}, sandbox: {}, dashboard: {}, api: {} },
      budget: { budget: {} },
      brain: {},
      secrets: {}
    } as any);
    vi.mocked(api.fetchHealth).mockResolvedValue({ status: 'healthy', version: '1.0.0' } as any);
    vi.mocked(api.checkUpdate).mockResolvedValue({ updateAvailable: false } as any);
    vi.mocked(api.fetchBrains).mockResolvedValue([]);

    await act(async () => {
      render(<SettingsPage />);
    });

    expect(screen.getByText(/Loading Settings/i)).toBeInTheDocument();

    const systemSettings = await screen.findByText(/System Settings/i, {}, { timeout: 4000 });
    expect(systemSettings).toBeInTheDocument();
  }, 10000);
});
