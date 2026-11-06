/**
 * Revoke a stored credential at its provider, using the credential itself.
 *
 * `provider-keys --revoke` needs an account-wide management API. Some providers have none, but a
 * token can still end itself. A provider declares that in its catalog entry
 * (`rotation.self_revoke`). The only proof of success is the provider rejecting the token afterwards:
 * a 2xx from the revoke endpoint proves nothing. The store entry is removed only after that proof,
 * so a failed revoke never leaves a live token that nobody holds.
 *
 * No secret value is ever logged or returned.
 */

import { appendAuditAsync, loadSecrets } from './secrets-gateway.mjs';
import { deleteSecret, listSecretsMeta, secretValueFingerprint } from './secrets-store.mjs';
import { getProvider, providerForKeyName } from './provider-catalog.mjs';

const ACCEPTED = 200;
const REJECTED = 401;

/** The status the provider answers this token with, or null when it could not be reached. */
async function probe(spec, token, fetchImpl) {
  try {
    const res = await fetchImpl(spec.probe_url, { headers: { Authorization: `Bearer ${token}` } });
    return res.status;
  } catch {
    return null;
  }
}

/**
 * @param {string} brainDir
 * @param {string} key stored secret to revoke
 * @param {{ yes?: boolean, fetchImpl?: typeof fetch, sleep?: (ms:number)=>Promise<void>, attempts?: number, waitMs?: number }} [options]
 *   Without `yes` it reports the plan and sends nothing.
 */
export async function revokeStoredSecret(brainDir, key, {
  yes = false,
  fetchImpl = fetch,
  sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  attempts = 5,
  waitMs = 2000,
} = {}) {
  const meta = (await listSecretsMeta(brainDir)).find((row) => row.key === key);
  const all = await loadSecrets(brainDir);
  const token = all?.[key];
  if (!meta || typeof token !== 'string' || !token) throw new Error(`Secret not found: ${key}`);

  const provider = (meta.provider && getProvider(meta.provider)) || providerForKeyName(key);
  const spec = provider?.rotation?.self_revoke;
  if (!spec) {
    const where = provider?.console_url ? `; delete it at ${provider.console_url}` : '';
    throw new Error(`${provider?.name || 'This provider'} declares no way to revoke a key with the key itself${where}`);
  }

  const sharedWith = Object.keys(all).filter((name) => name !== key && all[name] === token);
  if (sharedWith.length) {
    throw new Error(`Refusing to revoke ${key}: ${sharedWith.join(', ')} hold the same value and would stop working`);
  }

  const plan = { key, provider: provider.id, fingerprint: secretValueFingerprint(token).slice(0, 12) };
  if (!yes) return { ok: true, planned: true, ...plan };

  const before = await probe(spec, token, fetchImpl);
  if (before !== ACCEPTED && before !== REJECTED) {
    throw new Error(`Could not tell whether ${key} is live (${before === null ? 'provider unreachable' : `HTTP ${before}`}); nothing was revoked`);
  }

  let requestStatus = null;
  let after = before;
  if (before === ACCEPTED) {
    try {
      const res = await fetchImpl(spec.url, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ [spec.param]: token }),
      });
      requestStatus = res.status;
    } catch {
      requestStatus = null;
    }
    for (let attempt = 0; attempt < attempts; attempt += 1) {
      if (attempt) await sleep(waitMs);
      after = await probe(spec, token, fetchImpl);
      if (after === REJECTED) break;
    }
  }

  if (after !== REJECTED) {
    return {
      ok: false,
      revoked: false,
      ...plan,
      request_status: requestStatus,
      probe_status: after,
      console_url: provider.console_url ?? null,
    };
  }

  await appendAuditAsync(brainDir, { action: 'revoke', key, actor: 'cli' });
  await deleteSecret(brainDir, key);
  return { ok: true, revoked: true, already_rejected: before === REJECTED, deleted: true, request_status: requestStatus, ...plan };
}
