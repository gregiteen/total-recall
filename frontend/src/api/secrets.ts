import { get, post } from './_base';
import type { SecretCatalogKey } from './keys';

export interface SyncNodeStatus {
  hostname: string;
  ip: string;
  status: 'synced' | 'out_of_sync' | 'unreachable';
  checksum: string | null;
}

export interface SyncStatusResponse {
  localChecksum: string;
  nodes: SyncNodeStatus[];
}

export interface TriggerSyncResponse {
  success: boolean;
  results: {
    hostname: string;
    ip: string;
    success: boolean;
    error?: string;
  }[];
}

export type SecretEntry = SecretCatalogKey;

export async function listSecrets(): Promise<SecretEntry[]> {
  const data = (await get('/api/secrets/list')) as { keys: SecretEntry[] };
  return data.keys;
}

export async function addSecret(key: string, value: string, payload: Record<string, unknown>): Promise<SecretEntry> {
  return (await post('/api/secrets', { key, value, ...payload })) as SecretEntry;
}

export async function editSecret(key: string, patch: Record<string, unknown>): Promise<SecretEntry> {
  const { updateSecretMeta } = await import('./keys');
  return updateSecretMeta(key, patch);
}

export async function deleteSecret(key: string): Promise<void> {
  const { deleteProviderSecret } = await import('./keys');
  return deleteProviderSecret(key);
}

export async function triggerSync(): Promise<TriggerSyncResponse> {
  return (await post('/api/secrets/sync/trigger', {})) as TriggerSyncResponse;
}

export async function getSyncStatus(): Promise<SyncStatusResponse> {
  return (await get('/api/secrets/sync/status')) as SyncStatusResponse;
}
