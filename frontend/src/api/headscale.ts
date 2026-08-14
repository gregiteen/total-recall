import { get, post, del, apiFetch } from './_base';

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

export interface HeadscalePolicy {
  policy: string | null;
  updatedAt: string | null;
  configured: boolean;
  /** True when the server is in database mode but no policy has been written yet. */
  unset?: boolean;
}

/**
 * Read the control server's ACL policy.
 *
 * A 409 means the server is in `policy.mode: file`, where the policy lives on
 * the server's disk and the API cannot manage it. That is a fixable
 * configuration state rather than a failure, so it is surfaced as a typed
 * result the UI can explain instead of a thrown error.
 */
export async function fetchHeadscalePolicy(): Promise<HeadscalePolicy & { fileMode?: boolean }> {
  try {
    return await get<HeadscalePolicy>('/api/headscale/policy');
  } catch (err) {
    const status = (err as { status?: number })?.status;
    if (status === 409) {
      return { policy: null, updatedAt: null, configured: false, fileMode: true };
    }
    throw err;
  }
}

export async function saveHeadscalePolicy(policy: string): Promise<HeadscalePolicy> {
  const res = await apiFetch('/api/headscale/policy', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ policy }),
  });
  if (!res.ok) {
    const detail = await res.json().catch(() => ({}));
    const error = new Error((detail as { error?: string }).error || `Policy save failed (${res.status})`);
    (error as { status?: number }).status = res.status;
    throw error;
  }
  return res.json();
}

/**
 * The single-operator policy: every mesh member reaches every member, and may
 * SSH between them. Mesh membership is the trust boundary, so anything admitted
 * to the tailnet inherits this — narrow it before admitting a node you do not
 * control.
 */
export function buildMeshSshPolicy(allowRoot = false): string {
  return JSON.stringify(
    {
      acls: [{ action: 'accept', src: ['*'], dst: ['*:*'] }],
      ssh: [
        {
          action: 'accept',
          src: ['autogroup:member'],
          dst: ['autogroup:self'],
          users: allowRoot ? ['autogroup:nonroot', 'root'] : ['autogroup:nonroot'],
        },
      ],
    },
    null,
    2,
  );
}
