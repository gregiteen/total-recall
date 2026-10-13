import express from 'express';
import crypto from 'node:crypto';
import { listPasskeys, beginAuthentication, finishAuthentication } from '../webauthn-store.mjs';
import { getSecret } from '../secrets-store.mjs';
export function createAuthRouter({ auth, logger, BRAIN_DIR }) {
const { requireAuth, requireScope, authRateLimiter, isLocalRequest, loadSecurityConfig,
  loginHandler, logoutHandler, changePasswordHandler, signSessionToken,
  dashboardAuthState, sessionCookieOptions } = auth;
function brainDir() {
  return process.env.TR_SECRETS_BRAIN || BRAIN_DIR;
}

/** In-memory store for Google OAuth2 state validation (10 min TTL) */
const oauthStates = new Map();

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

/**
 * Initiate Google OAuth2 authorization flow.
 */
authRouter.get('/auth/google', async (req, res) => {
  try {
    const { clientId, clientSecret } = await getGoogleCredentials();
    if (!clientId || !clientSecret) {
      return res.status(400).json({
        error: 'Google OAuth2 is not configured. Provide GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET secrets.',
      });
    }

    const state = crypto.randomBytes(24).toString('hex');
    oauthStates.set(state, Date.now() + 10 * 60 * 1000);

    const proto = req.get('x-forwarded-proto') || req.protocol || 'http';
    const host = req.get('x-forwarded-host') || req.get('host') || 'localhost:3000';
    const redirectUri = `${proto}://${host}/auth/google/callback`;

    const authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');
    authUrl.searchParams.set('client_id', clientId);
    authUrl.searchParams.set('redirect_uri', redirectUri);
    authUrl.searchParams.set('response_type', 'code');
    authUrl.searchParams.set('scope', 'openid email profile');
    authUrl.searchParams.set('state', state);
    authUrl.searchParams.set('access_type', 'offline');
    authUrl.searchParams.set('prompt', 'select_account');

    if (req.query.format === 'json' || req.headers.accept?.includes('application/json')) {
      return res.json({ url: authUrl.toString(), redirectUri });
    }
    res.redirect(authUrl.toString());
  } catch (err) {
    logger.warn('auth', `Google authorization redirect failed: ${err.message}`);
    res.status(500).json({ error: 'Failed to initiate Google authentication' });
  }
});

/**
 * Google OAuth2 callback endpoint: exchange code, resolve profile, and mint session.
 */
authRouter.get('/auth/google/callback', async (req, res) => {
  try {
    const { code, state, error } = req.query;
    if (error) {
      return res.status(400).json({ error: `Google authorization rejected: ${error}` });
    }
    if (!state || !oauthStates.has(state)) {
      return res.status(400).json({ error: 'Invalid or expired state parameter' });
    }
    const stateExpiry = oauthStates.get(state);
    oauthStates.delete(state);
    if (Date.now() > stateExpiry) {
      return res.status(400).json({ error: 'OAuth state has expired' });
    }

    const { clientId, clientSecret } = await getGoogleCredentials();
    if (!clientId || !clientSecret) {
      return res.status(500).json({ error: 'Google OAuth2 credentials missing' });
    }

    const proto = req.get('x-forwarded-proto') || req.protocol || 'http';
    const host = req.get('x-forwarded-host') || req.get('host') || 'localhost:3000';
    const redirectUri = `${proto}://${host}/auth/google/callback`;

    const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code: String(code),
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        grant_type: 'authorization_code',
      }),
    });

    if (!tokenResponse.ok) {
      const errBody = await tokenResponse.text();
      logger.warn('auth', `Google token exchange failed: ${errBody}`);
      return res.status(401).json({ error: 'Failed to exchange authorization code with Google' });
    }

    const tokenData = await tokenResponse.json();
    let userInfo = { email: 'google-user@domain.internal', name: 'Google User' };
    if (tokenData.access_token) {
      try {
        const userRes = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
          headers: { Authorization: `Bearer ${tokenData.access_token}` },
        });
        if (userRes.ok) {
          userInfo = await userRes.json();
        }
      } catch (err) {
        logger.warn('auth', `Unable to query Google user profile: ${err.message}`);
      }
    }

    const config = loadSecurityConfig();
    const ttlHours = config.dashboard?.session_ttl_hours || 24;
    const sessionToken = signSessionToken(
      {
        user: userInfo.email || 'google-user',
        auth_type: 'google_oauth2',
        name: userInfo.name,
        email: userInfo.email,
      },
      { ttlSeconds: ttlHours * 3600 },
    );

    res.cookie('session', sessionToken, sessionCookieOptions(req, ttlHours * 60 * 60 * 1000));
    logger.info('auth', 'Google OAuth2 login successful', { email: userInfo.email });

    if (req.query.format === 'json' || req.headers.accept?.includes('application/json')) {
      return res.json({ success: true, user: userInfo.email, method: 'google_oauth2' });
    }
    res.redirect('/');
  } catch (err) {
    logger.warn('auth', `Google OAuth2 callback error: ${err.message}`);
    res.status(500).json({ error: err.message || 'Google OAuth2 authentication error' });
  }
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
