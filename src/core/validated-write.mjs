/**
 * Validated write adapter — all vault node mutations go through the SSSS 0.9
 * package kernel (processOperationAsync).
 *
 * Usage:
 *   const result = await writeNodeValidatedAsync(node, vaultDir);
 *   if (!result.success) throw new Error(result.validation.errors.join('; '));
 */

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import matter from 'gray-matter';
import { processOperationAsync } from './operation-validator.mjs';
import { safeStringify, isSafeVaultName } from './vault.mjs';
import { invalidate } from './vault-cache.mjs';

/**
 * Normalize a vault node so package universal frontmatter + TR memory v2 pass.
 */
export function prepareNodeForContract(node = {}) {
  const prepared = { ...node };
  if (!prepared.type) prepared.type = 'memory';

  // Identity fallbacks
  if (!prepared.slug) {
    prepared.slug = prepared.proposal_id || prepared.migration_id || prepared.release_id || 'unnamed';
  }
  // Proposal "category" is a topic label in TR; vault folder is always proposals/.
  if (prepared.type === 'proposal') {
    if (prepared.category && prepared.category !== 'proposals') {
      prepared.proposal_topic = prepared.proposal_topic || prepared.category;
    }
    prepared.category = 'proposals';
  } else if (!prepared.category) {
    if (prepared.type === 'migration') prepared.category = 'migrations';
    else if (prepared.type === 'schema-proposal') prepared.category = 'schema-proposals';
    else prepared.category = 'uncategorized';
  }

  // Package 0.9 universal fields
  if (!prepared.title) {
    prepared.title = prepared.name || prepared.summary || prepared.slug || 'Untitled';
  }
  if (!prepared.description) {
    prepared.description = prepared.rationale || prepared.summary || prepared.title;
  }
  if (!prepared.timestamp) {
    prepared.timestamp = prepared.updated || prepared.created || prepared.proposed_at
      || prepared.applied_at || new Date().toISOString();
  }

  if (prepared.type === 'memory') {
    if (!prepared.schema_version) prepared.schema_version = 2;
    if (!prepared.status) prepared.status = 'active';
    if (!prepared.updated) prepared.updated = new Date().toISOString();
    if (!prepared.last_accessed) prepared.last_accessed = new Date().toISOString();
    if (!prepared.created) prepared.created = prepared.updated;
    // Package core enum for memory.category is closed; remap host-only folders.
    const MEMORY_CATEGORIES = new Set([
      'invariants', 'patterns', 'anti-patterns', 'preferences',
      'decisions', 'concepts', 'facts', 'lore',
    ]);
    if (prepared.category && !MEMORY_CATEGORIES.has(prepared.category)) {
      const original = prepared.category;
      prepared.tags = Array.isArray(prepared.tags) ? [...prepared.tags] : [];
      if (!prepared.tags.includes(`folder:${original}`)) prepared.tags.push(`folder:${original}`);
      prepared.category = original === 'instructions' ? 'preferences' : 'facts';
    }
    // Fill schema v2 required fields so partial updates (graph linking) still validate.
    if (prepared.schema_version === 2) {
      if (prepared.confidence === undefined || prepared.confidence === null) prepared.confidence = 0.5;
      if (prepared.importance === undefined || prepared.importance === null) prepared.importance = 3;
      if (!prepared.modality) prepared.modality = 'descriptive';
      if (!prepared.subject) prepared.subject = 'agent';
      if (!prepared.predicate) prepared.predicate = 'know';
      if (!prepared.object) prepared.object = prepared.slug || 'fact';
      if (!prepared.sentiment_polarity) prepared.sentiment_polarity = 'descriptive';
      if (!prepared.sentiment_target) prepared.sentiment_target = prepared.slug || 'memory';
    }
    const now = new Date().toISOString();
    if (!prepared.x_temporal_context) {
      prepared.x_temporal_context = prepared.updated || prepared.created || now;
    }
    if (!prepared.x_citations) {
      prepared.x_citations = [{
        source: prepared.source?.type || 'unknown',
        title: prepared.title || 'Untitled Memory',
        url: prepared.source?.session_id ? `session://${prepared.source.session_id}` : 'unknown',
        published: prepared.x_temporal_context,
        relevance: 1.0,
        accessed: now,
      }];
    }
  }

  return prepared;
}

function buildEnvelope(node, options = {}) {
  const {
    workspaceId = 'default',
    idempotencyKey,
    dryRun = false,
    path: pathOverride,
  } = options;

  const prepared = prepareNodeForContract(node);
  const { body, _filePath, _layer, _filepath, ...frontmatter } = prepared;

  if (!isSafeVaultName(frontmatter.slug)) {
    throw new Error(`Invalid slug: ${frontmatter.slug}`);
  }
  if (!isSafeVaultName(frontmatter.category)) {
    throw new Error(`Invalid category: ${frontmatter.category}`);
  }

  const content = safeStringify(body || '', frontmatter);
  const vfsPath = pathOverride || `${frontmatter.category}/${frontmatter.slug}.md`;

  return {
    type: 'operation',
    idempotency_key: idempotencyKey || crypto.randomUUID(),
    path: vfsPath,
    workspace_id: workspaceId,
    content,
    dry_run: !!dryRun,
    actor: { role: options.agentRole || 'system' },
  };
}

/**
 * @deprecated Use {@link writeNodeValidatedAsync}.
 */
export function writeNodeValidated(node, vaultDir, options = {}) {
  return writeNodeValidatedAsync(node, vaultDir, options);
}

/**
 * Write a node through the SSSS 0.9 package kernel.
 */
export async function writeNodeValidatedAsync(node, vaultDir, options = {}) {
  const {
    agentRole = 'system',
    leaseStore,
    eventLogDir,
    dryRun = false,
  } = options;

  const envelope = buildEnvelope(node, { ...options, agentRole });
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
 * Validate a node without committing.
 */
export function validateNode(node, vaultDir) {
  return writeNodeValidatedAsync(node, vaultDir, { dryRun: true });
}

/**
 * Resolve the vault root that owns a node file.
 *
 * Walks up looking for a `memory-vault` directory. Falls back to the
 * grandparent (i.e. the parent of the category folder) so scoped roots and
 * test fixtures that do not use the canonical name still work.
 */
export function resolveVaultDir(filePath) {
  if (!filePath) return null;
  let cur = path.dirname(path.resolve(filePath));
  while (cur && cur !== path.dirname(cur)) {
    if (path.basename(cur) === 'memory-vault') return cur;
    cur = path.dirname(cur);
  }
  return path.dirname(path.dirname(path.resolve(filePath)));
}

/**
 * Read a node off disk, mutate its frontmatter, and write it back through the
 * Core Contract.
 *
 * Stampers (confidence decay, cutoff-risk flags, supersede markers, priority
 * escalation) used to read → mutate → atomicWrite, which skipped validation
 * entirely: a stamper could lower `confidence` below its floor or drop a
 * required field and nothing would notice until a much later read failed.
 *
 * The on-disk location is preserved via an explicit path override. Without it
 * the envelope would recompute `<category>/<slug>.md`, and any node whose
 * folder is outside the closed memory-category enum (daily/, corrections/,
 * queries/, system/) would be rewritten to a new location while the original
 * was left behind as an orphan.
 *
 * @param {string} filePath  Absolute path to an existing node file
 * @param {(data: object, body: string) => (object|void)} mutate
 *        Mutates frontmatter in place, or returns `{ data, body }` to replace.
 * @param {object} [options] Passed through to writeNodeValidatedAsync
 * @returns {Promise<object>} Operation response, or `{ success: false }`
 */
export async function updateNodeInPlace(filePath, mutate, options = {}) {
  if (!filePath || !fs.existsSync(filePath)) {
    return { success: false, error: `Node file not found: ${filePath}` };
  }

  const raw = fs.readFileSync(filePath, 'utf8');
  const parsed = matter(raw);
  const data = { ...parsed.data };
  let body = parsed.content;

  const replacement = mutate(data, body);
  const nextData = replacement?.data || data;
  if (replacement && typeof replacement.body === 'string') body = replacement.body;

  const vaultDir = options.vaultDir || resolveVaultDir(filePath);
  const relativePath = path.relative(vaultDir, path.resolve(filePath))
    .split(path.sep).join('/');

  return writeNodeValidatedAsync({ ...nextData, body }, vaultDir, {
    ...options,
    path: relativePath,
  });
}
