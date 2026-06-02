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
import { processOperation } from './operation-validator.mjs';
import { safeStringify } from './vault.mjs';
import { invalidate } from './vault-cache.mjs';

/**
 * Write a memory node through the full §6 Operation Contract pipeline.
 *
 * @param {object} node - The memory node object (slug, category, title, body, etc.)
 * @param {string} vaultDir - Absolute path to the vault directory
 * @param {object} [options]
 * @param {string} [options.agentRole='admin'] - Agent authorization role
 * @param {string} [options.workspaceId='default'] - Workspace scope
 * @param {string} [options.idempotencyKey] - Idempotency key (auto-generated if omitted)
 * @param {string} [options.leaseStore] - Path to lease store directory
 * @param {string} [options.eventLogDir] - Path to event log directory
 * @param {boolean} [options.dryRun=false] - Validate without committing
 * @returns {object} Operation response (§6.4)
 */
export function writeNodeValidated(node, vaultDir, options = {}) {
  const {
    agentRole = 'admin',
    workspaceId = 'default',
    idempotencyKey,
    leaseStore,
    eventLogDir,
    dryRun = false,
  } = options;

  // Build the Markdown content from the node object
  const { body, _filePath, ...frontmatter } = node;
  if (!frontmatter.type) frontmatter.type = 'memory';
  if (!frontmatter.schema_version) frontmatter.schema_version = 2;
  if (!frontmatter.updated) frontmatter.updated = new Date().toISOString();
  if (!frontmatter.last_accessed) frontmatter.last_accessed = new Date().toISOString();

  const content = safeStringify(body || '', frontmatter);

  // Build the §6.1 envelope
  const category = frontmatter.category || 'uncategorized';
  const slug = frontmatter.slug || 'unnamed';
  const vfsPath = `${category}/${slug}.md`;

  const envelope = {
    type: 'operation',
    idempotency_key: idempotencyKey || crypto.randomUUID(),
    path: vfsPath,
    workspace_id: workspaceId,
    content,
    dry_run: dryRun,
  };

  // Run the full §6.3 pipeline
  const result = processOperation(envelope, vaultDir, {
    agentRole,
    leaseStore,
    eventLogDir,
  });

  // Invalidate vault cache on successful commit
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
 * @returns {object} Validation result with errors/warnings
 */
export function validateNode(node, vaultDir) {
  return writeNodeValidated(node, vaultDir, { dryRun: true });
}
