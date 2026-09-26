/**
 * Capability Deployment — Deployment Planner
 *
 * Implements Phase 2 of CAPABILITY_DEPLOYMENT_PLUGINS:
 * - Deterministic, read-only plan computation
 * - File diffing (create, modify, identical, conflict)
 * - SSSS dry-run event envelopes
 * - Access grant and resource declaration aggregation
 * - Deterministic SHA-256 plan hash
 * - Formatted JSON output for CLI (`app plan --json`)
 */

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { resolveCapabilitySource } from './source.mjs';
import { resolveCapabilityGraph } from './resolve.mjs';

export const PROTECTED_APP_FILES = new Set([
  'package.json',
  'package-lock.json',
  'pnpm-lock.yaml',
  'yarn.lock',
  'tsconfig.json',
  'README.md',
  '.gitignore',
  '.env',
  '.env.local',
  '.env.production'
]);

/**
 * Computes deterministic SHA-256 hash of any JSON-serializable object.
 */
export function computeDeterministicHash(obj) {
  const canonical = JSON.stringify(obj, Object.keys(obj).sort());
  return crypto.createHash('sha256').update(canonical).digest('hex');
}

/**
 * Generates SSSS dry-run lifecycle event envelopes for capability installation.
 */
export function generateSsssEnvelopes(orderedPlugins, targetApp) {
  const envelopes = [];
  const timestamp = new Date().toISOString();

  for (const plugin of orderedPlugins) {
    // 1. Install start envelope
    envelopes.push({
      type: 'event',
      domain: 'ssss.capability',
      action: 'install_started',
      timestamp,
      actor: 'total-recall/app-deploy',
      target: targetApp.dir,
      payload: {
        capability_id: plugin.id,
        version: plugin.version,
        source_sha256: plugin.sha256
      }
    });

    // 2. Schema registration envelopes if categories are present
    const categories = plugin.manifest.ssss_schemas?.categories || [];
    if (categories.length > 0) {
      envelopes.push({
        type: 'event',
        domain: 'ssss.schema',
        action: 'categories_registered',
        timestamp,
        actor: 'total-recall/app-deploy',
        target: targetApp.dir,
        payload: {
          capability_id: plugin.id,
          categories: categories.map((c) => ({
            name: c.name,
            description: c.description || '',
            node_type: c.node_type || 'memory'
          }))
        }
      });
    }

    // 3. Capability installed envelope
    envelopes.push({
      type: 'event',
      domain: 'ssss.capability',
      action: 'installed',
      timestamp,
      actor: 'total-recall/app-deploy',
      target: targetApp.dir,
      payload: {
        capability_id: plugin.id,
        version: plugin.version,
        status: 'ready'
      }
    });
  }

  return envelopes;
}

/**
 * Diffs files provided by capability plugins against the target application tree.
 */
export function computeFileDiffs(orderedPlugins, targetAppDir) {
  const fileOperations = [];

  for (const plugin of orderedPlugins) {
    for (const file of plugin.files || []) {
      if (file.path === 'plugin.json') continue; // Manifest stays with capability record

      const targetPath = path.join(targetAppDir, file.path);
      let action = 'create';
      let existingHash = null;

      if (fs.existsSync(targetPath)) {
        try {
          const targetBytes = fs.readFileSync(targetPath);
          existingHash = crypto.createHash('sha256').update(targetBytes).digest('hex');

          if (existingHash === file.sha256) {
            action = 'identical';
          } else if (PROTECTED_APP_FILES.has(file.path) || PROTECTED_APP_FILES.has(path.basename(file.path))) {
            action = 'conflict';
          } else {
            action = 'modify';
          }
        } catch {
          action = 'modify';
        }
      }

      fileOperations.push({
        action,
        path: file.path,
        plugin_id: plugin.id,
        size: file.size,
        source_sha256: file.sha256,
        target_sha256: existingHash
      });
    }
  }

  fileOperations.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
  return fileOperations;
}

/**
 * Generates a full, deterministic capability deployment plan.
 *
 * @param {string|object} source - Capability source (URI, path, or bundle)
 * @param {object} [options]
 * @param {string} [options.target] - Target app directory path
 * @param {string} [options.adapter] - Target adapter (ssss-app, nextjs, react, flask)
 * @param {string} [options.expectedHash] - Pinned hash for source
 * @param {Function} [options.pluginResolver] - Resolver for transitive dependencies
 * @returns {Promise<{
 *   plan_version: string,
 *   plan_hash: string,
 *   valid: boolean,
 *   target_app: object,
 *   adapter: string,
 *   capabilities: Array<object>,
 *   file_operations: Array<object>,
 *   ssss_envelopes: Array<object>,
 *   access_grants: Array<string>,
 *   resources: object,
 *   conflicts: Array<object>,
 *   cleanup: () => void
 * }>}
 */
export async function createDeploymentPlan(source, options = {}) {
  const targetDir = path.resolve(options.target || process.cwd());
  const adapter = options.adapter || 'ssss-app';

  // 1. Resolve and verify root source
  const rootSource = await resolveCapabilitySource(source, {
    expectedHash: options.expectedHash,
    projectRoot: targetDir
  });

  try {
    // 2. Resolve dependency graph and check compatibility
    const resolvedGraph = await resolveCapabilityGraph(rootSource, {
      adapter,
      targetApp: {
        dir: targetDir,
        framework: adapter,
        ssssVersion: '0.9.6'
      },
      pluginResolver: options.pluginResolver
    });

    // 3. Compute file diffs against target directory
    const fileOperations = computeFileDiffs(resolvedGraph.orderedPlugins, targetDir);

    // 4. Generate SSSS dry-run envelopes
    const ssssEnvelopes = generateSsssEnvelopes(resolvedGraph.orderedPlugins, resolvedGraph.targetApp);

    // 5. Detect any file conflicts
    const conflicts = fileOperations.filter((op) => op.action === 'conflict');

    const capabilitiesSummary = resolvedGraph.orderedPlugins.map((p) => ({
      id: p.id,
      version: p.version,
      source_sha256: p.sha256,
      skills: (p.manifest.skills || []).map((s) => s.id),
      commands: (p.manifest.commands || []).map((c) => c.name),
      ui: p.manifest.ui ? Object.keys(p.manifest.ui) : []
    }));

    const planBody = {
      plan_version: '1.0.0',
      valid: conflicts.length === 0,
      target_app: {
        dir: targetDir,
        framework: adapter,
        ssss_version: resolvedGraph.targetApp.ssssVersion
      },
      adapter,
      capabilities: capabilitiesSummary,
      file_operations: fileOperations,
      ssss_envelopes: ssssEnvelopes,
      access_grants: resolvedGraph.totalGrants,
      resources: resolvedGraph.totalResources,
      conflicts
    };

    const planHash = computeDeterministicHash(planBody);

    const stagedSources = {};
    for (const p of resolvedGraph.orderedPlugins) {
      if (p.stagedDir) {
        stagedSources[p.id] = p.stagedDir;
      }
    }

    return {
      ...planBody,
      plan_hash: planHash,
      _stagedSources: stagedSources,
      cleanup: rootSource.cleanup
    };
  } catch (err) {
    rootSource.cleanup();
    throw err;
  }
}
