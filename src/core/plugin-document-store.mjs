/** Generic native plugin document/event binding to the canonical SSSS kernel. */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createKernel } from '@ssss/cli/kernel';
import { FileSystemVfs } from '@ssss/cli/vfs';
import { JsonlEventStore } from '@ssss/cli/events';
import { FileIdempotencyStore } from '@ssss/cli/idempotency';
import { FileLeaseStore } from '@ssss/cli/leases';
import { loadRegistries, composeRegistryLayers } from '@ssss/cli/registry';
import { createValidator } from '@ssss/cli/validator';
import { resolveContainedPath } from '@ssss/cli/engine';
export { parseDocument, serializeDocument } from '@ssss/cli/frontmatter';

const worker = fileURLToPath(import.meta.url);
/** Pinned binary/output companions use the same contained, no-link namespace. */
export function resolvePluginAssetPath(vaultRoot, relative) {
  const root = path.resolve(vaultRoot), target = resolveContainedPath(root, relative);
  const parts = [root];
  let current = root;
  for (const segment of relative.split('/')) { current = path.join(current, segment); parts.push(current); }
  for (let i = 0; i < parts.length; i++) {
    const stat = fs.lstatSync(parts[i], { throwIfNoEntry: false });
    if (stat && (stat.isSymbolicLink() || (i < parts.length - 1 && !stat.isDirectory()))) throw new Error('Unsafe plugin companion path');
  }
  return target;
}
export async function executePluginDocument({ plugin, vaultRoot, extension, envelope }) {
  if (!/^[a-z][a-z0-9-]{0,63}$/.test(plugin) || extension?.registry !== plugin) throw new Error('Explicit matching plugin extension required');
  if (!path.isAbsolute(vaultRoot)) throw new Error('Explicit absolute plugin vault required');
  const stat = fs.lstatSync(vaultRoot, { throwIfNoEntry: false });
  if (stat && (!stat.isDirectory() || stat.isSymbolicLink())) throw new Error('Unsafe plugin vault');
  fs.mkdirSync(vaultRoot, { recursive: true, mode: 0o700 });
  const roots = ['.events', '.idempotency', '.leases'];
  for (const name of roots) {
    const entry = fs.lstatSync(path.join(vaultRoot, name), { throwIfNoEntry: false });
    if (entry && (!entry.isDirectory() || entry.isSymbolicLink())) throw new Error('Unsafe SSSS infrastructure directory');
  }
  const registry = composeRegistryLayers({ core: loadRegistries().core, installed: [extension] });
  const principal = { id: `plugin:${plugin}`, kind: 'service', workspaceIds: [plugin],
    capabilities: [`${plugin}:*`, 'write:event', 'ssss:asset:*'], authentication: { provider: 'native-plugin-host', assurance: 'verified' } };
  const leases = new FileLeaseStore(path.join(vaultRoot, '.leases'));
  const kernel = createKernel({ validator: createValidator({ registrySet: registry }),
    vfs: new FileSystemVfs(vaultRoot), eventStore: new JsonlEventStore(path.join(vaultRoot, '.events')),
    idempotencyStore: new FileIdempotencyStore(path.join(vaultRoot, '.idempotency')), leaseStore: leases });
  const operation = { ...envelope, workspace_id: plugin, operation_id: envelope.operation_id || crypto.randomUUID(),
    idempotency_key: envelope.idempotency_key || crypto.randomUUID() };
  delete operation.actor;
  const input = { workspace_id: plugin, target: operation.path, principal_id: principal.id, operation_id: operation.operation_id };
  const lease = await leases.acquire(input);
  try {
    operation.lease_id = lease.lease_id;
    const preflight = await kernel.execute({ ...operation, dry_run: true }, { principal, requireLease: true });
    if (!preflight.success) throw new Error(`SSSS document rejected: ${preflight.error.code}: ${preflight.error.message}`);
    if (envelope.dry_run) return preflight;
    const result = await kernel.execute(operation, { principal, requireLease: true });
    if (!result.success) throw new Error(`SSSS document rejected: ${result.error.code}: ${result.error.message}`);
    return result;
  } finally { await leases.release({ ...input, lease_id: lease.lease_id }); }
}

/** Synchronous compatibility transport; persistence itself uses the async kernel. */
export function pluginDocumentOperation(envelope, { plugin, vaultRoot, extension }) {
  const result = spawnSync(process.execPath, [worker, '--native-document-worker'], {
    input: JSON.stringify({ envelope, plugin, vaultRoot: path.resolve(vaultRoot), extension }),
    encoding: 'utf8', timeout: 30000, maxBuffer: 16 * 1024 * 1024,
    env: { PATH: process.env.PATH || '', NODE_NO_WARNINGS: '1' },
  });
  if (result.error || result.status !== 0) throw new Error(result.stderr?.trim() || result.error?.message || 'Native SSSS document worker failed');
  return JSON.parse(result.stdout);
}

if (process.argv[1] === worker && process.argv[2] === '--native-document-worker') {
  let input = '';
  for await (const chunk of process.stdin) { input += chunk; if (input.length > 16 * 1024 * 1024) throw new Error('Plugin document input exceeds limit'); }
  try { process.stdout.write(JSON.stringify(await executePluginDocument(JSON.parse(input)))); }
  catch (error) { process.stderr.write(error.message); process.exitCode = 1; }
}
