/** Required auth plugin adapter; credential lifecycle stays with auth. */
import { brainDir } from '../core/config.mjs';
import { loadPluginModule } from '../core/plugin-runtime.mjs';
const { createKeyStore } = await loadPluginModule('auth', 'access-keys');

/**
 * The default store is the one under `AGENT_DIR`. That is the store a server
 * process reads, because `core/config.mjs` derives `brainDir` from
 * `AGENT_DIR` alone. Anything that mints a token a *server* must accept has to
 * use this store — see `keyStoreFor`.
 */
export const { ALL_SCOPES, KNOWN_SCOPES, normalizeScopes, isExpiredKey, keyHasScope, keyHasAnyScope, loadKeys, issueKey, revokeKey, recordKeyUsage, isValidToken, findValidKeyByToken, loadRoles, setRole, listKeyUsage, recordKeyOutcome } = createKeyStore({ brainDir });

/**
 * A key store bound to an explicit brain directory.
 *
 * `init` writes a bootstrap PAT into a brain's `config/brain.json`, and the
 * server that answers that brain's URL validates it against whatever store its
 * own `AGENT_DIR` produced. When the two differ, `init` used to mint the token
 * into a store no running server reads: it printed "pre-authorized", and every
 * request with that token then answered 401. Callers that need a token the
 * server will accept resolve the serving brain first and pass it here.
 *
 * @param {string} targetBrainDir absolute brain directory (…/skills/total-recall)
 */
export function keyStoreFor(targetBrainDir) {
  if (typeof targetBrainDir !== 'string' || !targetBrainDir) {
    throw new Error('Explicit auth key store brain directory required');
  }
  return createKeyStore({ brainDir: targetBrainDir });
}
