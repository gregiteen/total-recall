import { get, post } from './_base';

export interface MeshNode {
  hostname: string;
  ip: string;
  status: 'online' | 'offline';
  role: 'leader' | 'follower';
  lastHeartbeat: string;
}

export interface LeaderInfo {
  hostname: string;
  ip: string;
}

export async function fetchLeader(): Promise<LeaderInfo> {
  return get('/api/mesh/leader');
}

export async function fetchNodes(): Promise<MeshNode[]> {
  return get('/api/mesh/nodes');
}

export async function forceReElection(): Promise<void> {
  return post('/api/mesh/election/force', {});
}
