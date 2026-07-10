/**
 * src/core/validated-write.mjs
 *
 * Validated write adapter — routes memory mutations through the SSSS §6
 * Operation Contract (processOperation) instead of bypassing it via raw
 * writeNode(). This ensures every write gets:
 *   - Envelope validation (Stage 1)
 *   - Idempotency deduplication (Stage 2)
 *   - Authorization checks (Stage 3)
 *   - Lease protection (Stage 4)
 *   - Schema validation (Stage 5)
 *   - Atomic commit (Stage 6)
 *   - Audit trail (Stage 7)
 *
 * Usage:
 *   import { writeNodeValidated } from './validated-write.mjs';
 *   const result = writeNodeValidated(node, vaultDir);
 *   if (!result.success) throw new Error(result.validation.errors.join('; '));
 */

import crypto from 'node:crypto';
import path from 'node:path';
import matter from 'gray-matter';
import { processOperation, processOperationAsync } from './operation-validator.mjs';
import { safeStringify } from './vault.mjs';
import { invalidate } from './vault-cache.mjs';
import { getKernelMode } from './ssss-kernel-bridge.mjs';

function buildEnvelope(node, options = {}) {
  const {
    workspaceId = 'default',
    idempotencyKey,
    dryRun = false,
  } = options;

  const { body, _filePath, ...frontmatter } = node;
  if (!frontmatter.type) frontmatter.type = 'memory';
  if (!frontmatter.schema_version) frontmatter.schema_version = 2;
  if (!frontmatter.updated) frontmatter.updated = new Date().toISOString();
  if (!frontmatter.last_accessed) frontmatter.last_accessed = new Date().toISOString();

  const content = safeStringify(body || '', frontmatter);
  const category = frontmatter.category || 'uncategorized';
  const slug = frontmatter.slug || 'unnamed';
  const vfsPath = `${category}/${slug}.md`;

  return {
    type: 'operation',
    idempotency_key: idempotencyKey || crypto.randomUUID(),
    path: vfsPath,
    workspace_id: workspaceId,
    content,
    dry_run: dryRun,
  };
}

/**
 * Write a memory node through the full §6 Operation Contract pipeline.
 * Sync legacy path — use {@link writeNodeValidatedAsync} under kernel modes.
 *
 * @param {object} node - The memory node object (slug, category, title, body, etc.)
 * @param {string} vaultDir - Absolute path to the vault directory
 * @param {object} [options]
 * @returns {object} Operation response (§6.4)
 */
export function writeNodeValidated(node, vaultDir, options = {}) {
  const {
    agentRole = 'admin',
    leaseStore,
    eventLogDir,
    dryRun = false,
  } = options;

  const envelope = buildEnvelope(node, options);
  const result = processOperation(envelope, vaultDir, {
    agentRole,
    leaseStore,
    eventLogDir,
  });

  if (result.success && !dryRun) {
    invalidate(vaultDir);
  }

  return result;
}

/**
 * Async write path that can use the SSSS 0.9 package kernel when enabled.
 */
export async function writeNodeValidatedAsync(node, vaultDir, options = {}) {
  const {
    agentRole = 'admin',
    leaseStore,
    eventLogDir,
    dryRun = false,
  } = options;

  const envelope = buildEnvelope(node, options);
  const result = await processOperationAsync(envelope, vaultDir, {
    agentRole,
    leaseStore,
    eventLogDir,
  });

  if (result.success && !dryRun) {
    invalidate(vaultDir);
  }

  return result;
}

/**
 * Validate a node against the §6 pipeline without committing.
 * Useful for pre-flight checks on user input.
 *
 * @param {object} node - The memory node object
 * @param {string} vaultDir - Absolute path to the vault directory
 * @returns {object|Promise<object>} Validation result with errors/warnings
 */
export function validateNode(node, vaultDir) {
  const mode = getKernelMode();
  if (mode === 'kernel' || mode === 'kernel-core' || mode === 'kernel-low-risk') {
    return writeNodeValidatedAsync(node, vaultDir, { dryRun: true });
  }
  return writeNodeValidated(node, vaultDir, { dryRun: true });
}
