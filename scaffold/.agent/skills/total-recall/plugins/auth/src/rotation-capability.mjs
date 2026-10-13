/**
 * Rotation capability classification.
 *
 * Every secret in the vault resolves to exactly one rotation class, so that
 * `secret rotate-auto` always has a defined method — or a defined reason why a
 * human must act. Nothing is silently unrotatable.
 *
 *   provider_api      Provider exposes a key-management API. Fully automatic.
 *   provider_browser  No API; drive the provider console in TR's browser profile.
 *   self_generated    TR mints the value itself (JWT/app/db secrets). No provider.
 *   manual            Human-only artifact (SSH keys, recovery codes, OAuth apps).
 *
 * Never log secret values.
 */

import crypto from 'node:crypto';
import { getProvider, providerForKeyName } from './provider-catalog.mjs';

/** Keys TR mints itself — no provider console is involved. */
const SELF_GENERATED_PATTERNS = [
  /^JWT_SECRET$/,
  /^BETTER_AUTH_SECRET$/,
  /^ADMIN_API_(SECRET|TOKEN)$/,
  /^TEST_USER_API_TOKEN$/,
  /^TR_MESH_SYNC_TOKEN$/,
  /_WEBHOOK_SECRET$/,
  /_SSO_SECRET$/,
  /^(DB|REDIS|ARI|SIPUS)_PASSWORD$/,
  /^ASTERISK_(ARI_PASSWORD|SIP_SECRET)$/,
  /_ADMIN_PASSWORD$/,
  /_TEST_ACCOUNT_PASSWORD$/,
  /_WEBMAIL_PASSWORD$/,
];

/** Keys that can only ever be replaced by a human at a console. */
const MANUAL_PATTERNS = [
  /SSH_KEY$/,
  /_RECOVERY_CODE$/,
  /_PRIVATE_KEY$/,
  /OAUTH_CLIENT_SECRET$/,
  /_LOGIN_EMAIL$/,
  /_EMAIL$/,
  /^TR_SECRETS_PASSWORD$/, // rotating this re-encrypts the vault — separate flow
];

/** Internal bookkeeping entries that are not credentials at all. */
const NON_SECRET_PATTERNS = [/^__/];

/**
 * Value shapes TR can mint for self_generated keys.
 * @param {string} key
 */
export function selfGeneratedSpec(key) {
  const k = String(key).toUpperCase();
  if (/PASSWORD$/.test(k)) return { kind: 'password', bytes: 24 };
  if (/^JWT_SECRET$|SECRET$/.test(k)) return { kind: 'hex', bytes: 48 };
  return { kind: 'token', bytes: 32 };
}

/**
 * Mint a new value for a self_generated secret.
 * Returned in-memory only — callers must hand it straight to rotateSecretAndExport.
 * @param {string} key
 * @returns {string}
 */
export function generateSecretValue(key) {
  const spec = selfGeneratedSpec(key);
  const raw = crypto.randomBytes(spec.bytes);
  if (spec.kind === 'hex') return raw.toString('hex');
  if (spec.kind === 'password') {
    // base64url avoids shell/env quoting hazards in .env projections
    return raw.toString('base64url');
  }
  return raw.toString('base64url');
}

function matchesAny(key, patterns) {
  return patterns.some((re) => re.test(key));
}

/**
 * Classify a single secret key into its rotation plan.
 *
 * @param {string} key
 * @param {{ provider?: string }} [meta] Stored metadata (provider override wins)
 * @returns {{
 *   key: string,
 *   class: 'provider_api'|'provider_browser'|'self_generated'|'manual'|'non_secret',
 *   provider: string|null,
 *   console_url: string|null,
 *   automatable: boolean,
 *   high_risk: boolean,
 *   reason: string,
 * }}
 */
export function getRotationPlan(key, meta = {}) {
  const k = String(key || '');
  const base = { key: k, provider: null, console_url: null, high_risk: false };

  if (matchesAny(k, NON_SECRET_PATTERNS)) {
    return { ...base, class: 'non_secret', automatable: false, reason: 'internal metadata, not a credential' };
  }

  // Explicit manual artifacts win over any provider mapping — an OAuth client
  // secret belongs to an app registration, not a rotatable API key.
  if (matchesAny(k, MANUAL_PATTERNS)) {
    const p = meta.provider ? getProvider(meta.provider) : providerForKeyName(k);
    return {
      ...base,
      class: 'manual',
      provider: p?.id || null,
      console_url: p?.console_url || null,
      automatable: false,
      reason: 'human-only artifact (key material, recovery code, or app registration)',
    };
  }

  if (matchesAny(k, SELF_GENERATED_PATTERNS)) {
    return {
      ...base,
      class: 'self_generated',
      automatable: true,
      reason: 'TR mints this value directly; no provider console involved',
    };
  }

  const provider = meta.provider ? getProvider(meta.provider) : providerForKeyName(k);
  if (!provider) {
    return {
      ...base,
      class: 'manual',
      automatable: false,
      reason: 'no provider mapping — add a catalog entry to enable rotation',
    };
  }

  const rot = provider.rotation || {};
  if (rot.manual_keys?.some((mk) => mk.toUpperCase() === k.toUpperCase())) {
    return {
      ...base,
      class: 'manual',
      provider: provider.id,
      console_url: provider.console_url || null,
      automatable: false,
      reason: `${provider.name} issues this artifact once and cannot reissue it programmatically`,
    };
  }

  const cls = rot.class || (provider.console_url ? 'provider_browser' : 'manual');
  return {
    ...base,
    class: cls,
    provider: provider.id,
    console_url: provider.console_url || null,
    high_risk: !!rot.high_risk,
    automatable: cls === 'provider_api' || cls === 'provider_browser' || cls === 'self_generated',
    reason:
      cls === 'provider_api'
        ? `${provider.name} exposes a key-management API`
        : cls === 'provider_browser'
          ? `${provider.name} has no key-minting API; console automation required`
          : `${provider.name} has no console URL registered`,
  };
}

/**
 * Classify every key in a vault snapshot.
 * @param {string[]} keys
 * @param {Record<string, any>} [metaByKey]
 */
export function planAll(keys, metaByKey = {}) {
  return keys.map((k) => getRotationPlan(k, metaByKey[k] || {}));
}

/**
 * Summarise coverage — used by `secret rotation-status`.
 * @param {ReturnType<typeof planAll>} plans
 */
export function summarizePlans(plans) {
  const byClass = {};
  for (const p of plans) byClass[p.class] = (byClass[p.class] || 0) + 1;
  const automatable = plans.filter((p) => p.automatable).length;
  return {
    total: plans.length,
    automatable,
    manual: plans.length - automatable,
    byClass,
  };
}
