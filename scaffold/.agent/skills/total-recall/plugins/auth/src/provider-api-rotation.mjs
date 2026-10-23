/**
 * Provider-API rotation.
 *
 * Some providers let an account mint and revoke its own keys over their API, given a credential
 * with management rights. Until this module existed, no such path existed in the plugin at all:
 * rotation-capability classified keys as `provider_api` and described them as "fully automatic",
 * but rotateAuto sent `provider_api` down the browser path with everything else, so a provider
 * that could rotate itself in one request was instead driven through a console login. A
 * management key therefore had no consumer anywhere in the code.
 *
 * Recipes are data: a provider declares the endpoints and which stored secret holds the
 * management credential (provider-catalog.mjs `rotation.api`). Nothing here is provider-specific
 * beyond those declarations, and no secret value is ever logged or returned.
 */

/**
 * @typedef {{
 *   create: { method: string, path: string, body?: (label: string) => object, value_path: string, id_path?: string, revoke_path?: string },
 *   revoke?: { method: string, path: (id: string, hash: string) => string },
 *   probe?: string,
 * }} ProviderApiRecipe
 */

/** Read a dotted path out of a response body. */
function pick(obj, dotted) {
  return String(dotted || '').split('.').reduce((acc, part) => (acc == null ? acc : acc[part]), obj);
}

/**
 * Rotate a key by calling the provider's own key-management API.
 *
 * Order matters and mirrors the supervised browser flow on purpose: mint the new credential, store
 * it, and only then revoke the old one. If revoking happened first and storing failed, the account
 * would be left with a live key nobody holds; this way a failure leaves an extra key rather than
 * none.
 *
 * @param {object} deps
 * @param {string} deps.brainDir
 * @param {string} deps.key              stored secret being rotated
 * @param {string} deps.managementKeyName stored secret holding management rights
 * @param {ProviderApiRecipe} deps.recipe
 * @param {string} deps.baseUrl
 * @param {(brain:string, name:string) => Promise<string|null>} deps.readSecret
 * @param {(brain:string, key:string, value:string, opts:object) => Promise<object>} deps.storeSecret
 * @param {(brain:string, name:string) => Promise<object|null>} deps.secretMeta
 * @param {typeof fetch} [deps.fetchImpl]
 */
export async function rotateViaProviderApi({
  brainDir, key, managementKeyName, recipe, baseUrl,
  readSecret, storeSecret, secretMeta, recordKeyId, fetchImpl = fetch,
}) {
  const management = await readSecret(brainDir, managementKeyName);
  if (!management) {
    return {
      ok: false,
      error: `No management credential in the store: ${managementKeyName}. `
        + 'This provider rotates itself over its API, so it needs a key with management rights '
        + 'stored under that name; without one there is nothing to authenticate the request.',
      needs: managementKeyName,
    };
  }

  const auth = { Authorization: `Bearer ${management}` };
  const label = `${key.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${new Date().toISOString().slice(0, 10)}`;

  let created;
  try {
    const res = await fetchImpl(`${baseUrl}${recipe.create.path}`, {
      method: recipe.create.method || 'POST',
      headers: { ...auth, 'Content-Type': 'application/json' },
      body: JSON.stringify(recipe.create.body ? recipe.create.body(label) : { name: label }),
    });
    const body = await res.json().catch(() => null);
    if (!res.ok) {
      return {
        ok: false,
        error: `Provider refused to mint a key (HTTP ${res.status}). `
          + 'A credential without management rights gets 401 or 403 here, which is the usual cause.',
        status: res.status,
      };
    }
    const value = pick(body, recipe.create.value_path);
    if (!value) return { ok: false, error: `Provider response carried no new key at ${recipe.create.value_path}` };
    const id = recipe.create.id_path ? pick(body, recipe.create.id_path) : null;
    created = { value, id, label };
  } catch (error) {
    return { ok: false, error: `Could not reach the provider API: ${error.message}` };
  }

  // Store first, revoke second.
  let exports;
  try {
    const result = await storeSecret(brainDir, key, created.value, { actor: 'provider-api-rotation' });
    exports = result && result.exports;
    // Keep the provider's id for the key we just minted, so the next rotation can revoke it.
    if (created.id && recordKeyId) await recordKeyId(brainDir, key, created.id);
  } catch (error) {
    return {
      ok: false,
      error: `Minted a key but could not store it (${error.message}); the old key is untouched `
        + 'and the new one should be revoked by hand.',
      minted: created.label,
    };
  }

  const revoked = await revokeOld({ auth, recipe, created, secretMeta, brainDir, key, fetchImpl, baseUrl });

  return {
    ok: true,
    key,
    class: 'provider_api',
    method: 'provider_api',
    label: created.label,
    revoked,
    exports,
  };
}

/** Best-effort revoke of the previous credential; never fails the rotation. */
async function revokeOld({ auth, recipe, created, secretMeta, brainDir, key, fetchImpl, baseUrl }) {
  if (!recipe.revoke) return { attempted: false, reason: 'provider declares no revoke endpoint' };
  const prior = await secretMeta(brainDir, key);
  const priorId = prior?.provider_key_id || prior?.key_id || null;
  if (!priorId) {
    return {
      attempted: false,
      reason: 'the store does not record the previous key id, so the old key cannot be addressed; '
        + 'revoke it in the provider console',
    };
  }
  try {
    const res = await fetchImpl(`${baseUrl}${recipe.revoke.path(priorId, created.id)}`, {
      method: recipe.revoke.method || 'DELETE',
      headers: auth,
    });
    return res.ok ? { attempted: true, revoked: true } : { attempted: true, revoked: false, status: res.status };
  } catch (error) {
    return { attempted: true, revoked: false, error: error.message };
  }
}
