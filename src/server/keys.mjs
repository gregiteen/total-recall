/** Required auth plugin adapter; credential lifecycle stays with auth. */
import { brainDir } from '../core/config.mjs';
import { loadPluginModule } from '../core/plugin-runtime.mjs';
const { createKeyStore } = await loadPluginModule('auth', 'access-keys');
export const { ALL_SCOPES, KNOWN_SCOPES, normalizeScopes, isExpiredKey, keyHasScope, keyHasAnyScope, loadKeys, issueKey, revokeKey, recordKeyUsage, isValidToken, findValidKeyByToken } = createKeyStore({ brainDir });
