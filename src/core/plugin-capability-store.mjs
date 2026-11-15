/** One validated core asset: installed declarations, never owner runtime source. */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import matter from './frontmatter.mjs';
import { processOperationAsync } from './operation-validator.mjs';
import { findVfsDocumentByPath } from './vfs-documents.mjs';
import { noLinks } from './plugin-import-source.mjs';

const sha256 = text => crypto.createHash('sha256').update(text).digest('hex');
const bytesHash = bytes => `sha256:${crypto.createHash('sha256').update(bytes).digest('hex')}`;

export const CAPABILITY_PATH = 'system/plugin-capabilities/installed-capabilities.md';

export async function syncPluginCapabilities(catalog, vaultRoot, { execute = processOperationAsync } = {}) {
  // Preflight all destination ancestors before reading or invoking any write.
  let current = noLinks(vaultRoot);
  const destinations = [current, ...CAPABILITY_PATH.split('/').map(part => (current = path.join(current, part)))];
  for (const destination of destinations) {
    try { if (fs.lstatSync(destination).isSymbolicLink()) throw new Error('Capability storage cannot follow symlinks'); }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
  }
  const previous = findVfsDocumentByPath(CAPABILITY_PATH, vaultRoot);
  const onDisk = path.join(vaultRoot, CAPABILITY_PATH);
  if (!previous && fs.existsSync(onDisk)) throw new Error('Capability asset path collision');
  if (previous && (previous.type !== 'asset' || previous.frontmatter?.x_owner !== 'plugin-capabilities')) throw new Error('Capability asset path collision');
  const body = JSON.stringify({ schemaVersion: 1, fingerprint: catalog.fingerprint, plugins: catalog.plugins, capabilities: catalog.capabilities }, null, 2);
  const bodyHash = sha256(body);
  // Asset hash covers the persisted JSON body; the catalog fingerprint is separate provenance.
  if (previous && sha256(previous.body.trim()) === bodyHash) return { changed: false, count: catalog.capabilities.length };
  const beforeHash = previous ? bytesHash(fs.readFileSync(onDisk)) : null;
  // Stable per (before, after) so retries replay and concurrent writers conflict instead of overwriting.
  const { timestamp: _timestamp, updated: _updated, hash: _hash, ...kept } = previous?.frontmatter || {};
  const content = matter.stringify(`${body}\n`, { ...kept, type: 'asset', name: 'Installed plugin capabilities', title: 'Installed plugin capabilities',
    description: 'Passive installed capability declarations; activation is host policy and readiness is not probed.',
    mime_type: 'application/json', encoding: 'utf-8', x_owner: 'plugin-capabilities', x_catalog_fingerprint: catalog.fingerprint ?? null, hash: `sha256:${bodyHash}` });
  const envelope = { type: 'operation', idempotency_key: `capabilities-${(beforeHash || 'none').slice(-16)}-${bodyHash.slice(0, 32)}`, path: CAPABILITY_PATH, workspace_id: 'default',
    actor: { role: 'system' }, expected_before_hash: beforeHash, content };
  for (const dry_run of [true, false]) {
    const result = await execute({ ...envelope, dry_run }, vaultRoot, { agentRole: 'system' });
    if (!result?.success) throw new Error(`Capability synchronization failed validation or commit${result?.validation?.errors?.length ? `: ${result.validation.errors.join('; ')}` : ''}`);
  }
  return { changed: true, count: catalog.capabilities.length };
}
