import express from 'express';
import { createGoogleOAuth } from '../google-oauth.mjs';
import { listPasskeys, beginAuthentication, finishAuthentication } from '../webauthn-store.mjs';
import { getSecret } from '../secrets-store.mjs';
export function createAuthRouter({ auth, logger, BRAIN_DIR, googleOAuth }) {
const { requireAuth, requireScope, authRateLimiter, isLocalRequest, loadSecurityConfig,
  loginHandler, logoutHandler, changePasswordHandler, signSessionToken,
  dashboardAuthState, sessionCookieOptions } = auth;
function brainDir() {
  return process.env.TR_SECRETS_BRAIN || BRAIN_DIR;
}

const google = googleOAuth || createGoogleOAuth({ brainDir: brainDir() });
const browserCookie = 'tr_google_oauth';
const browserCookieOptions = req => ({ httpOnly: true, secure: req.secure === true, sameSite: 'lax', path: '/auth/google', maxAge: 600000 });

async function getGoogleCredentials() {
  const idResult = await getSecret(brainDir(), 'GOOGLE_CLIENT_ID');
  const secretResult = await getSecret(brainDir(), 'GOOGLE_CLIENT_SECRET');
  return { clientId: idResult.found ? idResult.value : null, clientSecret: secretResult.found ? secretResult.value : null };
}



const authRouter = express.Router();
authRouter.use('/auth', authRateLimiter());

// ─── Consolidated Auth Routes ──────────────────────────────────────────────────

authRouter.post('/auth/login', loginHandler);
authRouter.post('/auth/logout', logoutHandler);
authRouter.post('/auth/change-password', requireAuth, requireScope('config:write'), changePasswordHandler);
authRouter.get('/auth/me', requireAuth, (req, res) => res.json({ authenticated: true }));

authRouter.get("/auth/status", (req, res) => {
  const config = loadSecurityConfig();
  const configured = dashboardAuthState().configured;
  res.json({ configured });
});

/**
 * Discovery endpoint for all active authentication providers.
 */
authRouter.get('/auth/providers', async (req, res) => {
  try {
    const config = loadSecurityConfig();
    const passkeys = listPasskeys(brainDir());
    const { clientId } = await getGoogleCredentials();
    res.json({
      password: { configured: dashboardAuthState().configured },
      passkey: {
        enabled: true,
        has_passkeys: passkeys.length > 0,
        count: passkeys.length,
      },
      google: {
        configured: Boolean(clientId),
        client_id: clientId ? `${clientId.slice(0, 12)}…` : null,
      },
    });
  } catch (err) {
    logger.warn('auth', `Failed to query auth providers: ${err.message}`);
    res.status(500).json({ error: 'Failed to inspect authentication providers' });
  }
});

/**
 * Generate WebAuthn authentication options for Passkey login.
 */
authRouter.post('/auth/passkey/options', async (req, res) => {
  try {
    const options = await beginAuthentication(brainDir(), req);
    res.json(options);
  } catch (err) {
    logger.warn('auth', `Passkey login options generation failed: ${err.message}`);
    res.status(400).json({ error: err.message });
  }
});

/**
 * Verify WebAuthn response and issue dashboard session cookie upon success.
 */
authRouter.post('/auth/passkey/verify', async (req, res) => {
  try {
    const body = req.body || {};
    const response = body.response || body;
    if (!response?.id) {
      return res.status(400).json({ error: 'WebAuthn assertion response required' });
    }
    const result = await finishAuthentication(brainDir(), req, response);
    if (!result?.verified) {
      return res.status(401).json({ error: 'Passkey verification failed' });
    }

    const config = loadSecurityConfig();
    const ttlHours = config.dashboard?.session_ttl_hours || 24;
    const token = signSessionToken(
      { user: 'admin', auth_type: 'passkey', credential_id: result.credentialId },
      { ttlSeconds: ttlHours * 3600 },
    );

    res.cookie('session', token, sessionCookieOptions(req, ttlHours * 60 * 60 * 1000));
    logger.info('auth', 'Passkey login successful', { credentialId: result.credentialId });
    res.json({ success: true, user: 'admin', method: 'passkey' });
  } catch (err) {
    logger.warn('auth', `Passkey assertion verification failed: ${err.message}`);
    res.status(401).json({ error: err.message || 'Passkey verification failed' });
  }
});

/** Browser initiation owns state/cookie custody; CLI opens this endpoint. */
authRouter.get('/auth/google', (req, res) => {
  try {
    const attempt = google.begin();
    res.set('Cache-Control', 'no-store');
    res.cookie(browserCookie, attempt.browser, browserCookieOptions(req));
    if (req.query.format === 'json' || req.headers.accept?.includes('application/json')) return res.json({ url: attempt.url, redirectUri: attempt.redirectUri });
    return res.redirect(attempt.url);
  } catch {
    return res.status(400).json({ error: 'Configure Google credentials and a trusted callback URI through auth' });
  }
});

authRouter.get('/auth/google/callback', async (req, res) => {
  res.set('Cache-Control', 'no-store');
  const { maxAge, ...clearOptions } = browserCookieOptions(req);
  res.clearCookie(browserCookie, clearOptions);
  try {
    if (req.query.error) return res.status(400).json({ error: 'Google authorization was declined' });
    const user = await google.complete({ code: req.query.code, state: req.query.state, browser: req.cookies?.[browserCookie] });
    const config = loadSecurityConfig();
    const ttlHours = config.dashboard?.session_ttl_hours || 24;
    const token = signSessionToken({ user: user.email, google_sub: user.sub, auth_type: 'google_oauth2', name: user.name, email: user.email }, { ttlSeconds: ttlHours * 3600 });
    res.cookie('session', token, sessionCookieOptions(req, ttlHours * 60 * 60 * 1000));
    if (req.query.format === 'json' || req.headers.accept?.includes('application/json')) return res.json({ success: true, user: user.email, method: 'google_oauth2' });
    return res.redirect('/');
  } catch {
    logger.warn('auth', 'Google OAuth callback verification failed');
    return res.status(401).json({ error: 'Google authentication failed; restart sign-in' });
  }
});

authRouter.get('/auth/google/accounts', requireAuth, requireScope('config:read'), (_req, res) => {
  try { return res.json({ accounts: google.status() }); }
  catch { return res.status(500).json({ error: 'Unable to read connection metadata' }); }
});
authRouter.post('/auth/google/accounts/:id/refresh', requireAuth, requireScope('config:write'), async (req, res) => {
  try { await google.access(req.params.id); return res.json({ accounts: google.status() }); }
  catch { return res.status(409).json({ error: 'Unable to refresh connection; inspect status or reconnect' }); }
});
authRouter.post('/auth/google/accounts/:id/disconnect', requireAuth, requireScope('config:write'), async (req, res) => {
  try { return res.json(await google.disconnect(req.params.id)); }
  catch { return res.status(409).json({ error: 'Unable to revoke connection; no disconnect confirmed' }); }
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
  const alreadyConfigured = dashboardAuthState().configured;
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
  // A malicious web page can POST to loopback or use DNS rebinding. The
  // browser's Origin must identify loopback or an explicit operator allowlist.
  const origin = req.headers.origin;
  if (origin || req.headers['sec-fetch-site'] === 'cross-site') {
    let allowed = false;
    try {
      const url = new URL(origin);
      allowed = ['http:', 'https:'].includes(url.protocol) &&
        (['localhost', '127.0.0.1', '[::1]'].includes(url.hostname) || (config.network?.allowed_origins || []).includes(origin));
    } catch { /* absent, opaque or malformed browser origin */ }
    if (!allowed) return res.status(403).json({ error: 'First-run setup requires a trusted browser origin' });
  }
  return changePasswordHandler(req, res);
});

return authRouter;
}
