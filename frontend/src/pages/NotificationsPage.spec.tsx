import { render, screen, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NotificationsPage } from './NotificationsPage';
import { listNotificationRules, getNotificationHistory } from '../api/notifications';

vi.mock('../api/notifications', () => ({
  listNotificationRules: vi.fn(),
  createNotificationRule: vi.fn(),
  deleteNotificationRule: vi.fn(),
  getNotificationHistory: vi.fn(),
  sendTestNotification: vi.fn(),
}));

describe('NotificationsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders notification rules', async () => {
    vi.mocked(listNotificationRules).mockResolvedValue([
      {
        id: 'rule-1',
        event: 'node_offline',
        channel: 'desktop',
        priority: 'critical',
        enabled: true,
        quietHours: false,
      },
    ]);
    vi.mocked(getNotificationHistory).mockResolvedValue([]);

    render(<NotificationsPage />);

    await waitFor(() => {
      expect(screen.getByText('Node Offline')).toBeInTheDocument();
      expect(screen.getByText('CRITICAL')).toBeInTheDocument();
      expect(screen.getByText('ON')).toBeInTheDocument();
    });
  });

  it('renders notification history', async () => {
    vi.mocked(listNotificationRules).mockResolvedValue([]);
    vi.mocked(getNotificationHistory).mockResolvedValue([
      {
        id: 'entry-1',
        title: 'Node went offline',
        message: 'Node alpha-1 is unreachable',
        channel: 'desktop',
        status: 'delivered',
        timestamp: '2024-06-01T12:00:00Z',
      },
    ]);

    render(<NotificationsPage />);

    await waitFor(() => {
      expect(screen.getByText('Node went offline')).toBeInTheDocument();
      expect(screen.getByText('Node alpha-1 is unreachable')).toBeInTheDocument();
      expect(screen.getByText('DELIVERED')).toBeInTheDocument();
    });
  });
});
