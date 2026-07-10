/**
 * Total Recall Operation Contract entry points.
 *
 * All mutations go through the SSSS 0.9 package kernel via
 * `processViaPackageKernel`. The local Stage 1–7 pipeline has been removed.
 */
import fs from 'fs';
import path from 'path';
import crypto from 'node:crypto';
import { processViaPackageKernel } from './ssss-kernel-bridge.mjs';

/**
 * @deprecated Sync API removed. Use {@link processOperationAsync}.
 */
export function processOperation(_envelope, _vaultRoot, _options = {}) {
  throw new Error(
    'processOperation (sync) was removed. Use processOperationAsync — all mutations go through the SSSS 0.9 package kernel.',
  );
}

/**
 * Primary Operation Contract entry for Total Recall.
 * Always routes through `@ssss/cli` package kernel + TR host adapters.
 */
export async function processOperationAsync(envelope, vaultRoot, options = {}) {
  return processViaPackageKernel(envelope, vaultRoot, {
    ...options,
    agentRole: options.agentRole || envelope?.actor?.role || 'admin',
  });
}

// ─── Lease helpers (host-local filesystem lease store, used by tests/API) ────

export function acquireLease(workspaceId, vfsPath, leaseStore, ttlMs = 30000) {
  const dir = path.join(leaseStore, workspaceId);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const lp = path.join(dir, `${vfsPath.replace(/\//g, '__')}.lease.json`);
  if (fs.existsSync(lp)) {
    try {
      const e = JSON.parse(fs.readFileSync(lp, 'utf8'));
      if (new Date(e.expires_at) >= new Date()) return { error: `Path '${vfsPath}' already leased.` };
    } catch { /* replace corrupt lease */ }
  }
  const leaseId = crypto.randomUUID();
  const expiresAt = new Date(Date.now() + ttlMs).toISOString();
  fs.writeFileSync(lp, JSON.stringify({
    lease_id: leaseId, path: vfsPath, workspace_id: workspaceId, expires_at: expiresAt,
  }, null, 2));
  return { lease_id: leaseId, expires_at: expiresAt };
}

export function releaseLease(workspaceId, vfsPath, leaseId, leaseStore) {
  const lp = path.join(leaseStore, workspaceId, `${vfsPath.replace(/\//g, '__')}.lease.json`);
  if (!fs.existsSync(lp)) return { released: true };
  try {
    const e = JSON.parse(fs.readFileSync(lp, 'utf8'));
    if (e.lease_id !== leaseId) return { error: 'Lease ID mismatch.' };
    fs.unlinkSync(lp);
    return { released: true };
  } catch (err) {
    return { error: err.message };
  }
}
