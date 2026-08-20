import { get, post, apiFetch, API_BASE } from './_base';

export interface MeshInterfaceSummary {
  name: string;
  kind: 'loopback' | 'wifi' | 'ethernet' | 'bridge' | 'vpn_overlay' | 'other';
  mac?: string | null;
  ipv4?: string[];
  ipv6?: string[];
}

export type TailscaleVariant = 'daemon' | 'sandboxed' | 'missing' | 'unknown';
export type MeshSshCapability = 'available' | 'unsupported' | 'unknown';
export type AccessSource = 'probe' | 'ssh_config' | 'manual' | 'unknown';

/**
 * How to log in to a node — stored on the node entity, because the control
 * server knows a machine exists but not which account you reach it as.
 */
export interface MeshNodeAccess {
  ssh_user?: string | null;
  ssh_port?: number | null;
  ssh_host?: string | null;
  identity_file?: string | null;
  tailscale_variant?: TailscaleVariant;
  mesh_ssh?: MeshSshCapability;
  source?: AccessSource;
  verified_at?: string | null;
}

/** Server-resolved connection details; address precedence is decided there. */
export interface ResolvedNodeAccess {
  user: string | null;
  host: string | null;
  port: number;
  identity_file: string | null;
  mesh_ssh: MeshSshCapability;
  tailscale_variant: TailscaleVariant;
  source: AccessSource;
  verified_at: string | null;
  /** False when the login account is unknown — the node will refuse you. */
  complete: boolean;
  target: string | null;
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
  /** Device I/O profile for agent UI generation (screen/touch/mic/…). */
  io?: DeviceIoProfile | null;
  ui_hints?: string[];
  /** Raw access record from the vault entity (absent until one is recorded). */
  access?: MeshNodeAccess | null;
  access_resolved?: ResolvedNodeAccess;
}

export interface DeviceIoProfile {
  headless?: boolean;
  display?: {
    present?: boolean;
    touch?: boolean;
    count?: number | null;
    width?: number | null;
    height?: number | null;
  };
  audio?: { input?: boolean; output?: boolean };
  camera?: { present?: boolean };
  input?: { keyboard?: boolean; pointer?: boolean; touch?: boolean };
  channels?: string[];
  ui_hints?: string[];
  sources?: string[];
  measured_at?: string;
  platform?: string;
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

export interface AccessProposal {
  hostname: string;
  ip: string | null;
  /** The `Host` block the login was taken from, so the guess is auditable. */
  matched_host: string;
  access: MeshNodeAccess;
}

/** Logins this host's ssh config could supply for nodes that have none. */
export async function fetchAccessProposals(): Promise<{
  proposals: AccessProposal[];
  missing_access: string[];
  checked_at: string;
}> {
  return get('/api/mesh/access/proposals');
}

/** Apply every ssh-config proposal to its node entity. */
export async function importAccessFromSshConfig(): Promise<{
  success: boolean;
  attempted: number;
  saved: number;
  failed: number;
  results: Array<{
    hostname: string;
    ssh_user: string | null;
    matched_host: string;
    written: boolean;
    reason: string | null;
  }>;
}> {
  return post('/api/mesh/access/import', {});
}

/**
 * Record how to reach a node. Omit a field to leave it alone; send it empty to
 * clear it.
 */
export async function setNodeAccess(body: {
  node: string;
  ssh_user?: string;
  ssh_port?: string | number;
  ssh_host?: string;
  identity_file?: string;
}): Promise<{ success: boolean; path: string; access: MeshNodeAccess }> {
  return post('/api/mesh/access', body);
}

export async function refreshElection(): Promise<LeaderInfo> {
  const data = await post<{ leader: LeaderInfo | null }>('/api/mesh/election/refresh', {});
  if (!data.leader) throw new Error('No online mesh leader is available');
  return data.leader;
}

export interface ElectionHistoryEntry {
  id?: string;
  hostname: string | null;
  ip: string | null;
  note: string;
  at: string;
  strategy?: string;
}

/** Load append-only mesh election events from the vault. */
export async function fetchElectionHistory(): Promise<ElectionHistoryEntry[]> {
  const data = await get<{ events: ElectionHistoryEntry[] }>('/api/mesh/election/history');
  return data.events || [];
}

/** Persist a leader observation to SSSS events (best-effort from UI). */
export async function logElectionObservation(body: {
  hostname?: string | null;
  ip?: string | null;
  note?: string;
}): Promise<{ success: boolean; recorded: boolean }> {
  return post('/api/mesh/election/log', body);
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

export async function fetchDeviceIo(): Promise<{
  io: DeviceIoProfile;
  ui_hints: string[];
  entity_path: string | null;
  measured_at?: string;
}> {
  return get('/api/mesh/io');
}

export type EnrollmentState =
  | 'enrolled'
  | 'needs_login'
  | 'stopped'
  | 'client_unavailable'
  | 'unknown';

export interface EnrollmentStatus {
  state: EnrollmentState;
  enrolled: boolean;
  backend_state: string | null;
  auth_url: string | null;
  ips: string[];
  hostname: string;
  login_server: string | null;
  can_auto_enroll: boolean;
  auto_enroll_blocked_reason: string | null;
  auto_enroll_enabled: boolean;
  client_available: boolean;
  checked_at: string;
}

export interface EnrollResult {
  ok: boolean;
  changed: boolean;
  state: EnrollmentState;
  status: EnrollmentStatus;
  method?: 'preauth-key' | 'interactive' | 'resume';
  auth_url?: string | null;
  reason?: string | null;
  hint?: string;
}

/** Enrollment state of this node on the mesh control server. */
export interface RegisteredNode {
  success: boolean;
  user?: string;
  message: string;
  node?: { id: string | null; name: string | null; ip_addresses: string[]; online: boolean } | null;
}

/**
 * Approve a device that registered interactively.
 *
 * iOS has no other option: the upstream Tailscale app refuses pre-auth keys
 * against a custom control server, so a phone always ends up on headscale's
 * "run this on the server" page waiting for approval.
 */
export async function registerNode(authId: string, user?: string): Promise<RegisteredNode> {
  const res = await apiFetch(`${API_BASE}/api/mesh/register-node`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ auth_id: authId, ...(user ? { user } : {}) }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.message || `register failed: ${res.status}`);
  return data as RegisteredNode;
}

export interface WatchStatus {
  state: 'idle' | 'watching' | 'registered' | 'expired' | 'stopped' | 'unavailable' | 'error';
  id?: string | null;
  node?: { id: string | null; name: string | null; ip_addresses: string[] } | null;
  error?: string | null;
  remaining_ms?: number;
  source?: string;
}

/** Arm the server to approve the next device that signs in. */
export async function startWatch(ttlMinutes?: number): Promise<WatchStatus> {
  const res = await apiFetch(`${API_BASE}/api/mesh/watch`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(ttlMinutes ? { ttlMinutes } : {}),
  });
  // 409 means watch mode is not available here — a real answer the UI acts on,
  // not an error to throw away.
  const data = await res.json().catch(() => ({}));
  if (!res.ok && res.status !== 409) throw new Error(data.error || `watch failed: ${res.status}`);
  return data as WatchStatus;
}

export async function getWatchStatus(): Promise<WatchStatus> {
  return get('/api/mesh/watch');
}

export async function stopWatch(): Promise<WatchStatus> {
  const res = await apiFetch(`${API_BASE}/api/mesh/watch`, { method: 'DELETE' });
  return (await res.json().catch(() => ({ state: 'idle' }))) as WatchStatus;
}

export async function fetchEnrollmentStatus(): Promise<EnrollmentStatus> {
  return get('/api/mesh/enrollment');
}

/** Enroll this node now (mints a pre-auth key when one can be minted). */
export async function enrollThisNode(opts?: {
  login_server?: string;
  user?: string;
  force?: boolean;
}): Promise<EnrollResult> {
  return post('/api/mesh/enroll', opts || {});
}

/** Discover LAN TR peers and upsert mesh_node entities (config:write). */
export async function registerLanMeshNodes(opts?: { probe?: boolean; limit?: number }): Promise<{
  success: boolean;
  discovery: { host_count: number; tr_reachable_count: number; discovered_at: string };
  registration: {
    attempted: number;
    written_count: number;
    results: Array<{ ip: string; hostname: string; path: string; written: boolean; action: string }>;
  };
}> {
  return post('/api/mesh/lan/register', {
    probe: opts?.probe !== false,
    limit: opts?.limit ?? 32,
  });
}

/** A short-lived bearer credential that lets a NEW device join the tailnet. */
export interface PreAuthKey {
  success: boolean;
  key: string;
  expiration: string;
  reusable: boolean;
  ephemeral: boolean;
  ttl_minutes: number;
  /** Control-server URL to enter on the device. Never carries the token. */
  login_server: string | null;
}

export async function mintPreAuthKey(opts?: {
  reusable?: boolean;
  ephemeral?: boolean;
  ttlMinutes?: number;
}): Promise<PreAuthKey> {
  return post('/api/mesh/preauthkey', {
    reusable: opts?.reusable === true,
    ephemeral: opts?.ephemeral === true,
    ttlMinutes: opts?.ttlMinutes,
  });
}
