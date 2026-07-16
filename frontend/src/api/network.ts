import { get, post, del, apiFetch, API_BASE } from './_base';

export interface NetworkStats {
  total: number;
  blocked: number;
  queueLength: number;
  active: number;
  completed: number;
  errors: number;
  timeouts: number;
  peakActive: number;
  peakQueue: number;
  domains: Record<string, {
    active: number;
    total: number;
    avgTime: number;
    errors: number;
  }>;
}

export interface NetworkPolicy {
  id: string;
  blocked_domains: string[];
  max_global_concurrency: number;
  max_per_domain_concurrency: number;
  default_timeout_ms: number;
  domain_limits?: Record<string, {
    maxConcurrent: number;
    minIntervalMs: number;
  }>;
  whitelist_mode?: boolean;
  allowed_domains?: string[];
}

export interface AuditLogEntry {
  timestamp: string;
  domain: string;
  url: string;
  method: string;
  status: number;
  duration: number;
  queueWait: number;
  error?: string;
}

export async function getNetworkStats(): Promise<{ stats: NetworkStats, audit_count: number }> {
  return get('/api/network/stats');
}

export async function getNetworkPolicy(): Promise<NetworkPolicy> {
  return get('/api/network/policy');
}

export async function updateNetworkPolicy(patch: Partial<NetworkPolicy>): Promise<any> {
  const res = await apiFetch(API_BASE + '/api/network/policy', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(patch),
  });
  if (!res.ok) throw new Error(`PUT /api/network/policy failed: ${res.status}`);
  return res.json();
}

export async function blockDomain(domain: string): Promise<any> {
  return post('/api/network/block', { domain });
}

export async function unblockDomain(domain: string): Promise<any> {
  return del(`/api/network/block/${encodeURIComponent(domain)}`);
}

export async function getAuditLog(params?: { domain?: string; status?: string; since?: string }): Promise<{ audit: AuditLogEntry[] }> {
  const query = params ? '?' + new URLSearchParams(params as any).toString() : '';
  return get(`/api/network/audit${query}`);
}

export const networkApi = {
  getStats: getNetworkStats,
  getPolicy: getNetworkPolicy,
  updateNetworkPolicy,
  blockDomain,
  unblockDomain,
  getAuditLog,
};
