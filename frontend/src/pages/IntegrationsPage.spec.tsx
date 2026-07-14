import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
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

    render(<IntegrationsPage />);

    expect(screen.getAllByText(/Integrations/i)[0]).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getAllByText(/Antigravity/i)[0]).toBeInTheDocument();
      // Should show the status badge based on hit count
      expect(screen.getAllByText(/Connected/i).length).toBeGreaterThan(0);
    });
  });

  it('handles connect', async () => {
    vi.mocked(api.getApiBase).mockReturnValue('http://localhost:3000');
    vi.mocked(api.listApiKeys).mockResolvedValue({ keys: [] } as any);
    vi.mocked(api.fetchActiveIntegrations).mockResolvedValue({ success: true, active: [] } as any);
    vi.mocked(api.fetchExtensionStatus).mockResolvedValue({ available: false, connected: false } as any);
    vi.mocked(api.connectClient).mockResolvedValue({ success: true, message: 'Connected' } as any);

    render(<IntegrationsPage />);

    await waitFor(() => {
      expect(screen.getAllByText(/Connect/i).length).toBeGreaterThan(0);
    });

    const connectButtons = screen.getAllByText('Connect');
    fireEvent.click(connectButtons[0]);

    await waitFor(() => {
      expect(api.connectClient).toHaveBeenCalled();
      expect(screen.getByText(/Successfully connected/i)).toBeInTheDocument();
    });
  });
});
