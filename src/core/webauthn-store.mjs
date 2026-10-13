/** Required auth plugin adapter for passkey operations. */
import { loadPluginModule } from './plugin-runtime.mjs';
export const { resolveWebAuthnPath, listPasskeys, hasPasskeys, resolveRpFromRequest, beginRegistration, finishRegistration, beginAuthentication, finishAuthentication, deletePasskey, _clearChallengesForTests } = await loadPluginModule('auth', 'webauthn-store');
