/** Non-secret auth metadata; ciphertext, hardware keys and OS projections stay in auth adapters. */
import path from 'node:path';
import { PluginStateStore } from './ssss-store.mjs';
export function authState(file) { return new PluginStateStore(path.resolve(file), 'auth'); }
export function assertNoSecretValues(value) {
  if (!value || typeof value !== 'object') return;
  for (const [key, item] of Object.entries(value)) {
    if (/^(value|password|plaintext|private_key|api_key|access_token|refresh_token|token|dotenv)$/i.test(key) && item != null && item !== '') throw new Error('Secret values cannot enter SSSS auth metadata');
    assertNoSecretValues(item);
  }
}
export function authLedger(file) {
  const rows = authState(file).read([]);
  if (!Array.isArray(rows) || rows.some(row => !row || typeof row !== 'object' || Array.isArray(row))) throw new Error('Invalid auth metadata ledger');
  rows.forEach(assertNoSecretValues); return rows;
}
export function appendAuthMetadata(file, row) { assertNoSecretValues(row); return authState(file).append(row); }
/** For server paths. A host from before appendAsync keeps its synchronous append. */
export async function appendAuthMetadataAsync(file, row) {
  assertNoSecretValues(row);
  const store = authState(file);
  return typeof store.appendAsync === 'function' ? store.appendAsync(row) : store.append(row);
}
/** The newest rows only, so an audit view never parses the whole history. */
export function authLedgerTail(file, limit) {
  const store = authState(file);
  const rows = typeof store.readTail === 'function' ? store.readTail(limit) : store.read([]).slice(-limit);
  if (!Array.isArray(rows) || rows.some(row => !row || typeof row !== 'object' || Array.isArray(row))) throw new Error('Invalid auth metadata ledger');
  rows.forEach(assertNoSecretValues); return rows;
}
