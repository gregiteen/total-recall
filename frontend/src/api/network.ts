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

export const networkApi = {
  getStats: async (): Promise<{ stats: NetworkStats, audit_count: number }> => {
    const res = await fetch('/api/network/stats');
    if (!res.ok) throw new Error('Failed to fetch network stats');
    return res.json();
  },

  getPolicy: async (): Promise<NetworkPolicy> => {
    const res = await fetch('/api/network/policy');
    if (!res.ok) throw new Error('Failed to fetch network policy');
    return res.json();
  },

  updatePolicy: async (patch: Partial<NetworkPolicy>): Promise<any> => {
    const res = await fetch('/api/network/policy', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch)
    });
    if (!res.ok) throw new Error('Failed to update network policy');
    return res.json();
  },

  blockDomain: async (domain: string): Promise<any> => {
    const res = await fetch('/api/network/block', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ domain })
    });
    if (!res.ok) throw new Error('Failed to block domain');
    return res.json();
  },

  unblockDomain: async (domain: string): Promise<any> => {
    const res = await fetch(`/api/network/block/${encodeURIComponent(domain)}`, {
      method: 'DELETE'
    });
    if (!res.ok) throw new Error('Failed to unblock domain');
    return res.json();
  },

  getAuditLog: async (params?: { domain?: string; status?: string; since?: string }): Promise<{ audit: AuditLogEntry[] }> => {
    const query = new URLSearchParams(params as any).toString();
    const res = await fetch(`/api/network/audit?${query}`);
    if (!res.ok) throw new Error('Failed to fetch audit log');
    return res.json();
  }
};
