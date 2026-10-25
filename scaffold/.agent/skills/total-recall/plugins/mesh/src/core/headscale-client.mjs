import { importHostModule } from '../host-runtime.mjs';
const { loadPluginModule: __loadOwnedPlugin } = await importHostModule('src/core/plugin-runtime.mjs');
/**
 * Headscale control-server client.
 *
 * Host side of the Headscale client, shared by the REST proxy
 * (`routes/headscale.mjs`) and automatic node enrollment (`mesh-enroll.mjs`).
 * This module only resolves the operator's credential from the auth plugin and
 * the throttled transport; the API calls themselves live in the host-free
 * brick (`capability/headscale-api.mjs`). No control-server URL is ever
 * hardcoded — it comes from the operator's own secret entry or environment.
 */
const { getSecretsCatalog, getSecret } = await __loadOwnedPlugin('auth', 'secrets-store');
const { hostSecretsBrainDir } = await __loadOwnedPlugin('auth', 'host-secrets-store');
import { throttledFetch } from './throttled-fetch.mjs';
import { createHeadscaleApi, assertSecureControlUrl, normalizeControlUrl, buildMeshSshPolicy } from '../../capability/headscale-api.mjs';

export { assertSecureControlUrl, normalizeControlUrl, buildMeshSshPolicy };

const DEFAULT_TIMEOUT_MS = 10_000;

/** Env override so headless/CI installs can point at a control server without a secret. */
export function headscaleUrlFromEnv() {
  const raw = process.env.TR_HEADSCALE_URL || process.env.TR_LOGIN_SERVER || '';
  return raw.trim() || null;
}

/**
 * Locate the operator's headscale credential without knowing its key name.
 * Any secret whose provider is `headscale` is treated as the control-server token.
 *
 * Auth selects its one store for this host (or explicit TR_SECRETS_BRAIN).
 * The caller's project brain never creates or selects a second credential store.
 */
async function locateHeadscaleKey(brainDir) {
  const target = hostSecretsBrainDir();

  const local = await getSecretsCatalog(target);
  const hit = local.keys.find((k) => k.provider === 'headscale');
  if (hit) return { meta: hit, storeDir: target };

  return null;
}

export async function findHeadscaleKeyMeta(brainDir) {
  const found = await locateHeadscaleKey(brainDir);
  return found ? found.meta : null;
}

/**
 * Resolve `{ url, token }` for the control server.
 * Throws when no credential is configured — callers that must degrade
 * gracefully should use `describeHeadscaleAvailability()` instead.
 */
export async function resolveHeadscaleConfig(brainDir) {
  const found = await locateHeadscaleKey(brainDir);
  if (!found) {
    throw new Error('Headscale API Key not configured in ApiKeysPage');
  }
  const { meta, storeDir } = found;

  const got = await getSecret(storeDir, meta.key, {
    action: 'use',
    actor: 'headscale-client',
  });
  if (!got.found || !got.value) {
    throw new Error('Headscale API Key token value is empty or not set');
  }

  const url = normalizeControlUrl(meta.headscale_url || headscaleUrlFromEnv() || '');
  if (!url) {
    throw new Error('Headscale control server URL is not set on the headscale API key');
  }

  return { url, token: got.value, keyName: meta.key };
}

/**
 * Non-throwing capability probe used by enrollment and status endpoints:
 * reports whether an automated (pre-auth key) enrollment path is possible.
 */
export async function describeHeadscaleAvailability(brainDir) {
  try {
    const meta = await findHeadscaleKeyMeta(brainDir);
    if (!meta) {
      return { configured: false, reason: 'no-headscale-api-key', url: headscaleUrlFromEnv() };
    }
    const url = normalizeControlUrl(meta.headscale_url || headscaleUrlFromEnv() || '');
    if (!url) {
      return { configured: false, reason: 'no-control-url', url: null, keyName: meta.key };
    }
    if (!meta.set) {
      return { configured: false, reason: 'api-key-value-empty', url, keyName: meta.key };
    }
    return { configured: true, reason: null, url, keyName: meta.key };
  } catch (err) {
    return { configured: false, reason: err.message || 'headscale-probe-failed', url: null };
  }
}

/** A brick client bound to this brain's credential, over the host's throttled transport. */
async function hostApi(brainDir) {
  const { url, token } = await resolveHeadscaleConfig(brainDir);
  return createHeadscaleApi({
    url,
    token,
    fetch: (target, { timeoutMs, ...options }) => throttledFetch(target, options, timeoutMs || DEFAULT_TIMEOUT_MS),
  });
}

/**
 * Authenticated request against the control server's API.
 * Credentials always come from the auth owner's host-store selector.
 */
export async function headscaleFetch(path, options = {}, brainDir) {
  return (await hostApi(brainDir)).request(path, options);
}

/** Resolve a control-server user to both of its identifying forms. */
export async function resolveHeadscaleUser(brainDir, requested) {
  return (await hostApi(brainDir)).resolveUser(requested);
}

/** Mint a pre-auth key for a registered numeric control-server user. */
export async function createHeadscalePreAuthKey(options = {}, brainDir) {
  return (await hostApi(brainDir)).createPreAuthKey(options);
}

/** Read the control server's ACL policy; an empty policy table reads as `policy: null`. */
export async function getHeadscalePolicy(brainDir) {
  return (await hostApi(brainDir)).getPolicy();
}

/** Replace the control server's ACL policy; Headscale validates it server-side. */
export async function setHeadscalePolicy(policy, brainDir) {
  if (!policy) throw new Error('A policy is required');
  return (await hostApi(brainDir)).setPolicy(policy);
}
