import express from 'express';
import {
  requireAuth,
  loadSecurityConfig,
  loginHandler,
  logoutHandler,
  changePasswordHandler,
} from '../auth.mjs';

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

authRouter.post("/auth/setup", async (req, res) => {
  const config = loadSecurityConfig();
  const alreadyConfigured = !!config.dashboard?.password_hash;
  if (alreadyConfigured) {
    return res.status(400).json({ error: "Dashboard password is already configured" });
  }
  return changePasswordHandler(req, res);
});
