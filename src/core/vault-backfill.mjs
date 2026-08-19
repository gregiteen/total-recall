/**
 * Vault backfill — bring historical nodes up to the current SSSS contract.
 *
 * Most nodes in a long-lived vault predate the schema they are now validated
 * against: SSSS 0.9 §4.2 made `description` and `timestamp` universally
 * required, and for a long stretch nothing enforced it — several subsystems
 * wrote nodes with raw filesystem writes that never reached the Core Contract.
 *
 * This walks every node, asks the contract what it would take to make it valid,
 * and reports that. Applying is opt-in and takes a snapshot of the vault being
 * changed first, because this rewrites the user's own memory at scale.
 *
 * Deliberately walks the filesystem rather than using getNodes(): getNodes()
 * returns only `type: memory` documents, so proposals, migrations and every
 * other vault primitive would be silently skipped by exactly the pass meant to
 * repair them.
 */

import fs from 'node:fs';
import path from 'node:path';
import matter from 'gray-matter';
import { prepareNodeForContract, validateNode, updateNodeInPlace } from './validated-write.mjs';
import { createSnapshot } from './snapshot.mjs';
import { logger } from './logger.mjs';

// index.md / log.md are OKF bundle artifacts written alongside the nodes, not
// nodes themselves — okf-adapter excludes them from its own walks too.
const NON_NODE_FILES = new Set(['index.md', 'log.md']);

// memory-vault/queries/ holds Obsidian Dataview dashboards (`type: query`,
// no slug, no category, a ```dataview block for a body). They are saved views
// over the vault, not entries in it — `query` is not an SSSS primitive and
// never will be. Repairing them would mean inventing a slug and category for a
// file that should not have either.
const NON_NODE_DIRS = new Set(['queries']);

export function walkVaultNodes(dir, acc = []) {
  if (!fs.existsSync(dir)) return acc;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (!entry.name.startsWith('.') && !NON_NODE_DIRS.has(entry.name)) walkVaultNodes(full, acc);
    } else if (entry.name.endsWith('.md') && !NON_NODE_FILES.has(entry.name)) {
      acc.push(full);
    }
  }
  return acc;
}


/**
 * Repair known-bad *shapes* left by writers that bypassed the contract.
 *
 * prepareNodeForContract only fills fields that are missing; it never rewrites
 * a value that is present, which is the right default — but it means a field
 * stored with the wrong type stays wrong forever. These are the specific
 * corruptions found in the vault, each repaired so no information is lost:
 * the old value is carried into the correct structure rather than replaced by
 * a default.
 *
 * Anything not listed here is left alone. A node this cannot express is
 * reported, never guessed at.
 */
export function normalizeLegacyShapes(data) {
  const out = { ...data };
  const repairs = [];

  // repo-sync wrote `source` as "repo-sync:<repo>:<path>" (or a bare label) and
  // `decay` as the number 0. Both are objects in MemoryNodeSchema.
  if (typeof out.source === 'string') {
    const raw = out.source;
    const match = /^repo-sync:(.+?):(.+)$/.exec(raw);
    out.source = match
      ? { type: 'repo-sync', session_id: `${match[1]}:${match[2]}`, agent: 'repo-sync', evidence_count: 1 }
      : { type: raw, session_id: raw, evidence_count: 1 };
    repairs.push('source');
  }

  if (typeof out.decay === 'number') {
    // The number was an access count in the old shape, never a half-life.
    out.decay = { half_life_days: 365, access_count: out.decay };
    repairs.push('decay');
  }

  // YAML parses an unquoted ISO timestamp into a Date. Most write paths
  // stringify first; the ones that did not left Date objects on disk.
  for (const key of ['timestamp', 'created', 'updated', 'last_accessed', 'x_temporal_context']) {
    if (out[key] instanceof Date) {
      out[key] = out[key].toISOString();
      repairs.push(key);
    }
  }

  if (Array.isArray(out.x_citations)) {
    out.x_citations = out.x_citations.map((citation) => {
      if (!citation || typeof citation !== 'object') return citation;
      if (citation.published instanceof Date) {
        repairs.push('x_citations.published');
        return { ...citation, published: citation.published.toISOString() };
      }
      return citation;
    });
  }

  return { data: out, repairs };
}

/**
 * Field-level diff between a node as stored and as the contract would have it.
 * Reports only additions and changes; nothing is ever dropped.
 */
export function diffNode(original) {
  const prepared = prepareNodeForContract(normalizeLegacyShapes(original).data);
  const added = {};
  const changed = {};
  for (const [key, value] of Object.entries(prepared)) {
    if (key === 'body') continue;
    if (!(key in original) || original[key] === undefined || original[key] === null) {
      added[key] = value;
    } else if (JSON.stringify(original[key]) !== JSON.stringify(value)) {
      changed[key] = { from: original[key], to: value };
    }
  }
  return { added, changed };
}


async function validate(data, body, vaultDir) {
  try {
    const result = await validateNode({ ...data, body }, vaultDir);
    if (result.success) return { success: true, errors: [] };
    return { success: false, errors: result.validation?.errors || [result.error || 'unknown'] };
  } catch (err) {
    // A slug or category outside the safe-name allowlist throws before the
    // envelope is even built; that is a finding, not a crash.
    return { success: false, errors: [err.message] };
  }
}

/**
 * Inspect a vault without writing anything.
 *
 * @returns {Promise<{vaultDir: string, total: number, valid: number,
 *   invalid: number, unreadable: string[], fieldCounts: object,
 *   errorCounts: object, nodes: object[]}>}
 */
export async function analyzeVault(vaultDir) {
  const files = walkVaultNodes(vaultDir);
  const report = {
    vaultDir,
    total: files.length,
    valid: 0,
    invalid: 0,
    repairable: 0,
    unfixable: [],
    unreadable: [],
    fieldCounts: {},
    shapeRepairs: {},
    errorCounts: {},
    nodes: [],
  };

  for (const file of files) {
    let parsed;
    try {
      parsed = matter(fs.readFileSync(file, 'utf8'));
    } catch (err) {
      report.unreadable.push(`${file}: ${err.message}`);
      continue;
    }

    const original = parsed.data || {};

    // Validate the node exactly as it sits on disk. Validating the repaired
    // form here would report a clean vault while the files are still broken —
    // and leave nothing for --apply to do.
    const asStored = await validate(original, parsed.content, vaultDir);
    if (asStored.success) {
      report.valid += 1;
      continue;
    }

    report.invalid += 1;
    for (const err of asStored.errors) {
      const key = String(err).split('\n')[0].slice(0, 120);
      report.errorCounts[key] = (report.errorCounts[key] || 0) + 1;
    }

    // Would this run actually fix it? A node that still fails after repair is
    // reported separately rather than counted as work in progress.
    const { data: normalized, repairs } = normalizeLegacyShapes(original);
    const afterRepair = await validate(normalized, parsed.content, vaultDir);
    if (afterRepair.success) report.repairable += 1;
    else {
      report.unfixable.push({ file, errors: afterRepair.errors });
      continue;
    }

    const { added, changed } = diffNode(original);
    for (const key of Object.keys(added)) {
      report.fieldCounts[key] = (report.fieldCounts[key] || 0) + 1;
    }
    for (const key of repairs) {
      report.shapeRepairs[key] = (report.shapeRepairs[key] || 0) + 1;
    }
    report.nodes.push({ file, added, changed, repairs });
  }

  return report;
}

/**
 * Repair a vault in place through the Core Contract.
 *
 * Takes a snapshot of *this* vault before the first write. Nodes that still
 * fail after preparation are left exactly as they are and reported — a node the
 * contract cannot express is a node a blind rewrite would corrupt.
 */
export async function backfillVault(vaultDir, options = {}) {
  const { snapshot = true, limit = Infinity, onProgress } = options;
  const analysis = await analyzeVault(vaultDir);

  if (analysis.invalid === 0) {
    return { ...analysis, snapshotId: null, repaired: 0, failed: [] };
  }

  let snapshotId = null;
  if (snapshot) {
    const snap = createSnapshot('pre-backfill', vaultDir);
    if (!snap.success) {
      throw new Error(`Refusing to backfill without a snapshot: ${snap.error}`);
    }
    snapshotId = snap.snapshot_id;
    logger.info('vault-backfill', `Safety snapshot ${snapshotId} for ${vaultDir}`);
  }

  let repaired = 0;
  const failed = [];
  const targets = analysis.nodes.slice(0, limit);

  for (const [index, target] of targets.entries()) {
    try {
      // prepareNodeForContract inside the write path supplies missing fields;
      // the normalizer repairs fields stored with the wrong type. Neither
      // invents content — both preserve what the old value carried.
      const result = await updateNodeInPlace(target.file, (data) => {
        const { data: normalized } = normalizeLegacyShapes(data);
        for (const key of Object.keys(normalized)) data[key] = normalized[key];
      }, { vaultDir });
      if (result.success) repaired += 1;
      else failed.push({ file: target.file, errors: result.validation?.errors || [result.error] });
    } catch (err) {
      failed.push({ file: target.file, errors: [err.message] });
    }
    if (onProgress && index % 100 === 0) onProgress(index + 1, targets.length);
  }

  return { ...analysis, snapshotId, repaired, failed };
}
