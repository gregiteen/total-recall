/**
 * SSSS 0.9 package kernel bridge for Total Recall.
 *
 * Modes (env TR_SSSS_KERNEL_MODE):
 *   legacy          — local processOperation only (default)
 *   shadow          — legacy commits; package kernel dry-runs for verdict diffs
 *   kernel-low-risk — package kernel for structural low-risk core types
 *   kernel          — package kernel for package-known types
 */
import fs from 'node:fs';
import path from 'node:path';
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
import {
  TOTAL_RECALL_HOST_EXTENSION,
  listCoreTypes,
  listHostOnlyTypes,
  listMissingCoreSchemas,
} from './ssss-host-extension.mjs';

const LOW_RISK_TYPES = new Set(['rule', 'page', 'assistant', 'skill', 'model']);
const PROTOCOL_PATHS = new Set([
  'references/ssss-spec.md',
  'references/admin-protocol-evolution-policy.md',
  'references/user-local-optimizer-boundary-policy.md',
]);

let cachedEngine = null;
let cachedRegistryKey = '';

export function getKernelMode() {
  const mode = (process.env.TR_SSSS_KERNEL_MODE || 'legacy').toLowerCase();
  if (['legacy', 'shadow', 'kernel-low-risk', 'kernel'].includes(mode)) return mode;
  return 'legacy';
}

export function inventorySummary() {
  return {
    mode: getKernelMode(),
    core_types: listCoreTypes(),
    host_only_types: listHostOnlyTypes(),
    missing_local_core_schemas: listMissingCoreSchemas(),
    low_risk_types: [...LOW_RISK_TYPES],
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
  const expanded = new Set(capabilities);
  for (const perm of capabilities) {
    if (perm === 'write:*' || perm === '*:*') expanded.add('*:*');
    if (perm.startsWith('write:')) {
      const type = perm.slice('write:'.length);
      expanded.add(`${type}:*`);
      expanded.add(`${type}:create`);
      expanded.add(`${type}:replace`);
      expanded.add(`${type}:patch`);
      expanded.add(`${type}:delete`);
      expanded.add(`${type}:event`);
    }
  }

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
  return null;
}

export function isLowRiskEnvelope(envelope) {
  const declared = declaredTypeFromEnvelope(envelope);
  return declared ? LOW_RISK_TYPES.has(declared) : false;
}

export function isProtocolPath(vfsPath = '') {
  const cleaned = String(vfsPath).replace(/^\/+/, '');
  if (PROTOCOL_PATHS.has(cleaned)) return true;
  if (cleaned.startsWith('fixtures/')) return true;
  if (cleaned.endsWith('schema.mjs') || cleaned.endsWith('schema.spec.mjs')) return true;
  return false;
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
  const env = {
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

  const response = await engine.processOperation(env, vaultRoot, {
    ...options,
    vaultRoot,
    principal: options.principal || mapTrPrincipal(env, options, vaultRoot),
  });
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
  if (mode === 'kernel-low-risk') return isLowRiskEnvelope(envelope);
  return false;
}

export function scanDirectCanonicalWrites(rootDir) {
  // Package guard flags raw write patterns in host source trees.
  return detectDirectWrites(rootDir);
}

export function resolveHostDefinition(type) {
  const registrySet = createTotalRecallRegistrySet();
  return resolvePrimitiveDefinition(registrySet, type);
}
