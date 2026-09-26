/**
 * Capability Deployment — Dependency DAG, Version Constraints & Collision Resolver
 *
 * Implements Phase 2 of CAPABILITY_DEPLOYMENT_PLUGINS:
 * - Target and adapter compatibility checks
 * - SSSS specification version constraints
 * - Dependency DAG construction and topological ordering
 * - Cycle detection and rejection
 * - File path, command, and SSSS category ownership collision detection
 * - Access grant and resource requirement aggregation
 */

import path from 'node:path';

/**
 * Custom error types for capability resolution
 */
export class IncompatibleAdapterError extends Error {
  constructor(message) {
    super(message);
    this.name = 'IncompatibleAdapterError';
  }
}

export class IncompatibleSsssVersionError extends Error {
  constructor(message) {
    super(message);
    this.name = 'IncompatibleSsssVersionError';
  }
}

export class DependencyCycleError extends Error {
  constructor(message, cycle = []) {
    super(message);
    this.name = 'DependencyCycleError';
    this.cycle = cycle;
  }
}

export class OwnershipCollisionError extends Error {
  constructor(message, collisionDetails = {}) {
    super(message);
    this.name = 'OwnershipCollisionError';
    this.details = collisionDetails;
  }
}

/**
 * Lightweight semver comparator to evaluate version constraints.
 * Supports basic operators: >=, <=, >, <, ^, ~, or exact versions.
 */
export function satisfiesVersionConstraint(version, range) {
  if (!range || range === '*' || range === 'latest') return true;
  if (!version) return false;

  const cleanV = version.replace(/^v/, '').trim();
  const vParts = cleanV.split('.').map(Number);
  const major = vParts[0] || 0;
  const minor = vParts[1] || 0;
  const patch = vParts[2] || 0;

  const cleanRange = range.trim();

  // Range with >= operator: e.g. ">=0.9.3"
  if (cleanRange.startsWith('>=')) {
    const target = cleanRange.slice(2).trim().split('.').map(Number);
    if (major > (target[0] || 0)) return true;
    if (major < (target[0] || 0)) return false;
    if (minor > (target[1] || 0)) return true;
    if (minor < (target[1] || 0)) return false;
    return patch >= (target[2] || 0);
  }

  // Caret range: e.g. "^0.9.0"
  if (cleanRange.startsWith('^')) {
    const target = cleanRange.slice(1).trim().split('.').map(Number);
    if (major !== (target[0] || 0)) return false;
    if (minor < (target[1] || 0)) return false;
    if (minor === (target[1] || 0)) return patch >= (target[2] || 0);
    return true;
  }

  // Exact match: e.g. "0.9.6"
  return cleanV === cleanRange.replace(/^v/, '');
}

/**
 * Validates adapter compatibility between capability plugin and target app.
 */
export function checkAdapterCompatibility(manifest, adapter) {
  if (!adapter) return;
  const targets = manifest.deploy?.targets;
  if (!targets || !Array.isArray(targets) || targets.length === 0) {
    // If no targets specified, defaults to universal capability
    return;
  }

  const isCompatible = targets.some((t) => t.toLowerCase() === adapter.toLowerCase() || t === '*');
  if (!isCompatible) {
    throw new IncompatibleAdapterError(
      `Plugin '${manifest.id}' is not compatible with target adapter '${adapter}'. Supported targets: ${targets.join(', ')}`
    );
  }
}

/**
 * Validates SSSS version requirement against target app's SSSS version.
 */
export function checkSsssVersionCompatibility(manifest, targetSsssVersion) {
  const req = manifest.deploy?.required_ssss_version;
  if (!req) return;

  const currentVersion = targetSsssVersion || '0.9.6';
  if (!satisfiesVersionConstraint(currentVersion, req)) {
    throw new IncompatibleSsssVersionError(
      `Plugin '${manifest.id}' requires SSSS version ${req}, but target app environment provides ${currentVersion}`
    );
  }
}

/**
 * Resolves full dependency DAG, detects cycles, and sorts topologically.
 *
 * @param {object} rootDescriptor - Root capability source descriptor from resolveCapabilitySource
 * @param {object} [options]
 * @param {string} [options.adapter] - Target adapter (e.g. ssss-app, nextjs, react, flask)
 * @param {object} [options.targetApp] - Target app info { dir, framework, ssssVersion }
 * @param {Function} [options.pluginResolver] - Async resolver for transitive dependencies: (id) => Promise<descriptor>
 * @returns {Promise<{
 *   adapter: string,
 *   targetApp: object,
 *   orderedPlugins: Array<object>,
 *   totalGrants: Array<string>,
 *   totalResources: object,
 *   fileOwners: Map<string, string>,
 *   categoryOwners: Map<string, string>
 * }>}
 */
export async function resolveCapabilityGraph(rootDescriptor, options = {}) {
  const adapter = options.adapter || options.targetApp?.framework || 'ssss-app';
  const targetSsssVersion = options.targetApp?.ssssVersion || '0.9.6';
  const pluginResolver = options.pluginResolver || (async () => null);

  const graph = new Map(); // id -> descriptor
  const visited = new Map(); // id -> 'unvisited' | 'visiting' | 'visited'
  const ordered = []; // Topological order (dependencies first)

  // 1. Traverse and discover all transitive dependencies
  async function traverse(currentDescriptor, pathTrace = []) {
    const id = currentDescriptor.id;

    if (pathTrace.includes(id)) {
      const cycle = [...pathTrace, id];
      throw new DependencyCycleError(`Dependency cycle detected: ${cycle.join(' -> ')}`, cycle);
    }

    if (graph.has(id)) return;
    graph.set(id, currentDescriptor);

    // Validate adapter and SSSS constraints for each plugin in the graph
    checkAdapterCompatibility(currentDescriptor.manifest, adapter);
    checkSsssVersionCompatibility(currentDescriptor.manifest, targetSsssVersion);

    const depsObj = currentDescriptor.manifest.dependencies || {};
    const depIds = Array.isArray(depsObj) ? depsObj : Object.keys(depsObj);

    for (const depId of depIds) {
      const depDescriptor = await pluginResolver(depId);
      if (!depDescriptor) {
        throw new Error(`Unresolvable dependency '${depId}' required by plugin '${id}'`);
      }

      const versionReq = typeof depsObj === 'object' && !Array.isArray(depsObj) ? depsObj[depId] : null;
      if (versionReq && !satisfiesVersionConstraint(depDescriptor.version, versionReq)) {
        throw new Error(
          `Version mismatch for dependency '${depId}': '${id}' requires ${versionReq}, but resolved ${depDescriptor.version}`
        );
      }

      await traverse(depDescriptor, [...pathTrace, id]);
    }
  }

  await traverse(rootDescriptor);

  // 2. Topological sort using DFS
  for (const id of graph.keys()) {
    visited.set(id, 'unvisited');
  }

  function dfsTopological(id, trace = []) {
    const state = visited.get(id);
    if (state === 'visiting') {
      const cycle = [...trace, id];
      throw new DependencyCycleError(`Dependency cycle detected: ${cycle.join(' -> ')}`, cycle);
    }
    if (state === 'visited') return;

    visited.set(id, 'visiting');
    const desc = graph.get(id);
    const depsObj = desc.manifest.dependencies || {};
    const depIds = Array.isArray(depsObj) ? depsObj : Object.keys(depsObj);

    for (const depId of depIds) {
      if (graph.has(depId)) {
        dfsTopological(depId, [...trace, id]);
      }
    }

    visited.set(id, 'visited');
    ordered.push(desc);
  }

  for (const id of graph.keys()) {
    if (visited.get(id) === 'unvisited') {
      dfsTopological(id);
    }
  }

  // 3. Collision Detection across the resolved graph
  const fileOwners = new Map(); // relPath -> pluginId
  const categoryOwners = new Map(); // categoryName -> pluginId
  const commandOwners = new Map(); // commandName -> pluginId
  const grantsSet = new Set();
  const aggregatedResources = {};

  for (const plugin of ordered) {
    const id = plugin.id;
    const manifest = plugin.manifest;

    // Check files
    for (const file of plugin.files || []) {
      if (file.path === 'plugin.json') continue; // plugin.json is per-plugin
      if (fileOwners.has(file.path)) {
        const priorOwner = fileOwners.get(file.path);
        throw new OwnershipCollisionError(
          `File collision detected: '${file.path}' is owned by both '${priorOwner}' and '${id}'`,
          { type: 'file', path: file.path, owners: [priorOwner, id] }
        );
      }
      fileOwners.set(file.path, id);
    }

    // Check SSSS categories
    const categories = manifest.ssss_schemas?.categories || [];
    for (const cat of categories) {
      const catName = cat.name;
      if (categoryOwners.has(catName)) {
        const priorOwner = categoryOwners.get(catName);
        throw new OwnershipCollisionError(
          `SSSS schema category collision: category '${catName}' is declared by both '${priorOwner}' and '${id}'`,
          { type: 'category', category: catName, owners: [priorOwner, id] }
        );
      }
      categoryOwners.set(catName, id);
    }

    // Check CLI commands
    const cliCmd = manifest.cli?.command;
    if (cliCmd) {
      if (commandOwners.has(cliCmd)) {
        const priorOwner = commandOwners.get(cliCmd);
        throw new OwnershipCollisionError(
          `CLI command collision: command '${cliCmd}' is claimed by both '${priorOwner}' and '${id}'`,
          { type: 'command', command: cliCmd, owners: [priorOwner, id] }
        );
      }
      commandOwners.set(cliCmd, id);
    }

    // Accumulate access grants
    for (const grant of (manifest.deploy?.access_grants || manifest.deploy?.grants || [])) {
      grantsSet.add(grant);
    }

    // Merge resources
    if (manifest.deploy?.resources) {
      Object.assign(aggregatedResources, manifest.deploy.resources);
    }
  }

  return {
    adapter,
    targetApp: {
      dir: options.targetApp?.dir || process.cwd(),
      framework: adapter,
      ssssVersion: targetSsssVersion
    },
    orderedPlugins: ordered,
    totalGrants: Array.from(grantsSet).sort(),
    totalResources: aggregatedResources,
    fileOwners,
    categoryOwners
  };
}
