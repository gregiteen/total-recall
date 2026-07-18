import { get, post } from './_base';

export interface MeshInterfaceSummary {
  name: string;
  kind: 'loopback' | 'wifi' | 'ethernet' | 'bridge' | 'vpn_overlay' | 'other';
  mac?: string | null;
  ipv4?: string[];
  ipv6?: string[];
}

export interface MeshNode {
  hostname: string;
  ip: string | null;
  online: boolean;
  self: boolean;
  os: string | null;
  /** Vault mesh_node entity variables (install-specific). */
  role?: string | null;
  labels?: string[];
  capabilities?: string[];
  notes?: string | null;
  title?: string | null;
  description?: string | null;
  last_heartbeat?: string | null;
  entity_path?: string | null;
  has_entity?: boolean;
  vault_only?: boolean;
  transports?: Array<'mesh' | 'lan'>;
  interfaces?: MeshInterfaceSummary[];
  lan_ip?: string | null;
}

export interface LanHost {
  ip: string;
  mac: string;
  interface?: string | null;
  source?: string;
  tr_reachable?: boolean;
  tr_latency_ms?: number | null;
  tr_port?: number | null;
  transports?: string[];
}

export interface LeaderInfo {
  hostname: string;
  ip: string;
}

export async function fetchLeader(): Promise<LeaderInfo> {
  const data = await get<{ leader: LeaderInfo | null }>('/api/mesh/leader');
  if (!data.leader) throw new Error('No online mesh leader is available');
  return data.leader;
}

export async function fetchNodes(): Promise<MeshNode[]> {
  const data = await get<{ nodes: MeshNode[] }>('/api/mesh/nodes');
  return data.nodes;
}

export async function refreshElection(): Promise<LeaderInfo> {
  const data = await post<{ leader: LeaderInfo | null }>('/api/mesh/election/refresh', {});
  if (!data.leader) throw new Error('No online mesh leader is available');
  return data.leader;
}

export interface LatencyResult {
  hostname: string;
  ip: string;
  latency_ms: number | null;
  self?: boolean;
  ok: boolean;
  error?: string;
  status?: number;
}

export async function fetchMeshLatency(): Promise<{
  latency_ms: Record<string, number | null>;
  results: LatencyResult[];
  measured_at: string;
}> {
  return get('/api/mesh/latency');
}

export async function fetchMeshInterfaces(): Promise<{
  interfaces: Array<Record<string, unknown>>;
  summary: MeshInterfaceSummary[];
  measured_at: string;
}> {
  return get('/api/mesh/interfaces');
}

export async function fetchLanDiscovery(opts?: { probe?: boolean; limit?: number }): Promise<{
  discovered_at: string;
  interfaces: Array<Record<string, unknown>>;
  local_lan: Array<Record<string, unknown>>;
  hosts: LanHost[];
  host_count: number;
  tr_reachable_count: number;
}> {
  const params = new URLSearchParams();
  if (opts?.probe === false) params.set('probe', '0');
  if (opts?.limit) params.set('limit', String(opts.limit));
  const q = params.toString();
  return get(`/api/mesh/lan${q ? `?${q}` : ''}`);
}
