/**
 * Total Recall host extension registry for SSSS 0.9.
 *
 * Core document primitives come from `@ssss/cli/registry/core.json`.
 * Package-shipped SSSS extensions are consumed as-is.
 * Everything else in local Zod schemas becomes the TR host extension.
 */
import { createRequire } from 'node:module';
import { loadRegistries } from '@ssss/cli/registry';
import { SSSS_SCHEMAS } from './schema.mjs';

const require = createRequire(import.meta.url);
const core = require('@ssss/cli/registry/core.json');

const CORE_TYPES = new Set(Object.keys(core.document_primitives || {}));

function packageKnownTypes() {
  const base = loadRegistries();
  return new Set([...base.types.keys()]);
}

/** Types that exist only in Total Recall (or product overlays carried here). */
export function listHostOnlyTypes() {
  const known = packageKnownTypes();
  return Object.keys(SSSS_SCHEMAS)
    .filter((type) => !known.has(type))
    .sort();
}

/** Types present in TR Zod schemas that already come from package core/extensions. */
export function listTypesProvidedByPackage() {
  const known = packageKnownTypes();
  return Object.keys(SSSS_SCHEMAS)
    .filter((type) => known.has(type))
    .sort();
}

/** Types Total Recall must consume from the package core registry. */
export function listCoreTypes() {
  return [...CORE_TYPES].sort();
}

/** Core types present in package but missing from local Zod registry. */
export function listMissingCoreSchemas() {
  return listCoreTypes().filter((type) => !(type in SSSS_SCHEMAS));
}

function hostPrimitive(type, options = {}) {
  return {
    family: options.family || 'host',
    append_only: !!options.append_only,
    portability: options.portability || 'tenant_private',
    required_fields: options.required_fields || ['type', 'title', 'description', 'timestamp'],
    optional_fields: options.optional_fields || [],
    notes: options.notes || `Total Recall host extension type '${type}'.`,
  };
}

/**
 * Build a package-compatible extension registry for TR host-only types.
 * Field enforcement remains partially on Zod overlays until full declaration
 * migration; the registry makes composition and kernel routing possible.
 */
export function buildTotalRecallHostExtension() {
  const document_primitives = {};
  for (const type of listHostOnlyTypes()) {
    const resourceBound = new Set([
      'email_account', 'deployment', 'workspace', 'workspace_transfer',
    ]);
    const structural = new Set(['language_convention', 'extension']);
    let portability = 'tenant_private';
    if (resourceBound.has(type)) portability = 'resource_bound';
    if (structural.has(type)) portability = 'structural';
    document_primitives[type] = hostPrimitive(type, {
      portability,
      family: resourceBound.has(type) ? 'resource' : 'host',
    });
  }

  return {
    registry: 'total-recall',
    extends: 'ssss',
    version: '1.0.0',
    description: 'Total Recall host-only document primitives for SSSS 0.9 composition.',
    document_primitives,
  };
}

export function getTotalRecallHostExtension() {
  return buildTotalRecallHostExtension();
}

// Lazy: package types must be loadable before first composition.
export const TOTAL_RECALL_HOST_EXTENSION = buildTotalRecallHostExtension();
