import { get, post } from './_base';

export interface MeshNode {
  hostname: string;
  ip: string;
  online: boolean;
  self: boolean;
  os: string | null;
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
