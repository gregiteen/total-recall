/**
 * SSSS 0.9 package kernel bridge for Total Recall.
 *
 * Modes (env TR_SSSS_KERNEL_MODE):
 *   kernel-core     — **default** — package kernel for core types (incl. memory/workflow)
 *   kernel-low-risk — package kernel for structural low-risk core types only
 *   kernel          — package kernel for all package-known types
 *   shadow          — legacy commits; package kernel dry-runs for verdict diffs
 *   legacy          — local processOperation only (fallback / unit tests)
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import matter from 'gray-matter';
import { createEngine } from '@ssss/cli/engine';
import { createValidator } from '@ssss/cli/validator';
import {
  composeRegistryLayers,
  loadRegistries,
  resolvePrimitiveDefinition,
} from '@ssss/cli/registry';
import { detectDirectWrites } from '@ssss/cli/guard';
import { logger } from './logger.mjs';
import { validateMemoryNode } from './total-recall-memory-validator.mjs';
import {
  TOTAL_RECALL_HOST_EXTENSION,
  listCoreTypes,
  listHostOnlyTypes,
  listMissingCoreSchemas,
} from './ssss-host-extension.mjs';

const LOW_RISK_TYPES = new Set(['rule', 'page', 'assistant', 'skill', 'model']);
/** Core package primitives safe to cut over before full host-type migration. */
const CORE_ROUTE_TYPES = new Set([
  ...LOW_RISK_TYPES,
  'memory',
  'workflow',
  'task',
  'security_role',
  'run',
  'conversation',
  'conflict',
  'migration',
  'release',
  'primitive',
]);
const PROTOCOL_PATHS = new Set([
  'references/ssss-spec.md',
  'references/admin-protocol-evolution-policy.md',
  'references/user-local-optimizer-boundary-policy.md',
]);

/** Source modules allowed to touch derived / non-canonical state without kernel. */
const DIRECT_WRITE_APPROVED = [
  'src/core/operation-validator.mjs',
  'src/core/ssss-kernel-bridge.mjs',
  'src/core/validated-write.mjs',
  'src/core/vault.mjs',
  'src/core/surface.mjs',
  'src/core/blackboard.mjs',
  'src/core/steering.mjs',
  'src/core/logger.mjs',
  'src/core/daemon-control.mjs',
  'src/core/snapshot.mjs',
];

let cachedEngine = null;
let cachedRegistryKey = '';

export function getKernelMode() {
  // Default to package-kernel cutover for core types (memory/workflow/low-risk).
  // Set TR_SSSS_KERNEL_MODE=legacy only when deliberately testing the old pipeline.
  const mode = (process.env.TR_SSSS_KERNEL_MODE || 'kernel-core').toLowerCase();
  if (['legacy', 'shadow', 'kernel-low-risk', 'kernel-core', 'kernel'].includes(mode)) return mode;
  return 'kernel-core';
}

export function inventorySummary() {
  return {
    mode: getKernelMode(),
    core_types: listCoreTypes(),
    host_only_types: listHostOnlyTypes(),
    missing_local_core_schemas: listMissingCoreSchemas(),
    low_risk_types: [...LOW_RISK_TYPES],
    core_route_types: [...CORE_ROUTE_TYPES],
  };
}

export function mapTrPrincipal(envelope, callOptions = {}, vaultRoot = '') {
  if (callOptions.principal) return callOptions.principal;

  const role = callOptions.agentRole || envelope?.actor?.role || null;
  if (!role) return null;

  let kind = 'agent';
  let capabilities = [];

  if (role === 'system') {
    kind = 'system';
    capabilities = ['*:*'];
  } else if (role === 'admin') {
    kind = 'human';
    capabilities = ['*:*'];
  } else if (role === 'optimizer') {
    kind = 'agent';
    capabilities = ['memory:create', 'memory:replace', 'memory:patch', 'write:memory', 'memory:*'];
  } else if (vaultRoot && /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(role)) {
    const roleFile = path.join(vaultRoot, 'roles', role, 'ROLE.md');
    if (fs.existsSync(roleFile)) {
      try {
        const { data } = matter(fs.readFileSync(roleFile, 'utf8'));
        capabilities = Array.isArray(data.permissions) ? data.permissions : [];
      } catch {
        capabilities = [];
      }
    }
  }

  // Map TR write:* style permissions into capability wildcards the package authorizer understands.
  // Package kernel may require either local (`memory:create`) or qualified (`ssss:memory:create`) IDs.
  const expanded = new Set(capabilities);
  const addTypeCaps = (type) => {
    for (const action of ['*', 'create', 'replace', 'patch', 'delete', 'event', 'append']) {
      expanded.add(`${type}:${action}`);
      expanded.add(`ssss:${type}:${action}`);
    }
  };
  for (const perm of capabilities) {
    if (perm === 'write:*' || perm === '*:*') expanded.add('*:*');
    if (perm.startsWith('write:')) addTypeCaps(perm.slice('write:'.length));
    // Also expand bare type wildcards / actions already present.
    const match = /^([a-z][a-z0-9_-]*):([a-z*].*)$/i.exec(perm);
    if (match) {
      expanded.add(perm);
      expanded.add(`ssss:${perm}`);
      if (match[2] === '*') addTypeCaps(match[1]);
    }
  }
  // Optimizer convenience: memory mutations.
  if (role === 'optimizer') addTypeCaps('memory');

  return {
    id: `tr-role:${role}`,
    kind,
    workspaceIds: [envelope.workspace_id].filter(Boolean),
    capabilities: [...expanded],
    authentication: {
      provider: 'total-recall-role-adapter',
      assurance: role === 'admin' || role === 'system' ? 'elevated' : 'verified',
    },
    role,
  };
}

/**
 * Package loadRegistries() already includes core + shipped extensions (festech).
 * Re-compose so the Total Recall host extension attaches without colliding with
 * package-provided types.
 */
export function createTotalRecallRegistrySet(options = {}) {
  const base = loadRegistries(options.registryDir);
  const host = TOTAL_RECALL_HOST_EXTENSION;
  const packageExtensions = new Map();

  for (const def of base.types.values()) {
    if (!def.registry || def.registry === 'core') continue;
    if (!packageExtensions.has(def.registry)) {
      packageExtensions.set(def.registry, {
        registry: def.registry,
        extends: 'ssss',
        version: base.extensionVersions?.get(def.registry) || '0.0.0',
        document_primitives: {},
      });
    }
    const { type, qualified_type, registry, ...rest } = def;
    packageExtensions.get(def.registry).document_primitives[def.type] = rest;
  }

  return composeRegistryLayers({
    core: base.core,
    installed: [...packageExtensions.values()],
    repository: [host],
  });
}

export function getTotalRecallEngine(options = {}) {
  const registrySet = createTotalRecallRegistrySet(options);
  const key = `${[...registrySet.types.keys()].sort().join(',')}|${options.leaseStore || ''}`;
  if (!cachedEngine || cachedRegistryKey !== key || options.forceNew) {
    const validator = createValidator({ registrySet });
    cachedEngine = createEngine({
      registrySet,
      validator,
      leaseStore: options.leaseStore,
      verifyPrincipal: async (envelope, callOptions) =>
        mapTrPrincipal(envelope, callOptions, callOptions.vaultRoot || options.vaultRoot || ''),
    });
    cachedRegistryKey = key;
  }
  return cachedEngine;
}

function declaredTypeFromEnvelope(envelope) {
  if (envelope?.primitive_type) return envelope.primitive_type;
  if (envelope?.type === 'operation' && typeof envelope.content === 'string') {
    try {
      return matter(envelope.content).data?.type || null;
    } catch {
      return null;
    }
  }
  if (envelope?.type === 'patch' || envelope?.type === 'delete') {
    // Caller may pass resolved type; otherwise unknown until kernel reads the file.
    return envelope.primitive_type || null;
  }
  return null;
}

export function isLowRiskEnvelope(envelope) {
  const declared = declaredTypeFromEnvelope(envelope);
  return declared ? LOW_RISK_TYPES.has(declared) : false;
}

export function isCoreRouteEnvelope(envelope) {
  const declared = declaredTypeFromEnvelope(envelope);
  return declared ? CORE_ROUTE_TYPES.has(declared) : false;
}

export function isProtocolPath(vfsPath = '') {
  const cleaned = String(vfsPath).replace(/^\/+/, '');
  if (PROTOCOL_PATHS.has(cleaned)) return true;
  if (cleaned.startsWith('fixtures/')) return true;
  if (cleaned.endsWith('schema.mjs') || cleaned.endsWith('schema.spec.mjs')) return true;
  return false;
}

function stringifyDocument(data, body) {
  // Prefer gray-matter when available; fall back to simple frontmatter dump.
  try {
    return matter.stringify(body || '', data);
  } catch {
    const yaml = Object.entries(data)
      .map(([key, value]) => `${key}: ${JSON.stringify(value)}`)
      .join('\n');
    return `---\n${yaml}\n---\n\n${body || ''}`;
  }
}

/**
 * Host preflight: satisfy package universal frontmatter + TR memory policy.
 * Returns { envelope, warnings, errors }.
 */
/**
 * Stable timestamp for a given idempotency key so exact retries prepare identical
 * content (package kernel binds idempotency to the request hash of content).
 */
export function stableTimestampForKey(idempotencyKey, fallback = () => new Date().toISOString()) {
  if (typeof idempotencyKey !== 'string' || !idempotencyKey) return fallback();
  const digest = crypto.createHash('sha256').update(idempotencyKey).digest();
  // Fixed epoch window so values stay valid ISO datetimes without needing wall clock.
  const ms = Date.UTC(2026, 0, 1) + (digest.readUInt32BE(0) % (86400_000 * 365));
  return new Date(ms).toISOString();
}

export function prepareEnvelopeForKernel(envelope, options = {}) {
  const warnings = [];
  const errors = [];
  const role = options.agentRole || envelope.actor?.role || null;
  const now = options.clock?.() || stableTimestampForKey(envelope.idempotency_key);
  let env = { ...envelope };

  if (env.type === 'operation' && typeof env.content === 'string') {
    let parsed;
    try {
      parsed = matter(env.content);
    } catch (error) {
      return { envelope: env, warnings, errors: [`Content parsing error: ${error.message}`] };
    }
    const data = { ...parsed.data };

    // Package 0.9 universal frontmatter.
    if (!data.title && data.name) data.title = data.name;
    if (!data.description) {
      data.description = data.title || data.name || data.slug || 'Total Recall document';
    }
    if (!data.timestamp) {
      data.timestamp = data.updated || data.created || now;
    }

    if (data.type === 'memory') {
      if (!env.dry_run) {
        data.updated = now;
        data.last_accessed = now;
        if (!data.created) data.created = now;
      }
      // TR host overlay (schema v2 + sentiment_target).
      const overlay = validateMemoryNode(data);
      if (!overlay.success) errors.push(...overlay.errors);

      if (role === 'optimizer') {
        if (data.priority === 'absolute') warnings.push('Optimizer writing Tier 1 (priority: absolute) node.');
        if (data.immutable === true) warnings.push('Optimizer writing immutable node.');
      }
    }

    if (data.type === 'workflow') {
      if (!data.title && data.name) data.title = data.name;
      if (!data.name && data.title) data.name = data.title;
    }

    if (data.type === 'schema-proposal' && data.status === 'accepted') {
      if (role !== 'admin' && role !== 'system') {
        errors.push('Only admin may accept schema-proposals.');
      }
      if (!data.reviewed_by) errors.push('Accepted schema-proposals must have reviewed_by.');
    }

    env = { ...env, content: stringifyDocument(data, parsed.content) };
  }

  if (env.type === 'patch' && env.patches && typeof env.patches === 'object') {
    const patches = { ...env.patches };
    // Memory touch stamps on patch.
    if (!env.dry_run && (patches.type === 'memory' || options.resolvedType === 'memory' || env.path?.includes('memory-vault/') || /^(invariants|patterns|anti-patterns|preferences|decisions|concepts|facts|lore)\//.test(env.path || ''))) {
      patches.updated = patches.updated || now;
      patches.last_accessed = patches.last_accessed || now;
    }
    env = { ...env, patches };
  }

  return { envelope: env, warnings, errors };
}

/**
 * Execute through the package kernel (async).
 * Injects actor.role for the engine façade when only agentRole is supplied.
 */
export async function processViaPackageKernel(envelope, vaultRoot, options = {}) {
  const engine = getTotalRecallEngine({
    leaseStore: options.leaseStore,
    vaultRoot,
    registryDir: options.registryDir,
    forceNew: options.forceNew,
  });

  const role = options.agentRole || envelope.actor?.role;
  let env = {
    ...envelope,
    actor: envelope.actor || (role ? { role } : undefined),
  };

  // Host policy: protocol paths require admin/system before kernel sees the write.
  if (isProtocolPath(env.path) && role !== 'admin' && role !== 'system') {
    return {
      success: false,
      type: env.type,
      operation_id: null,
      path: env.path,
      committed_at: null,
      dry_run: !!env.dry_run,
      validation: {
        valid: false,
        type: null,
        errors: [`Protocol path '${env.path}' requires admin role.`],
        warnings: [],
      },
    };
  }

  const prepared = prepareEnvelopeForKernel(env, { ...options, agentRole: role });
  if (prepared.errors.length) {
    return {
      success: false,
      type: env.type,
      operation_id: null,
      path: env.path,
      committed_at: null,
      dry_run: !!env.dry_run,
      validation: {
        valid: false,
        type: declaredTypeFromEnvelope(env),
        errors: prepared.errors,
        warnings: prepared.warnings,
      },
      repair: {
        field_errors: prepared.errors.map((issue) => ({ field: '(host-policy)', issue })),
      },
    };
  }
  env = prepared.envelope;

  const response = await engine.processOperation(env, vaultRoot, {
    ...options,
    vaultRoot,
    principal: options.principal || mapTrPrincipal(env, options, vaultRoot),
  });

  if (prepared.warnings.length && response?.validation) {
    response.validation.warnings = [
      ...(response.validation.warnings || []),
      ...prepared.warnings,
    ];
  }
  return response;
}

export function compareVerdicts(localResult, kernelResult) {
  return {
    success_match: !!localResult?.success === !!kernelResult?.success,
    valid_match: !!localResult?.validation?.valid === !!kernelResult?.validation?.valid,
    type_match: (localResult?.validation?.type || null) === (kernelResult?.validation?.type || null),
    local: {
      success: !!localResult?.success,
      valid: !!localResult?.validation?.valid,
      type: localResult?.validation?.type || null,
      errors: localResult?.validation?.errors || [],
    },
    kernel: {
      success: !!kernelResult?.success,
      valid: !!kernelResult?.validation?.valid,
      type: kernelResult?.validation?.type || null,
      errors: kernelResult?.validation?.errors || [],
    },
  };
}

export async function shadowCompare(envelope, vaultRoot, localResult, options = {}) {
  const dryEnvelope = { ...envelope, dry_run: true };
  try {
    const kernelResult = await processViaPackageKernel(dryEnvelope, vaultRoot, options);
    const comparison = compareVerdicts(localResult, kernelResult);
    if (!comparison.success_match || !comparison.valid_match) {
      logger.warn?.(
        'ssss-shadow',
        `Verdict drift path=${envelope.path} local.success=${comparison.local.success} kernel.success=${comparison.kernel.success} local.valid=${comparison.local.valid} kernel.valid=${comparison.kernel.valid}`,
      );
    }
    return { comparison, kernelResult };
  } catch (error) {
    logger.warn?.('ssss-shadow', `Kernel shadow failed: ${error.message}`);
    return {
      comparison: {
        success_match: false,
        valid_match: false,
        type_match: false,
        error: error.message,
      },
      kernelResult: null,
    };
  }
}

export function shouldRouteToKernel(envelope) {
  const mode = getKernelMode();
  if (mode === 'legacy' || mode === 'shadow') return false;
  if (mode === 'kernel') return true;
  if (mode === 'kernel-core') return isCoreRouteEnvelope(envelope);
  if (mode === 'kernel-low-risk') return isLowRiskEnvelope(envelope);
  return false;
}

/**
 * Scan host source for direct filesystem mutations outside approved adapters.
 * Returns package-guard findings filtered to canonical-risk paths.
 */
export function scanDirectCanonicalWrites(rootDir = path.resolve('src'), options = {}) {
  const approved = options.approved || DIRECT_WRITE_APPROVED;
  const findings = detectDirectWrites(rootDir, { approved, ...options });

  // Highlight likely canonical vault mutations (memory nodes, vault docs).
  const CANONICAL_HINT = /memory-vault|writeNode\b|safeStringify\b|processOperation\b|atomicWrite\b/;
  return findings.map((finding) => ({
    ...finding,
    severity: CANONICAL_HINT.test(finding.source) ? 'high' : 'medium',
  }));
}

/**
 * Modules that write memory-like markdown without going through Operation Contract.
 * Heuristic: atomicWrite/writeNode call sites outside the approved contract surface.
 */
export function listUnapprovedCanonicalWriters(rootDir = path.resolve('src/core')) {
  const approved = new Set(DIRECT_WRITE_APPROVED.map((p) => path.normalize(p)));
  const writers = [];
  const stack = [path.resolve(rootDir)];
  while (stack.length) {
    const dir = stack.pop();
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.name === 'node_modules' || entry.name.endsWith('.spec.mjs')) continue;
      const absolute = path.join(dir, entry.name);
      if (entry.isDirectory()) { stack.push(absolute); continue; }
      if (!entry.name.endsWith('.mjs')) continue;
      const relative = path.relative(process.cwd(), absolute).split(path.sep).join('/');
      if (approved.has(relative) || approved.has(path.normalize(relative))) continue;
      const text = fs.readFileSync(absolute, 'utf8');
      if (/\bwriteNode\s*\(/.test(text) || /\batomicWrite\s*\([^)]*\.md/.test(text)) {
        writers.push(relative);
      }
    }
  }
  return writers.sort();
}

export function resolveHostDefinition(type) {
  const registrySet = createTotalRecallRegistrySet();
  return resolvePrimitiveDefinition(registrySet, type);
}
