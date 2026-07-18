import { get, post, del } from './_base';

export interface WebhookConfig {
  provider: string;
  status: 'active' | 'inactive';
  secret?: string;
  has_secret?: boolean;
  secret_ref?: string;
  endpoint_url?: string;
  events?: string[];
  lastReceived?: string;
  totalCount?: number;
}

export interface WebhookEvent {
  id: string;
  provider: string;
  event_type: string;
  received_at: string;
  payload?: any;
  delivery_status?: string;
  parent_event_id?: string;
  delivery_id?: string | null;
}

export async function fetchWebhookConfigs(): Promise<WebhookConfig[]> {
  return get('/api/webhooks/configs');
}

export async function fetchWebhookEvents(provider?: string): Promise<WebhookEvent[]> {
  const query = provider ? `?provider=${encodeURIComponent(provider)}` : '';
  return get(`/api/webhooks/events${query}`);
}

export async function addWebhookConfig(config: WebhookConfig): Promise<WebhookConfig> {
  return post('/api/webhooks/configs', config);
}

export async function deleteWebhookConfig(provider: string): Promise<void> {
  return del(`/api/webhooks/configs/${encodeURIComponent(provider)}`);
}

export async function triggerTestWebhook(provider: string): Promise<void> {
  return post(`/api/webhooks/test/${encodeURIComponent(provider)}`, {});
}

/** Re-run handleWebhook for a stored event (dashboard re-deliver). */
export async function redeliverWebhookEvent(eventId: string): Promise<{
  success: boolean;
  handled: boolean;
  parent_event_id: string;
  delivery_status: string;
}> {
  return post(`/api/webhooks/events/${encodeURIComponent(eventId)}/redeliver`, {});
}
