import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import matter from 'gray-matter';
import { JsonlEventStore } from '@ssss/cli/events';
import { processOperationAsync } from './operation-validator.mjs';
import { invalidate } from './vault-cache.mjs';
import { defaultVaultRoot } from './vfs-documents.mjs';

function envelopeBase(vfsPath, { workspaceId = 'default', actorRole = 'system', intent } = {}) {
  return {
    idempotency_key: crypto.randomUUID(),
    path: vfsPath,
    workspace_id: workspaceId,
    actor: { role: actorRole },
    ...(intent ? { intent } : {}),
  };
}

async function execute(envelope, options = {}) {
  const vaultRoot = options.vaultRoot || defaultVaultRoot();
  const result = await processOperationAsync(envelope, vaultRoot, {
    agentRole: options.actorRole || envelope.actor?.role || 'system',
  });
  if (!result?.success) {
    const errors = result?.validation?.errors || [result?.error || 'Unknown SSSS operation failure'];
    const error = new Error(errors.join('; '));
    error.result = result;
    throw error;
  }
  invalidate(vaultRoot);
  return result;
}

export function writeVfsDocument(vfsPath, frontmatter, body = '', options = {}) {
  const content = matter.stringify(body ? `${body.trim()}\n` : '', frontmatter);
  return execute({
    type: 'operation',
    ...envelopeBase(vfsPath, options),
    content,
  }, options);
}

export function patchVfsDocument(vfsPath, patches, options = {}) {
  return execute({
    type: 'patch',
    ...envelopeBase(vfsPath, options),
    patches,
  }, options);
}

export function deleteVfsDocument(vfsPath, options = {}) {
  return execute({
    type: 'delete',
    ...envelopeBase(vfsPath, options),
  }, options);
}

export function appendVfsEvent(subject, payload, options = {}) {
  return execute({
    type: 'event',
    ...envelopeBase(subject, options),
    content: JSON.stringify(payload),
  }, options);
}

export async function listVfsEvents(options = {}) {
  const vaultRoot = options.vaultRoot || defaultVaultRoot();
  const eventsRoot = path.join(vaultRoot, '.events');
  if (!fs.existsSync(eventsRoot)) return [];
  const store = new JsonlEventStore(eventsRoot);
  const events = [];
  for await (const item of store.replay({
    workspaceId: options.workspaceId || 'default',
  })) {
    events.push(item.event);
  }
  return events;
}
