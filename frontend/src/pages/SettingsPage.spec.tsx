import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import SettingsPage from './SettingsPage';
import * as api from '../api';

vi.mock('../api');

describe('SettingsPage', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('renders System Settings when config loads', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});

    vi.mocked(api.fetchConfigJson).mockResolvedValue({
      security: { bind: {}, network: {}, rate_limits: {}, sandbox: {}, dashboard: {}, api: {} },
      budget: { budget: {} },
      brain: {},
      secrets: {},
    } as any);
    vi.mocked(api.fetchHealth).mockResolvedValue({
      status: 'healthy',
      version: '1.0.0',
      cli_agents: ['claude'],
    } as any);
    vi.mocked(api.checkUpdate).mockResolvedValue({
      updateAvailable: false,
      currentVersion: '1.0.0',
      latestVersion: '1.0.0',
    } as any);
    vi.mocked(api.triggerRecompile).mockResolvedValue({ success: true, message: 'ok' } as any);

    await act(async () => {
      render(<SettingsPage />);
    });

    const systemSettings = await screen.findByText(/System Settings/i, {}, { timeout: 4000 });
    expect(systemSettings).toBeInTheDocument();
    expect(screen.getByTestId('settings-page')).toBeInTheDocument();
  }, 10000);

  it('shows error + retry when config fails', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.mocked(api.fetchConfigJson).mockRejectedValue(new Error('Config JSON API error: 500'));
    vi.mocked(api.fetchHealth).mockResolvedValue({ status: 'healthy' } as any);
    vi.mocked(api.checkUpdate).mockResolvedValue({ updateAvailable: false } as any);
    vi.mocked(api.fetchBrains).mockResolvedValue([]);

    await act(async () => {
      render(<SettingsPage />);
    });

    expect(await screen.findByTestId('settings-error')).toBeInTheDocument();
    expect(screen.getByText(/Config JSON API error: 500/i)).toBeInTheDocument();
  }, 10000);
});
