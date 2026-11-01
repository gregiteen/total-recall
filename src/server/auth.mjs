/** Required auth operations; credential implementation belongs to the auth plugin. */
import { loadPluginModule } from '../core/plugin-runtime.mjs';
import { brainDir, nodeEnv } from '../core/config.mjs';
import { authGuard as watchdog } from '../core/auth-guard.mjs';
import { findValidKeyByToken, keyHasAnyScope, recordKeyUsage, recordKeyOutcome } from './keys.mjs';
import { logger } from '../core/logger.mjs';
const owner = await loadPluginModule('auth', 'server-auth');
export const BCRYPT_COST = owner.BCRYPT_COST;
const base = owner.createServerAuth({ brainDir, authBrainDir: process.env.TR_SECRETS_BRAIN || brainDir, nodeEnv, watchdog, findValidKeyByToken, keyHasAnyScope, recordKeyUsage, recordKeyOutcome, logger });
export const { loadSecurityConfig, apiRateLimiter, authRateLimiter, sandboxRateLimiter, ingestRateLimiter, isLoopbackIp, isMeshIp, isLocalRequest, requireHttps, requireAuthOrLocal, corsOptions, requireScope, requireSandboxEnabled, sessionCookieOptions, loginHandler, changePasswordHandler, mintStepUpToken, verifyStepUpToken, verifyDashboardPassword, logoutHandler, signSessionToken, dashboardAuthState } = base;

const hostName = (value) => String(value || '').replace(/^https?:\/\//, '').replace(/[/?#].*$/, '').replace(/:\d+$/, '').replace(/^\[(.*)\]$/, '$1');

/**
 * Dashboard login is optional for a local install. It is required when
 * `dashboard.require_login` is true, or, when unset, once a dashboard password
 * exists. When not required, only a genuinely local browser or CLI is let in:
 * loopback socket, loopback Host header and no foreign Origin (which blocks DNS
 * rebinding and cross-site requests). Bearer tokens and every other client
 * (mesh, tunnel, remote) still authenticate normally.
 */
export function loginRequired() {
  const configured = loadSecurityConfig().dashboard?.require_login;
  return typeof configured === 'boolean' ? configured : dashboardAuthState().configured;
}

function isOpenLocalRequest(req) {
  if (req.headers.authorization) return false;
  if (!isLocalRequest(req)) return false;
  if (!isLoopbackIp(hostName(req.headers.host))) return false;
  const origin = req.headers.origin;
  return !origin || isLoopbackIp(hostName(origin));
}

export function requireAuth(req, res, next) {
  if (!loginRequired() && isOpenLocalRequest(req)) {
    req.auth = { type: 'dashboard_session', local: true };
    return next();
  }
  return base.requireAuth(req, res, next);
}
