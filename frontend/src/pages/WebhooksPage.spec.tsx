import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { WebhooksPage } from './WebhooksPage';
import { fetchWebhookConfigs, fetchWebhookEvents, triggerTestWebhook, addWebhookConfig, deleteWebhookConfig } from '../api/webhooks';

vi.mock('../api/webhooks', () => ({
  fetchWebhookConfigs: vi.fn(),
  fetchWebhookEvents: vi.fn(),
  triggerTestWebhook: vi.fn(),
  addWebhookConfig: vi.fn(),
  deleteWebhookConfig: vi.fn(),
}));

describe('WebhooksPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.confirm = vi.fn(() => true);
    // Mock crypto.getRandomValues for secret rotation
    Object.defineProperty(window, 'crypto', {
      value: {
        getRandomValues: (arr: Uint8Array) => {
          for (let i = 0; i < arr.length; i++) {
            arr[i] = i % 256;
          }
          return arr;
        }
      }
    });
  });

  it('renders webhook configs, stats, and events', async () => {
    vi.mocked(fetchWebhookConfigs).mockResolvedValue([
      { provider: 'github', status: 'active', secret: 'abc', lastReceived: '2024-01-01T00:00:00Z', totalCount: 5 },
    ]);
    vi.mocked(fetchWebhookEvents).mockResolvedValue([
      { id: '1', provider: 'github', event_type: 'push', received_at: '2024-01-01T00:00:00Z', payload: { commit: '123' } },
    ]);

    render(<WebhooksPage />);

    await waitFor(() => {
      // Config table
      const githubEls = screen.getAllByText('github');
      expect(githubEls.length).toBeGreaterThan(0);
      expect(screen.getByText('••••••••')).toBeInTheDocument(); // secret masked
      
      // Events log
      expect(screen.getByText('push')).toBeInTheDocument();
      expect(screen.getByText('▶ Show Payload')).toBeInTheDocument();
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

  it('runs through the Add Webhook wizard', async () => {
    vi.mocked(fetchWebhookConfigs).mockResolvedValue([]);
    vi.mocked(fetchWebhookEvents).mockResolvedValue([]);
    vi.mocked(addWebhookConfig).mockResolvedValue({} as any);

    render(<WebhooksPage />);
    
    // Open wizard
    await userEvent.click(screen.getByText('Add Webhook'));
    
    // Step 1: Select Provider
    await waitFor(() => {
      expect(screen.getByText('Provider Configuration Wizard')).toBeInTheDocument();
    });
    
    const providerInput = screen.getByPlaceholderText('e.g. github, stripe, npm');
    await userEvent.type(providerInput, 'stripe');
    
    const nextBtn1 = screen.getByText('Next');
    await userEvent.click(nextBtn1);
    
    // Step 2: Configuration
    await waitFor(() => {
      expect(screen.getByText('Security & Configuration')).toBeInTheDocument();
    });
    
    const secretInput = screen.getByPlaceholderText('Shared secret for HMAC validation');
    await userEvent.type(secretInput, 'mysecret');
    
    const eventsInput = screen.getByPlaceholderText('push, pull_request (optional)');
    await userEvent.type(eventsInput, 'charge.succeeded');
    
    const nextBtn2 = screen.getByText('Next');
    await userEvent.click(nextBtn2);
    
    // Step 3: Review & Save
    await waitFor(() => {
      expect(screen.getByText('Review & Save')).toBeInTheDocument();
    });
    
    await userEvent.click(screen.getByText('Save Webhook'));
    
    expect(addWebhookConfig).toHaveBeenCalledWith({
      provider: 'stripe',
      status: 'active',
      secret: 'mysecret',
      events: ['charge.succeeded']
    });
  });

  it('deletes a webhook', async () => {
    vi.mocked(fetchWebhookConfigs).mockResolvedValue([
      { provider: 'npm', status: 'active', totalCount: 0 },
    ]);
    vi.mocked(fetchWebhookEvents).mockResolvedValue([]);
    
    render(<WebhooksPage />);
    
    await waitFor(() => {
      expect(screen.getByText('Remove')).toBeInTheDocument();
    });

    await userEvent.click(screen.getByText('Remove'));
    
    expect(window.confirm).toHaveBeenCalled();
    expect(deleteWebhookConfig).toHaveBeenCalledWith('npm');
  });
});
