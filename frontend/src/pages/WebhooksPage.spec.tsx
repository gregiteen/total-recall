import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { WebhooksPage } from './WebhooksPage';
import { fetchWebhookConfigs, fetchWebhookEvents, triggerTestWebhook } from '../api/webhooks';

vi.mock('../api/webhooks', () => ({
  fetchWebhookConfigs: vi.fn(),
  fetchWebhookEvents: vi.fn(),
  triggerTestWebhook: vi.fn(),
}));

describe('WebhooksPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders webhook configs and events', async () => {
    vi.mocked(fetchWebhookConfigs).mockResolvedValue([
      { provider: 'github', status: 'active', lastReceived: '2024-01-01T00:00:00Z', totalCount: 5 },
    ]);
    vi.mocked(fetchWebhookEvents).mockResolvedValue([
      { id: '1', provider: 'github', event_type: 'push', received_at: '2024-01-01T00:00:00Z' },
    ]);

    render(<WebhooksPage />);

    await waitFor(() => {
      expect(screen.getAllByText('github').length).toBeGreaterThan(0);
      expect(screen.getByText('push')).toBeInTheDocument();
    });
  });

  it('handles testing a webhook', async () => {
    vi.mocked(fetchWebhookConfigs).mockResolvedValue([
      { provider: 'npm', status: 'active', totalCount: 0 },
    ]);
    vi.mocked(fetchWebhookEvents).mockResolvedValue([]);
    vi.mocked(triggerTestWebhook).mockResolvedValue(undefined);

    render(<WebhooksPage />);
    
    await waitFor(() => {
      expect(screen.getByText('Test')).toBeInTheDocument();
    });

    await userEvent.click(screen.getByText('Test'));
    expect(triggerTestWebhook).toHaveBeenCalledWith('npm');
  });
});
