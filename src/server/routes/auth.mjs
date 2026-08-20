import express from 'express';
import {
  requireAuth,
  isLocalRequest,
  loadSecurityConfig,
  loginHandler,
  logoutHandler,
  changePasswordHandler,
} from '../auth.mjs';
import { logger } from '../../core/logger.mjs';

export const authRouter = express.Router();

// ─── Consolidated Auth Routes ──────────────────────────────────────────────────

authRouter.post('/auth/login', loginHandler);
authRouter.post('/auth/logout', logoutHandler);
authRouter.post('/auth/change-password', requireAuth, changePasswordHandler);
authRouter.get('/auth/me', requireAuth, (req, res) => res.json({ authenticated: true }));

authRouter.get("/auth/status", (req, res) => {
  const config = loadSecurityConfig();
  const configured = !!config.dashboard?.password_hash;
  res.json({ configured });
});

/**
 * First-run: claim an unconfigured brain by setting its dashboard password.
 *
 * Unauthenticated by necessity -- there is no credential to present yet. That
 * makes "who may call this" the only control, and it must be the machine the
 * brain runs on.
 *
 * This was safe by accident for as long as a brain with no security.yml bound
 * loopback only. Once such a brain binds its mesh address, every device on the
 * tailnet can reach this route, and the first one to call it owns the brain --
 * including a phone that later gets lost, or any node someone else was invited
 * onto. A first-run window is exactly when there is nothing else to stop them.
 *
 * Headless hosts set the password over the CLI, which is already the documented
 * path for a machine with no browser on it.
 */
authRouter.post("/auth/setup", async (req, res) => {
  const config = loadSecurityConfig();
  const alreadyConfigured = !!config.dashboard?.password_hash;
  if (alreadyConfigured) {
    return res.status(400).json({ error: "Dashboard password is already configured" });
  }
  if (!isLocalRequest(req)) {
    logger.warn(
      'auth',
      `Refused remote first-run setup from ${req.ip || req.socket?.remoteAddress || 'unknown'} `
      + '— an unconfigured brain may only be claimed from the machine it runs on.',
    );
    return res.status(403).json({
      error:
        'First-run setup must come from the machine running this brain. '
        + 'On a headless host, set the password with the CLI instead: '
        + 'npx total-recall reset-password',
    });
  }
  return changePasswordHandler(req, res);
});
