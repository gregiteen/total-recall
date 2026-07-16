import { get, post, del } from './_base';

export interface NotificationRule {
  id: string;
  event: string;
  channel: 'desktop' | 'webhook' | 'email';
  priority: 'critical' | 'high' | 'low';
  enabled: boolean;
  quietHours: boolean;
}

export interface NotificationEntry {
  id: string;
  title: string;
  message: string;
  channel: string;
  status: 'delivered' | 'failed';
  timestamp: string;
}

export async function listNotificationRules(): Promise<NotificationRule[]> {
  return get('/api/notifications/rules');
}

export async function createNotificationRule(
  rule: Omit<NotificationRule, 'id'>,
): Promise<NotificationRule> {
  return post('/api/notifications/rules', rule);
}

export async function deleteNotificationRule(id: string): Promise<void> {
  return del(`/api/notifications/rules/${encodeURIComponent(id)}`);
}

export async function getNotificationHistory(): Promise<NotificationEntry[]> {
  return get('/api/notifications/history');
}

export async function sendTestNotification(): Promise<void> {
  return post('/api/notifications/test', {});
}
