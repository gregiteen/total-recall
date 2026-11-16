import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, act, fireEvent } from '@testing-library/react';
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
    } as never);
    vi.mocked(api.fetchHealth).mockResolvedValue({
      status: 'healthy',
      version: '1.0.0',
      cli_agents: ['claude'],
    } as never);
    vi.mocked(api.checkUpdate).mockResolvedValue({
      updateAvailable: false,
      currentVersion: '1.0.0',
      latestVersion: '1.0.0',
    } as never);
    vi.mocked(api.triggerRecompile).mockResolvedValue({ success: true, message: 'ok' } as never);

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
    vi.mocked(api.fetchHealth).mockResolvedValue({ status: 'healthy' } as never);
    vi.mocked(api.checkUpdate).mockResolvedValue({ updateAvailable: false } as never);
    vi.mocked(api.fetchBrains).mockResolvedValue([]);

    await act(async () => {
      render(<SettingsPage />);
    });

    expect(await screen.findByTestId('settings-error')).toBeInTheDocument();
    expect(screen.getByText(/Config JSON API error: 500/i)).toBeInTheDocument();
  }, 10000);

  it('labels a host ahead of public npm as preview while offering consumer upgrades separately', async () => {
    vi.mocked(api.fetchConfigJson).mockResolvedValue({
      security: { bind: {}, network: {}, rate_limits: {}, sandbox: {}, dashboard: {}, api: {} },
      budget: { budget: {} }, brain: {}, secrets: {},
    } as never);
    vi.mocked(api.fetchHealth).mockResolvedValue({ status: 'healthy', version: '3.38.0' } as never);
    vi.mocked(api.checkUpdate).mockResolvedValue({ updateAvailable: false, previewFeatures: true,
      consumerUpdatesAvailable: true, consumersBehind: 2, currentVersion: '3.38.0', latestVersion: '3.37.0' });
    await act(async () => { render(<SettingsPage />); });
    expect(await screen.findByText('Preview features')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Update Registered Projects' })).toBeInTheDocument();
    expect(screen.queryByText(/Update available \(latest/)).not.toBeInTheDocument();
  });

  it('restarts the server from the UI and reports the outcome', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.mocked(api.fetchConfigJson).mockResolvedValue({
      security: { bind: {}, network: {}, rate_limits: {}, sandbox: {}, dashboard: {}, api: {} },
      budget: { budget: {} },
      brain: {},
      secrets: {},
    } as never);
    vi.mocked(api.fetchHealth).mockResolvedValue({ status: 'healthy', version: '1.0.0' } as never);
    vi.mocked(api.checkUpdate).mockResolvedValue({ updateAvailable: false } as never);
    vi.mocked(api.restartServer).mockResolvedValue({
      success: false,
      scheduled: false,
      message: 'refusing to exit: no supervisor would restart this process',
    } as never);

    await act(async () => {
      render(<SettingsPage />);
    });

    const button = await screen.findByTestId('restart-server', {}, { timeout: 4000 });
    await act(async () => {
      button.click();
    });

    expect(api.restartServer).toHaveBeenCalled();
    // An unsupervised host is a real answer, surfaced verbatim — not swallowed
    // and not presented as a successful restart.
    expect(screen.getByText(/refusing to exit/i)).toBeInTheDocument();
  }, 10000);

  describe('real form against the narrowed config contract', () => {
    const served = () => ({
      security: { network: { require_https: true }, dashboard: { session_ttl_hours: 24 } },
      budget: { budget: { enabled: true, daily_cap_usd: 5 } },
      brain: { url: 'https://brain.test', has_token: true, name: 'main', tags: ['a'] },
      secrets: {},
    });
    const open = async (config = served()) => {
      vi.spyOn(console, 'error').mockImplementation(() => {});
      vi.mocked(api.fetchConfigJson).mockResolvedValue(config as never);
      vi.mocked(api.fetchHealth).mockResolvedValue({ status: 'healthy', version: '1.0.0' } as never);
      vi.mocked(api.checkUpdate).mockResolvedValue({ updateAvailable: false } as never);
      await act(async () => { render(<SettingsPage />); });
      await screen.findByTestId('settings-page', {}, { timeout: 4000 });
    };
    const tokenInput = () => screen.getByPlaceholderText(/Leave blank|No token set/);

    it('posts the served shape back unchanged, with a blank token and no unlisted brain field', async () => {
      await open();
      vi.mocked(api.saveConfigJson).mockResolvedValue(undefined);
      await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Save Configuration' })); });
      const sent = vi.mocked(api.saveConfigJson).mock.calls[0][0] as { brain: Record<string, unknown>; security: Record<string, unknown>; secrets: unknown };
      expect(Object.keys(sent.brain).sort()).toEqual(['has_token', 'name', 'tags', 'url']);
      expect(sent.brain.token).toBeUndefined();
      expect(sent.secrets).toEqual({});
      // empty sections the form adds are plain objects the server allowlist accepts
      expect(sent.security).toMatchObject({ network: { require_https: true }, privacy: {}, sandbox: {} });
    });

    it('sends a typed token once, then clears it and shows the credential as set', async () => {
      await open({ ...served(), brain: { url: 'https://brain.test' } });
      vi.mocked(api.saveConfigJson).mockResolvedValue(undefined);
      fireEvent.change(tokenInput(), { target: { value: 'tr_typed_token_value' } });
      await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Save Configuration' })); });
      expect((vi.mocked(api.saveConfigJson).mock.calls[0][0] as { brain: { token: string } }).brain.token).toBe('tr_typed_token_value');
      expect((tokenInput() as HTMLInputElement).value).toBe('');
      expect(screen.getByPlaceholderText(/Leave blank/)).toBeInTheDocument();
      await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Save Configuration' })); });
      expect((vi.mocked(api.saveConfigJson).mock.calls[1][0] as { brain: { token?: string } }).brain.token).toBeFalsy();
    });

    it('shows which sections a partial save applied', async () => {
      await open();
      vi.mocked(api.saveConfigJson).mockRejectedValue(new Error('Config update did not complete. Applied: secrets. Failed: security. Not attempted: budget.'));
      await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Save Configuration' })); });
      expect((await screen.findByTestId('save-error')).textContent).toContain('Applied: secrets. Failed: security. Not attempted: budget.');
    });
  });
});
