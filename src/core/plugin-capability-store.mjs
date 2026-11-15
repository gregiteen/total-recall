/** One validated core asset: installed declarations, never owner runtime source. */
import fs from 'node:fs';
import path from 'node:path';
import matter from './frontmatter.mjs';
import { processOperationAsync } from './operation-validator.mjs';
import { findVfsDocumentByPath } from './vfs-documents.mjs';

export const CAPABILITY_PATH = 'system/plugin-capabilities/installed-capabilities.md';

export async function syncPluginCapabilities(catalog, vaultRoot, { execute = processOperationAsync } = {}) {
  // Preflight all destination ancestors before reading or invoking any write.
  let current = path.resolve(vaultRoot);
  const destinations = [current, ...CAPABILITY_PATH.split('/').map(part => (current = path.join(current, part)))];
  for (const destination of destinations) {
    try { if (fs.lstatSync(destination).isSymbolicLink()) throw new Error('Capability storage cannot follow symlinks'); }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
  }
  const previous = findVfsDocumentByPath(CAPABILITY_PATH, vaultRoot);
  if (!previous && fs.existsSync(path.join(vaultRoot, CAPABILITY_PATH))) throw new Error('Capability asset path collision');
  if (previous && (previous.type !== 'asset' || previous.frontmatter?.x_owner !== 'plugin-capabilities')) throw new Error('Capability asset path collision');
  const body = JSON.stringify({ schemaVersion: 1, fingerprint: catalog.fingerprint, plugins: catalog.plugins, capabilities: catalog.capabilities }, null, 2);
  if (previous?.body?.trim() === body) return { changed: false, count: catalog.capabilities.length };
  const content = matter.stringify(`${body}\n`, { ...(previous?.frontmatter || {}), type: 'asset', name: 'Installed plugin capabilities', title: 'Installed plugin capabilities',
    description: 'Passive installed capability declarations; activation is host policy and readiness is not probed.', timestamp: new Date().toISOString(),
    mime_type: 'application/json', encoding: 'utf-8', x_owner: 'plugin-capabilities', hash: `sha256:${catalog.fingerprint}` });
  const envelope = { type: 'operation', idempotency_key: `capabilities-${catalog.fingerprint}`, path: CAPABILITY_PATH, workspace_id: 'default', actor: { role: 'system' }, content };
  // Stable timestamp/content on repeated plans, including when returning to an earlier catalog.
  envelope.idempotency_key += `-${Date.now()}`;
  for (const dry_run of [true, false]) {
    const result = await execute({ ...envelope, dry_run }, vaultRoot, { agentRole: 'system' });
    if (!result?.success) throw new Error('Capability synchronization failed validation or commit');
  }
  return { changed: true, count: catalog.capabilities.length };
}
