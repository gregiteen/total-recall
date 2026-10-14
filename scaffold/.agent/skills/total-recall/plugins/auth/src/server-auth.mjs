import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import yaml from 'yaml';
import rateLimit from 'express-rate-limit';
import { createSessionCredentials, BCRYPT_COST } from './session-credentials.mjs';

export { BCRYPT_COST };
export function createServerAuth({ brainDir, authBrainDir = brainDir, nodeEnv, watchdog, findValidKeyByToken, keyHasAnyScope, recordKeyUsage, recordKeyOutcome, logger }) {
const CONFIG_FILE = path.join(brainDir, 'config', 'security.yml');
const credentials = createSessionCredentials({ brainDir: authBrainDir });
const signSessionToken = (payload, options) => credentials.signToken('dashboard', payload, options);
const dashboardAuthState = () => credentials.dashboardState();
function loadSecurityConfig() {
  if (!fs.existsSync(CONFIG_FILE)) {
    return {
      dashboard: {},
      api: { pats: [], allow_static_pats: false },
      network: { require_https: true, public_health: false, allowed_origins: [], trusted_proxies: [] },
      // No `host` here, deliberately. This default used to say '127.0.0.1',
      // which `resolveServerHost()` cannot tell apart from a user who typed
      // that address on purpose — configuredHost wins over meshIp, so a mesh
      // address was discovered and then thrown away. Every install without a
      // config file bound loopback only, permanently and silently: the brain
      // answered fine on its own console and was invisible to every other
      // device, while the pairing card went on recommending the mesh URL.
      // Leaving it unset lets the precedence do its job — explicit config,
      // else mesh, else loopback. Public binds are still gated by
      // allow_public_bind below.
      bind: { port: 3000, allow_public_bind: false },
      rate_limits: { api_requests_per_minute: 1200 },
      sandbox: { enabled: false }
    };
  }
  const parsed = yaml.parse(fs.readFileSync(CONFIG_FILE, 'utf8')) || {};
  if (parsed.sandbox === undefined) {
    parsed.sandbox = { enabled: false };
  }
  if (parsed.dashboard) { delete parsed.dashboard.password_hash; delete parsed.dashboard.force_password_reset; }
  if (parsed.api) { delete parsed.api.pats; delete parsed.api.allow_static_pats; }
  return parsed;
}

function apiRateLimiter() {
  const config = loadSecurityConfig();
  const limit = config.rate_limits?.api_requests_per_minute || 1200;
  return rateLimit({
    windowMs: 60 * 1000,
    max: limit,
    message: { error: 'Too many requests to the API' },
    standardHeaders: true,
    legacyHeaders: false,
    validate: false,
  });
}

/** Public password endpoints must bound expensive bcrypt work independently. */
function authRateLimiter() {
  const configured = loadSecurityConfig().rate_limits?.auth_requests_per_minute;
  const limit = Number.isInteger(configured) && configured > 0 ? Math.min(configured, 1000) : 20;
  return rateLimit({ windowMs: 60 * 1000, max: limit, standardHeaders: true, legacyHeaders: false,
    message: { error: 'Too many authentication requests' }, validate: false });
}

/**
 * Key the rate limit on the authenticated principal when possible so a
 * single misbehaving PAT can't lock out other keys. Falls back to the
 * client IP otherwise.
 */
function keyOrIp(req) {
  // findValidKeyByToken populates req.key when requireAuth has already run.
  if (req.key?.id) return `key:${req.key.id}`;
  if (req.user?.id) return `user:${req.user.id}`;
  return `ip:${req.ip || 'unknown'}`;
}

/**
 * Strict per-principal limiter for `POST /api/sandbox`.
 *
 * The sandbox endpoint executes arbitrary Node.js code; even authenticated
 * abuse is expensive. Defaults to 10/min per key/user, overridable via
 * `security.yml.rate_limits.sandbox_requests_per_minute`.
 */
function sandboxRateLimiter() {
  const config = loadSecurityConfig();
  const limit = config.rate_limits?.sandbox_requests_per_minute || 10;
  return rateLimit({
    windowMs: 60 * 1000,
    max: limit,
    message: { error: 'Too many sandbox executions' },
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: keyOrIp,
    validate: false,
  });
}

/**
 * Moderate per-principal limiter for `POST /api/sessions/ingest`.
 *
 * The relay legitimately fires many times during a busy IDE day, so the
 * default is generous. Overridable via
 * `security.yml.rate_limits.ingest_requests_per_minute`.
 */
function ingestRateLimiter() {
  const config = loadSecurityConfig();
  const limit = config.rate_limits?.ingest_requests_per_minute || 120;
  return rateLimit({
    windowMs: 60 * 1000,
    max: limit,
    message: { error: 'Too many ingest requests' },
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: keyOrIp,
    validate: false,
  });
}

function isLoopbackIp(ip) {
  if (!ip) return false;
  const normalized = String(ip)
    .trim()
    .replace(/^"|"$/g, '')
    .replace(/^\[(.*)\]$/, '$1')
    .replace(/^::ffff:/, '')
    .replace(/^(\d{1,3}(?:\.\d{1,3}){3}):\d+$/, '$1');
  return normalized === '127.0.0.1' || normalized === '::1' || normalized === 'localhost';
}

/**
 * Tailscale/Headscale mesh addresses: IPv4 CGNAT 100.64.0.0/10 and the
 * Tailscale ULA prefix fd7a:115c:a1e0::/48. Traffic on these addresses is
 * already WireGuard-encrypted, so HTTPS is redundant. Only ever check the
 * direct socket address — forwarded headers are spoofable.
 */
function isMeshIp(ip) {
  if (!ip) return false;
  const normalized = String(ip)
    .trim()
    .replace(/^\[(.*)\]$/, '$1')
    .replace(/^::ffff:/, '');
  if (normalized.toLowerCase().startsWith('fd7a:115c:a1e0:')) return true;
  const m = normalized.match(/^(\d{1,3})\.(\d{1,3})\.\d{1,3}\.\d{1,3}$/);
  if (!m) return false;
  const first = Number(m[1]);
  const second = Number(m[2]);
  return first === 100 && second >= 64 && second <= 127;
}

function forwardedClientIps(req) {
  const ips = [];
  const headerKey = ['x', 'forwarded', 'for'].join('-');
  const xForwardedFor = req.headers?.[headerKey];
  if (typeof xForwardedFor === 'string') {
    ips.push(...xForwardedFor.split(',').map((ip) => ip.trim()).filter(Boolean));
  }

  const forwarded = req.headers?.forwarded;
  if (typeof forwarded === 'string') {
    for (const part of forwarded.split(',')) {
      const match = part.match(/(?:^|;)\s*for=("[^"]+"|[^;,\s]+)/i);
      if (match) {
        let val = match[1].trim();
        if (val.startsWith('"') && val.endsWith('"')) {
          val = val.slice(1, -1).trim();
        }
        ips.push(val);
      }
    }
  }

  return ips;
}

function isLocalRequest(req) {
  const remote = req.socket?.remoteAddress;

  // Inspect forwarded headers first.
  const forwardedIps = forwardedClientIps(req);
  if (forwardedIps.length > 0) {
    // If any forwarded IP is not a loopback IP, this is NOT a local request!
    if (!forwardedIps.every((ip) => isLoopbackIp(ip))) {
      return false;
    }
  }

  // If there are no non-loopback forwarded IPs, we check if the physical connection is loopback
  if (isLoopbackIp(remote)) {
    return true;
  }

  // SECURITY: Only trust X-Forwarded-For if the direct caller (remoteAddress)
  // is explicitly configured in security.yml network.trusted_proxies allowlist.
  try {
    const config = loadSecurityConfig();
    const trusted = config.network?.trusted_proxies;
    if (Array.isArray(trusted) && remote) {
      const normalizedRemote = String(remote)
        .trim()
        .replace(/^"|"$/g, '')
        .replace(/^\[(.*)\]$/, '$1')
        .replace(/^::ffff:/, '')
        .replace(/^(\d{1,3}(?:\.\d{1,3}){3}):\d+$/, '$1');

      if (trusted.includes(normalizedRemote)) {
        const headerKey = ['x', 'forwarded', 'for'].join('-');
        const xForwardedFor = req.headers?.[headerKey];
        if (typeof xForwardedFor === 'string') {
          const clientIp = xForwardedFor.split(',')[0].trim();
          return isLoopbackIp(clientIp);
        }
      }
    }
  } catch (e) {
    // Suppress config load errors
  }

  return false;
}

function timingSafeStringEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const left = Buffer.from(a, 'utf8');
  const right = Buffer.from(b, 'utf8');
  if (left.length !== right.length) return false;
  return crypto.timingSafeEqual(left, right);
}

function requireHttps(req, res, next) {
  const config = loadSecurityConfig();
  if (nodeEnv !== 'production') return next();
  if (config.network?.require_https === false) return next();
  if (isLocalRequest(req)) return next();
  // Mesh traffic is WireGuard-encrypted end-to-end; HTTPS adds nothing.
  // Socket address only — never trust forwarded headers for this exemption.
  if (isMeshIp(req.socket?.remoteAddress) && forwardedClientIps(req).length === 0) return next();

  // Express derives secure only through its configured trusted proxy boundary.
  if (req.secure) return next();

  return res.status(426).json({
    error: 'HTTPS is required. Access this brain through its configured TLS endpoint.'
  });
}

function requireAuthOrLocal(req, res, next) {
  const config = loadSecurityConfig();
  if (config.network?.public_health === true) return next();
  if (isLocalRequest(req)) return next();
  // Mesh peers probe /health for latency + LAN discovery. Traffic is already on
  // WireGuard; treat mesh socket addresses like local for this gate only.
  // Never trust X-Forwarded-For for this exemption (same as requireHttps mesh rule).
  if (isMeshIp(req.socket?.remoteAddress) && forwardedClientIps(req).length === 0) {
    return next();
  }
  return requireAuth(req, res, next);
}

function corsOptions() {
  const config = loadSecurityConfig();
  const allowed = new Set(config.network?.allowed_origins || []);
  return {
    credentials: true,
    origin(origin, callback) {
      if (!origin) return callback(null, false);
      if (allowed.has(origin)) return callback(null, origin);
      // Automatically allow loopback/localhost origins for local tools/setup compatibility
      try {
        const parsed = new URL(origin);
        const isLocalhost = parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1' || parsed.hostname === '[::1]';
        const allowedPorts = ['3000', '3001', '5173', '5174', '8080', '8888'];
        if (isLocalhost && (!parsed.port || allowedPorts.includes(parsed.port))) {
          return callback(null, origin);
        }
      } catch (e) {}
      return callback(null, false);
    }
  };
}


// Global authentication middleware
function requireAuth(req, res, next) {
  const ip = req.ip || req.socket?.remoteAddress;
  if (ip && watchdog.isIpBlocked(ip)) {
    return res.status(403).json({ error: 'IP blocked due to too many failed auth attempts.' });
  }

  const config = loadSecurityConfig();
  
  // 1. Check Bearer PAT — validated against hashed keys.jsonl entries.
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.substring(7);
    // Check dynamic keys store first
    const key = findValidKeyByToken(token);
    if (key) {
      recordKeyUsage(token, { method: req.method, path: req.path });
      if (recordKeyOutcome && typeof res.once === 'function') res.once('finish', () => {
        try { recordKeyOutcome(key.id, { method: req.method, path: req.path, status: res.statusCode }); }
        catch { logger.error('auth', 'PAT request outcome could not be recorded', { key_id: key.id }); }
      });
      req.auth = {
        type: 'pat',
        key_id: key.id,
        key_name: key.name,
        id: key.id,
        role: key.role || null,
        expires_at: key.expires_at,
        scopes: key.scopes || []
      };
      return next();
    }
    if (ip) watchdog.recordAuthFailure(ip);
    return res.status(401).json({ error: 'Invalid PAT' });
  }

  // 2. Check Cookie Session
  const sessionToken = req.cookies?.session;
  if (sessionToken) {
    try {
      credentials.verifyToken('dashboard', sessionToken);
      req.auth = { type: 'dashboard_session', scopes: ['*'] };
      return next();
    } catch (err) {
      return res.status(401).json({ error: 'Invalid or expired session' });
    }
  }

  // If running locally, maybe we can bypass? PRD says:
  // "All endpoints require authentication (except /health on localhost)"
  // So authentication is strictly required.

  return res.status(401).json({ error: 'Authentication required. Provide Bearer token or login via dashboard.' });
}

function requireScope(...requiredScopes) {
  return (req, res, next) => {
    if (!requiredScopes.length) return next();
    if (req.auth?.type === 'dashboard_session') return next();
    if (keyHasAnyScope(req.auth || { scopes: [] }, requiredScopes)) return next();
    return res.status(403).json({
      error: 'Insufficient token scope',
      required_scopes: requiredScopes
    });
  };
}

function requireSandboxEnabled(req, res, next) {
  const config = loadSecurityConfig();
  if (!config.sandbox?.enabled) {
    logger.warn('Sandbox request rejected: sandbox is disabled in security.yml', { ip: req.ip });
    return res.status(403).json({ error: 'Sandbox is disabled in security.yml' });
  }
  logger.info('Executing sandbox payload (sandbox is explicitly enabled in security.yml)', { ip: req.ip });
  next();
}

/**
 * Cookie options for the dashboard session.
 *
 * `secure` has to describe the connection that is actually in use, not the
 * connection the config wishes for. It was previously derived from
 * `nodeEnv !== 'development' && require_https !== false`, and since nodeEnv
 * defaults to 'production' and the server only ever calls app.listen() — there
 * is no HTTPS listener anywhere in it — every login over the mesh bind issued a
 * `Secure` cookie on a plain-HTTP response. Browsers drop those, so login
 * returned 200, no session was stored, and the next request 401'd straight back
 * to the login page. http://localhost is exempt as a trustworthy origin, which
 * is why this looked fine locally and only bit when reaching the dashboard by
 * its host or mesh IP.
 *
 * Express resolves `req.secure` through `trust proxy`, so a deployment behind
 * an HTTPS-terminating reverse proxy still gets `Secure` set.
 */
function sessionCookieOptions(req, maxAge) {
  const config = loadSecurityConfig();
  const isSecureConnection = req?.secure === true;

  if (config.network?.require_https !== false && !isSecureConnection) {
    logger.warn('auth',
      'require_https is set but this request arrived over plain HTTP; issuing the session '
      + 'cookie without Secure so login works. Terminate TLS in front of the dashboard, or '
      + 'set network.require_https: false to silence this.');
  }

  return {
    httpOnly: true,
    secure: isSecureConnection,
    maxAge,
    sameSite: 'lax',
  };
}

async function loginHandler(req, res) {
  const ip = req.ip || req.socket?.remoteAddress;
  if (ip && watchdog.isIpBlocked(ip)) {
    return res.status(403).json({ error: 'IP blocked due to too many failed auth attempts.' });
  }

  const { password } = req.body || {};
  if (typeof password !== 'string' || !password || password.length > 4096) {
    return res.status(400).json({ error: 'Password is required' });
  }
  
  const config = loadSecurityConfig();
  const passwordConfigured = credentials.dashboardState().configured;
  
  if (!passwordConfigured) {
    return res.status(403).json({ error: 'Dashboard login is not configured in security.yml' });
  }

  const match = await credentials.verifyDashboardPassword(password);
  if (!match) {
    if (ip) watchdog.recordAuthFailure(ip);
    return res.status(401).json({ error: 'Invalid password' });
  }

  if (ip) watchdog.resetAuthFailures(ip);

  const ttlHours = config.dashboard?.session_ttl_hours || 24;
  const token = signSessionToken({ user: 'admin' }, { ttlSeconds: ttlHours * 3600 });

  res.cookie('session', token, sessionCookieOptions(req, ttlHours * 60 * 60 * 1000));

  
  const requiresReset = credentials.dashboardState().forcePasswordReset;
  res.json({ success: true, requiresPasswordReset: requiresReset });
}

async function changePasswordHandler(req, res) {
  const { newPassword } = req.body || {};
  if (typeof newPassword !== 'string' || newPassword.length < 8 || newPassword.length > 4096) {
    return res.status(400).json({ error: 'Password must be at least 8 characters' });
  }

  await credentials.setDashboardPassword(newPassword);

  res.json({ success: true });
}

/**
 * Short-lived step-up token for high-risk actions (secret reveal / copy).
 * Requires a fresh passkey assertion or password re-entry to mint.
 *
 * @param {{ purpose?: string, ttlSeconds?: number, actor?: string }} opts
 */
function mintStepUpToken(opts = {}) {
  const purpose = opts.purpose || 'secrets:reveal';
  const ttl = Math.min(300, Math.max(15, opts.ttlSeconds || 60));
  return credentials.signToken('step-up',
    {
      purpose,
      step_up: true,
      actor: opts.actor || 'dashboard',
    },
    { ttlSeconds: ttl },
  );
}

/**
 * @param {string} token
 * @param {string} expectedPurpose
 * @returns {{ ok: true, payload: object } | { ok: false, error: string }}
 */
function verifyStepUpToken(token, expectedPurpose = 'secrets:reveal') {
  if (!token || typeof token !== 'string') {
    return { ok: false, error: 'Step-up token required' };
  }
  try {
    const payload = credentials.verifyToken('step-up', token);
    if (!payload?.step_up || payload.purpose !== expectedPurpose) {
      return { ok: false, error: 'Invalid step-up purpose' };
    }
    return { ok: true, payload };
  } catch {
    return { ok: false, error: 'Step-up token invalid or expired — re-authenticate with passkey' };
  }
}

/**
 * Re-check dashboard password (step-up when no passkey registered).
 */
async function verifyDashboardPassword(password) {
  if (!password) return false;
  const config = loadSecurityConfig();
  const passwordConfigured = credentials.dashboardState().configured;
  if (!passwordConfigured) return false;
  return credentials.verifyDashboardPassword(password);
}

function logoutHandler(req, res) {
  // Attributes must match those the cookie was set with or the browser keeps it.
  const { maxAge, ...clearOptions } = sessionCookieOptions(req, 0);
  res.clearCookie('session', clearOptions);
  res.json({ success: true });
}

return { loadSecurityConfig, apiRateLimiter, authRateLimiter, sandboxRateLimiter, ingestRateLimiter, isLoopbackIp, isMeshIp, isLocalRequest, requireHttps, requireAuthOrLocal, corsOptions, requireAuth, requireScope, requireSandboxEnabled, sessionCookieOptions, loginHandler, changePasswordHandler, mintStepUpToken, verifyStepUpToken, verifyDashboardPassword, logoutHandler, signSessionToken, dashboardAuthState };
}
