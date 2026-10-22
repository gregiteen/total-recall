import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import IntegrationsPage from './IntegrationsPage';
import * as api from '../api';

vi.mock('../api');

describe('IntegrationsPage', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('renders correctly and loads data', async () => {
    vi.mocked(api.getApiBase).mockReturnValue('http://localhost:3000');
    vi.mocked(api.listApiKeys).mockResolvedValue({
      keys: [
        { id: '1', name: 'Antigravity', token_preview: 'abc', created_at: '', last_used_at: '', hit_count: 1, revoked: false, scopes: [] }
      ]
    } as never);
    vi.mocked(api.fetchActiveIntegrations).mockResolvedValue({ success: true, active: ['antigravity'] } as never);
    vi.mocked(api.fetchExtensionStatus).mockResolvedValue({ available: true, connected: true } as never);

    await act(async () => {
      render(<IntegrationsPage />);
    });

    expect(screen.getAllByText(/Integrations/i)[0]).toBeInTheDocument();

    expect((await screen.findAllByText(/Antigravity/i, undefined, { timeout: 4000 }))[0]).toBeInTheDocument();
    expect((await screen.findAllByText(/Connected/i, undefined, { timeout: 4000 })).length).toBeGreaterThan(0);
    expect(await screen.findByText(/Personal Access Tokens/i)).toBeInTheDocument();
    expect(await screen.findByText(/Generate Extension Token/i)).toBeInTheDocument();
  }, 10000);

  it('handles generating an extension token', async () => {
    vi.mocked(api.getApiBase).mockReturnValue('http://localhost:3000');
    vi.mocked(api.listApiKeys).mockResolvedValue({ keys: [] } as never);
    vi.mocked(api.fetchActiveIntegrations).mockResolvedValue({ success: true, active: [] } as never);
    vi.mocked(api.fetchExtensionStatus).mockResolvedValue({ available: true, connected: false } as never);
    vi.mocked(api.issueApiKey).mockResolvedValue({
      id: 'ext-key',
      name: 'Chrome Extension',
      token: 'tr_mock_extension_token_12345',
      token_prefix: 'tr_mock',
      scopes: ['*'],
      created_at: new Date().toISOString(),
      expires_at: null,
      last_used_at: null,
      hit_count: 0,
      revoked: false,
    } as never);

    await act(async () => {
      render(<IntegrationsPage />);
    });

    const genButton = await screen.findByText(/Generate Extension Token/i);
    await act(async () => {
      genButton.click();
    });

    expect(api.issueApiKey).toHaveBeenCalledWith('Chrome Extension', ['*']);
    expect(await screen.findByDisplayValue(/tr_mock_extension_token_12345/i)).toBeInTheDocument();
  }, 10000);

  it('handles connect', async () => {
    vi.mocked(api.getApiBase).mockReturnValue('http://localhost:3000');
    vi.mocked(api.listApiKeys).mockResolvedValue({ keys: [] } as never);
    vi.mocked(api.fetchActiveIntegrations).mockResolvedValue({ success: true, active: [] } as never);
    vi.mocked(api.fetchExtensionStatus).mockResolvedValue({ available: false, connected: false } as never);
    vi.mocked(api.connectClient).mockResolvedValue({ success: true, message: 'Connected' } as never);

    await act(async () => {
      render(<IntegrationsPage />);
    });

    const connectButtons = await screen.findAllByText(/Enable Injection/i, undefined, { timeout: 4000 });
    expect(connectButtons.length).toBeGreaterThan(0);

    await act(async () => {
      connectButtons[0].click();
    });

    expect(api.connectClient).toHaveBeenCalled();
    expect(await screen.findByText(/Successfully enabled/i, undefined, { timeout: 4000 })).toBeInTheDocument();
  }, 10000);
});
