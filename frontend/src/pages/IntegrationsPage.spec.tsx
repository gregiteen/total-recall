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
    } as any);
    vi.mocked(api.fetchActiveIntegrations).mockResolvedValue({ success: true, active: ['antigravity'] } as any);
    vi.mocked(api.fetchExtensionStatus).mockResolvedValue({ available: true, connected: true } as any);

    await act(async () => {
      render(<IntegrationsPage />);
    });

    expect(screen.getAllByText(/Integrations/i)[0]).toBeInTheDocument();

    expect((await screen.findAllByText(/Antigravity/i, undefined, { timeout: 4000 }))[0]).toBeInTheDocument();
    expect((await screen.findAllByText(/Connected/i, undefined, { timeout: 4000 })).length).toBeGreaterThan(0);
  }, 10000);

  it('handles connect', async () => {
    vi.mocked(api.getApiBase).mockReturnValue('http://localhost:3000');
    vi.mocked(api.listApiKeys).mockResolvedValue({ keys: [] } as any);
    vi.mocked(api.fetchActiveIntegrations).mockResolvedValue({ success: true, active: [] } as any);
    vi.mocked(api.fetchExtensionStatus).mockResolvedValue({ available: false, connected: false } as any);
    vi.mocked(api.connectClient).mockResolvedValue({ success: true, message: 'Connected' } as any);

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
