/** Required auth operations; credential implementation belongs to the auth plugin. */
import { loadPluginModule } from '../core/plugin-runtime.mjs';
import { brainDir, nodeEnv } from '../core/config.mjs';
import { authGuard as watchdog } from '../core/auth-guard.mjs';
import { findValidKeyByToken, keyHasAnyScope, recordKeyUsage, recordKeyOutcome } from './keys.mjs';
import { logger } from '../core/logger.mjs';
const owner = await loadPluginModule('auth', 'server-auth');
export const BCRYPT_COST = owner.BCRYPT_COST;
export const { loadSecurityConfig, apiRateLimiter, authRateLimiter, sandboxRateLimiter, ingestRateLimiter, isLoopbackIp, isMeshIp, isLocalRequest, requireHttps, requireAuthOrLocal, corsOptions, requireAuth, requireScope, requireSandboxEnabled, sessionCookieOptions, loginHandler, changePasswordHandler, mintStepUpToken, verifyStepUpToken, verifyDashboardPassword, logoutHandler, signSessionToken, dashboardAuthState } = owner.createServerAuth({ brainDir, authBrainDir: process.env.TR_SECRETS_BRAIN || brainDir, nodeEnv, watchdog, findValidKeyByToken, keyHasAnyScope, recordKeyUsage, recordKeyOutcome, logger });
