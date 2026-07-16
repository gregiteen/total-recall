import { get, post, del } from './_base';

export interface HeadscaleNode {
  id: string;
  name: string;
  user?: string | { name: string; id?: string };
  ipAddresses: string[];
  createdAt: string;
  lastSeen: string;
  online: boolean;
  clientVersion?: string;
}

export interface PreAuthKey {
  id: string;
  key: string;
  user: string;
  reusable: boolean;
  ephemeral?: boolean;
  expiration: string;
  createdAt: string;
  used: boolean;
}

export interface HeadscaleUser {
  id: string;
  name: string;
  createdAt: string;
}

export interface HeadscaleNodesResponse {
  nodes?: HeadscaleNode[];
  machines?: HeadscaleNode[];
}

export interface PreAuthKeysResponse {
  preAuthKeys?: PreAuthKey[];
}

export interface UsersResponse {
  users?: HeadscaleUser[];
}

export async function fetchHeadscaleNodes(): Promise<HeadscaleNode[]> {
  const data = await get<HeadscaleNodesResponse>('/api/headscale/node');
  return data.nodes || data.machines || [];
}

export async function deleteHeadscaleNode(id: string): Promise<void> {
  return del(`/api/headscale/node/${encodeURIComponent(id)}`);
}

export async function fetchPreAuthKeys(user?: string): Promise<PreAuthKey[]> {
  const query = user ? `?user=${encodeURIComponent(user)}` : '';
  const data = await get<PreAuthKeysResponse>(`/api/headscale/preauthkey${query}`);
  return data.preAuthKeys || [];
}

export async function createPreAuthKey(params: {
  user: string;
  reusable: boolean;
  expiration: string;
  ephemeral?: boolean;
}): Promise<PreAuthKey> {
  return post<PreAuthKey>('/api/headscale/preauthkey', params);
}

export async function fetchHeadscaleUsers(): Promise<HeadscaleUser[]> {
  const data = await get<UsersResponse>('/api/headscale/user');
  return data.users || [];
}
