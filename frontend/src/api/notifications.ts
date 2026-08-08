import { apiFetch, getApiBase } from './_base';

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

async function parseJsonOrThrow(res: Response, label: string): Promise<unknown> {
  const text = await res.text();
  let data: unknown = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = null;
    }
  }
  if (!res.ok) {
    const obj = data as Record<string, unknown> | null;
    const msg =
      (obj && (obj.error || obj.message)) ||
      `${label} failed: ${res.status}`;
    throw new Error(typeof msg === 'string' ? msg : `${label} failed: ${res.status}`);
  }
  return data;
}

function asArray<T>(data: unknown): T[] {
  if (Array.isArray(data)) return data as T[];
  if (data && typeof data === 'object') {
    const obj = data as Record<string, unknown>;
    if (Array.isArray(obj.rules)) return obj.rules as T[];
    if (Array.isArray(obj.history)) return obj.history as T[];
    if (Array.isArray(obj.entries)) return obj.entries as T[];
  }
  return [];
}

export async function listNotificationRules(): Promise<NotificationRule[]> {
  const res = await apiFetch(`${getApiBase()}/api/notifications/rules`);
  const data = await parseJsonOrThrow(res, 'GET /api/notifications/rules');
  return asArray<NotificationRule>(data);
}

export async function createNotificationRule(
  rule: Omit<NotificationRule, 'id'>,
): Promise<NotificationRule> {
  const res = await apiFetch(`${getApiBase()}/api/notifications/rules`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(rule),
  });
  return parseJsonOrThrow(res, 'POST /api/notifications/rules') as Promise<NotificationRule>;
}

export async function deleteNotificationRule(id: string): Promise<void> {
  const res = await apiFetch(
    `${getApiBase()}/api/notifications/rules/${encodeURIComponent(id)}`,
    { method: 'DELETE' },
  );
  await parseJsonOrThrow(res, 'DELETE /api/notifications/rules');
}

export async function getNotificationHistory(): Promise<NotificationEntry[]> {
  const res = await apiFetch(`${getApiBase()}/api/notifications/history`);
  const data = await parseJsonOrThrow(res, 'GET /api/notifications/history');
  return asArray<NotificationEntry>(data);
}

export async function sendTestNotification(): Promise<void> {
  const res = await apiFetch(`${getApiBase()}/api/notifications/test`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({}),
  });
  await parseJsonOrThrow(res, 'POST /api/notifications/test');
}
