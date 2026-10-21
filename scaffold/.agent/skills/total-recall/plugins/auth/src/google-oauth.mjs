import crypto from 'node:crypto';
import path from 'node:path';
import { loadSecretsSync, saveSecretsSync } from './secrets-gateway.mjs';
import { authState, appendAuthMetadata, assertNoSecretValues } from './metadata-state.mjs';

const STORE_KEY = 'google_oauth_accounts';
const digest = value => crypto.createHash('sha256').update(value).digest('hex');
const subject = value => {
  if (typeof value !== 'string' || !/^[A-Za-z0-9_-]{1,255}$/.test(value)) throw new Error('Invalid Google account identifier');
  return value;
};

/** Tokens remain opaque encrypted auth resources. SSSS stores lifecycle metadata only. */
export function createGoogleOAuth({ brainDir, load = loadSecretsSync, save = saveSecretsSync,
  fetchImpl = fetch, now = Date.now, metadata, record } = {}) {
  if (!brainDir) throw new Error('An explicit auth store is required');
  const state = metadata || authState(path.join(brainDir, 'config/google-oauth-metadata.json'));
  const audit = record || (row => appendAuthMetadata(path.join(brainDir, 'logs/google-oauth.jsonl'), row));
  const pending = new Map();
  const refreshes = new Map();
  const config = () => {
    const values = load(brainDir);
    if (!values.GOOGLE_CLIENT_ID || !values.GOOGLE_CLIENT_SECRET) throw new Error('Google OAuth is not configured');
    const redirect = new URL(values.GOOGLE_REDIRECT_URI || '');
    if ((redirect.protocol !== 'https:' && !(redirect.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(redirect.hostname))) || redirect.username || redirect.password || redirect.search || redirect.hash || redirect.pathname !== '/auth/google/callback') throw new Error('Configure a trusted GOOGLE_REDIRECT_URI ending in /auth/google/callback');
    const scope = values.GOOGLE_SCOPES || 'openid email profile';
    return { clientId: values.GOOGLE_CLIENT_ID, clientSecret: values.GOOGLE_CLIENT_SECRET, redirectUri: redirect.href, scope };
  };
  const status = () => {
    const rows = state.read({}); assertNoSecretValues(rows);
    return Object.values(rows);
  };
  const commit = (id, credentials, phase) => {
    // Read both snapshots immediately before synchronous commits; never retain a stale whole store across HTTP awaits.
    const values = load(brainDir);
    const previous = values[STORE_KEY]?.[id] || {};
    const accounts = { ...(values[STORE_KEY] || {}) };
    const rows = state.read({});
    const timestamp = new Date(now()).toISOString();
    if (credentials === null) delete accounts[id];
    else accounts[id] = { ...previous, ...credentials };
    const account = accounts[id];
    rows[id] = { account_id: id, email: account?.email || rows[id]?.email || '',
      status: phase, expiry: account?.expires_at || null,
      scopes: account?.scope?.split(/\s+/).filter(Boolean) || [],
      can_refresh: Boolean(account?.refresh_token), updated_at: timestamp };
    assertNoSecretValues(rows);
    // Audit intent before external credential commit; completed metadata is never reported before encryption succeeds.
    audit({ action: 'google_oauth_intent', account_id: id, status: phase, timestamp });
    save(brainDir, { ...values, [STORE_KEY]: accounts });
    state.write(rows);
    audit({ action: 'google_oauth_committed', account_id: id, status: phase, timestamp });
    return rows[id];
  };
  const requestTokens = async parameters => {
    const cfg = config();
    const response = await fetchImpl('https://oauth2.googleapis.com/token', {
      method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ client_id: cfg.clientId, client_secret: cfg.clientSecret, ...parameters }),
      signal: AbortSignal.timeout(15000), redirect: 'error',
    });
    const data = await response.json();
    if (!response.ok) {
      const error = new Error(data.error === 'invalid_grant' ? 'Google authorization expired or revoked; reconnect required' : 'Google token exchange failed');
      error.reconnect = data.error === 'invalid_grant'; throw error;
    }
    if (typeof data.access_token !== 'string' || !data.access_token || data.token_type?.toLowerCase() !== 'bearer' || !Number.isFinite(Number(data.expires_in)) || Number(data.expires_in) <= 0) throw new Error('Invalid Google token response');
    return { access_token: data.access_token, ...(typeof data.refresh_token === 'string' && data.refresh_token ? { refresh_token: data.refresh_token } : {}),
      ...(typeof data.scope === 'string' ? { scope: data.scope } : {}), expires_at: new Date(now() + Number(data.expires_in) * 1000).toISOString() };
  };
  return {
    config, status,
    begin(options = {}) {
      const cfg = config();
      for (const [key, value] of pending) if (value.expires <= now()) pending.delete(key);
      if (pending.size >= 1000) throw new Error('Too many pending authorizations');
      const stateValue = crypto.randomBytes(32).toString('base64url');
      const browser = crypto.randomBytes(32).toString('base64url');
      const verifier = crypto.randomBytes(48).toString('base64url');
      const scope = options.scope || cfg.scope;
      pending.set(stateValue, { browser: digest(browser), verifier, expires: now() + 600000, redirectUri: cfg.redirectUri });
      const url = new URL('https://accounts.google.com/o/oauth2/v2/auth');
      for (const [key, value] of Object.entries({ client_id: cfg.clientId, redirect_uri: cfg.redirectUri, response_type: 'code', scope,
        state: stateValue, access_type: 'offline', prompt: 'consent select_account', code_challenge: crypto.createHash('sha256').update(verifier).digest('base64url'), code_challenge_method: 'S256' })) url.searchParams.set(key, value);
      return { url: url.href, redirectUri: cfg.redirectUri, browser };
    },
    async complete({ code, state: stateValue, browser }) {
      const attempt = typeof stateValue === 'string' ? pending.get(stateValue) : null;
      if (!attempt || attempt.expires <= now() || typeof browser !== 'string' || !crypto.timingSafeEqual(Buffer.from(attempt.browser), Buffer.from(digest(browser)))) throw new Error('Invalid or expired OAuth browser state');
      pending.delete(stateValue);
      if (typeof code !== 'string' || !code || code.length > 8192 || config().redirectUri !== attempt.redirectUri) throw new Error('Invalid OAuth callback');
      const tokens = await requestTokens({ code, redirect_uri: attempt.redirectUri, grant_type: 'authorization_code', code_verifier: attempt.verifier });
      const response = await fetchImpl('https://www.googleapis.com/oauth2/v3/userinfo', { headers: { Authorization: `Bearer ${tokens.access_token}` }, signal: AbortSignal.timeout(15000), redirect: 'error' });
      if (!response.ok) throw new Error('Google identity verification failed');
      const user = await response.json();
      const id = subject(user.sub);
      if (user.email_verified !== true || typeof user.email !== 'string' || !user.email.includes('@')) throw new Error('Google identity is not verified');
      const allowed = load(brainDir).GOOGLE_ALLOWED_EMAILS;
      const emails = Array.isArray(allowed) ? allowed : typeof allowed === 'string' ? allowed.split(',') : [];
      if (emails.length > 0 && !emails.some(email => typeof email === 'string' && email.trim().toLowerCase() === user.email.toLowerCase())) throw new Error('Google account is not authorized for this dashboard');
      commit(id, { ...tokens, email: user.email, name: typeof user.name === 'string' ? user.name : '' }, 'connected');
      return { sub: id, email: user.email, name: typeof user.name === 'string' ? user.name : '' };
    },
    async access(id) {
      id = subject(id);
      const account = load(brainDir)[STORE_KEY]?.[id];
      if (!account) throw new Error('Google account is not connected');
      if (account.access_token && Date.parse(account.expires_at) > now() + 60000) return account.access_token;
      if (!account.refresh_token) { commit(id, null, 'reconnect_required'); throw new Error('Google account must be reconnected'); }
      if (!refreshes.has(id)) {
        const operation = (async () => {
          try {
            const tokens = await requestTokens({ refresh_token: account.refresh_token, grant_type: 'refresh_token' });
            const current = load(brainDir)[STORE_KEY]?.[id];
            if (!current || current.refresh_token !== account.refresh_token) throw new Error('Google connection changed while refreshing');
            commit(id, tokens, 'connected'); return tokens.access_token;
          } catch (error) {
            if (error.reconnect) {
              const current = load(brainDir)[STORE_KEY]?.[id];
              if (current?.refresh_token === account.refresh_token) commit(id, null, 'reconnect_required');
            }
            throw error;
          }
        })().finally(() => refreshes.delete(id));
        refreshes.set(id, operation);
      }
      return refreshes.get(id);
    },
    async disconnect(id) {
      id = subject(id);
      const account = load(brainDir)[STORE_KEY]?.[id];
      if (!account) return { account_id: id, disconnected: true };
      const response = await fetchImpl('https://oauth2.googleapis.com/revoke', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ token: account.refresh_token || account.access_token }), signal: AbortSignal.timeout(15000), redirect: 'error' });
      if (!response.ok) throw new Error('Google revocation failed; connection retained');
      const current = load(brainDir)[STORE_KEY]?.[id];
      if (current?.refresh_token !== account.refresh_token || current?.access_token !== account.access_token) throw new Error('Google connection changed during revocation');
      commit(id, null, 'disconnected'); return { account_id: id, disconnected: true };
    },
  };
}
