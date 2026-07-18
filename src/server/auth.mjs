import fs from 'fs';
import path from 'path';
import os from 'os';
import crypto from 'crypto';
import yaml from 'yaml';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcrypt';
import rateLimit from 'express-rate-limit';
import { watchdog } from '../core/watchdog.mjs';
import { findValidKeyByToken, keyHasAnyScope, recordKeyUsage } from './keys.mjs';
import { logger } from '../core/logger.mjs';

import { agentDir, brainDir, sessionSecret, nodeEnv } from '../core/config.mjs';

const BRAIN_DIR = brainDir;
const CONFIG_FILE = path.join(BRAIN_DIR, 'config', 'security.yml');

// Persist JWT secret to disk so sessions survive restarts
const JWT_SECRET_PATH = path.join(BRAIN_DIR, 'config', 'session-secret');
export const BCRYPT_COST = 12;

let JWT_SECRET;
try {
  JWT_SECRET = sessionSecret || fs.readFileSync(JWT_SECRET_PATH, 'utf8').trim();
} catch {
  JWT_SECRET = crypto.randomBytes(32).toString('hex');
  try {
    fs.mkdirSync(path.dirname(JWT_SECRET_PATH), { recursive: true });
    fs.writeFileSync(JWT_SECRET_PATH, JWT_SECRET, { mode: 0o600 });
  } catch { /* non-fatal — will regenerate on next restart */ }
}

export function loadSecurityConfig() {
  if (!fs.existsSync(CONFIG_FILE)) {
    return {
      dashboard: {},
      api: { pats: [], allow_static_pats: false },
      network: { require_https: true, public_health: false, allowed_origins: [], trusted_proxies: [] },
      bind: { host: '127.0.0.1', port: 3000, allow_public_bind: false },
      rate_limits: { api_requests_per_minute: 1200 },
      sandbox: { enabled: false }
    };
  }
  const parsed = yaml.parse(fs.readFileSync(CONFIG_FILE, 'utf8')) || {};
  if (parsed.sandbox === undefined) {
    parsed.sandbox = { enabled: false };
  }
  return parsed;
}

export function apiRateLimiter() {
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
export function sandboxRateLimiter() {
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
export function ingestRateLimiter() {
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

export function isLoopbackIp(ip) {
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
export function isMeshIp(ip) {
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

export function isLocalRequest(req) {
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

export function requireHttps(req, res, next) {
  const config = loadSecurityConfig();
  if (nodeEnv !== 'production') return next();
  if (config.network?.require_https === false) return next();
  if (isLocalRequest(req)) return next();
  // Mesh traffic is WireGuard-encrypted end-to-end; HTTPS adds nothing.
  // Socket address only — never trust forwarded headers for this exemption.
  if (isMeshIp(req.socket?.remoteAddress) && forwardedClientIps(req).length === 0) return next();

  const forwardedProto = String(req.headers['x-forwarded-proto'] || '').split(',')[0].trim();
  if (req.secure || forwardedProto === 'https') return next();

  return res.status(426).json({
    error: 'HTTPS is required. Access this brain through its configured TLS endpoint.'
  });
}

export function requireAuthOrLocal(req, res, next) {
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

export function corsOptions() {
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
export function requireAuth(req, res, next) {
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
      recordKeyUsage(token);
      req.auth = {
        type: 'pat',
        key_id: key.id,
        key_name: key.name,
        scopes: key.scopes || ['*']
      };
      return next();
    }
    // DEPRECATED: Legacy static PATs. Use dynamic keys via POST /api/keys instead.
    const validPats = config.api?.allow_static_pats === true ? (config.api?.pats || []) : [];
    if (token !== 'local' && validPats.some((pat) => timingSafeStringEqual(pat, token))) {
      logger.warn('auth', 'DEPRECATED: Static PAT used for authentication. Migrate to dynamic keys via POST /api/keys.');
      req.auth = { type: 'static_pat', scopes: ['*'] };
      return next();
    }
    if (ip) watchdog.recordAuthFailure(ip);
    return res.status(401).json({ error: 'Invalid PAT' });
  }

  // 2. Check Cookie Session
  const sessionToken = req.cookies?.session;
  if (sessionToken) {
    try {
      jwt.verify(sessionToken, JWT_SECRET);
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

export function requireScope(...requiredScopes) {
  return (req, res, next) => {
    if (!requiredScopes.length) return next();
    if (req.auth?.type === 'dashboard_session') return next();
    if (keyHasAnyScope({ scopes: req.auth?.scopes || [] }, requiredScopes)) return next();
    return res.status(403).json({
      error: 'Insufficient token scope',
      required_scopes: requiredScopes
    });
  };
}

export function requireSandboxEnabled(req, res, next) {
  const config = loadSecurityConfig();
  if (!config.sandbox?.enabled) {
    logger.warn('Sandbox request rejected: sandbox is disabled in security.yml', { ip: req.ip });
    return res.status(403).json({ error: 'Sandbox is disabled in security.yml' });
  }
  logger.info('Executing sandbox payload (sandbox is explicitly enabled in security.yml)', { ip: req.ip });
  next();
}

export async function loginHandler(req, res) {
  const ip = req.ip || req.socket?.remoteAddress;
  if (ip && watchdog.isIpBlocked(ip)) {
    return res.status(403).json({ error: 'IP blocked due to too many failed auth attempts.' });
  }

  const { password } = req.body;
  if (!password) {
    return res.status(400).json({ error: 'Password is required' });
  }
  
  const config = loadSecurityConfig();
  const passwordHash = config.dashboard?.password_hash;
  
  if (!passwordHash) {
    return res.status(403).json({ error: 'Dashboard login is not configured in security.yml' });
  }

  const match = await bcrypt.compare(password, passwordHash);
  if (!match) {
    if (ip) watchdog.recordAuthFailure(ip);
    return res.status(401).json({ error: 'Invalid password' });
  }

  if (ip) watchdog.resetAuthFailures(ip);

  const ttlHours = config.dashboard?.session_ttl_hours || 24;
  const token = jwt.sign({ user: 'admin' }, JWT_SECRET, { expiresIn: `${ttlHours}h` });
  
  res.cookie('session', token, {
    httpOnly: true,
    secure: nodeEnv !== 'development' && config.network?.require_https !== false,
    maxAge: ttlHours * 60 * 60 * 1000,
    sameSite: 'lax'
  });
  
  const requiresReset = !!config.dashboard?.force_password_reset;
  res.json({ success: true, requiresPasswordReset: requiresReset });
}

export async function changePasswordHandler(req, res) {
  const { newPassword } = req.body;
  if (!newPassword || newPassword.length < 8) {
    return res.status(400).json({ error: 'Password must be at least 8 characters' });
  }

  const config = loadSecurityConfig();
  const hash = await bcrypt.hash(newPassword, BCRYPT_COST);
  
  if (!config.dashboard) config.dashboard = {};
  config.dashboard.password_hash = hash;
  config.dashboard.force_password_reset = false;

  fs.writeFileSync(CONFIG_FILE, yaml.stringify(config));

  // Dynamically update the backup secrets.enc file to preserve the password hash
  try {
    const { loadSecrets, saveSecrets } = await import('../core/secrets-store.mjs');
    let secretsObj = await loadSecrets(agentDir);
    secretsObj.dashboard_password_hash = hash;
    await saveSecrets(agentDir, secretsObj);
  } catch (err) {
    logger.error('auth', `Failed to write password hash to secrets.enc backup: ${err.message}`);
  }

  res.json({ success: true });
}

/**
 * Short-lived step-up token for high-risk actions (secret reveal / copy).
 * Requires a fresh passkey assertion or password re-entry to mint.
 *
 * @param {{ purpose?: string, ttlSeconds?: number, actor?: string }} opts
 */
export function mintStepUpToken(opts = {}) {
  const purpose = opts.purpose || 'secrets:reveal';
  const ttl = Math.min(300, Math.max(15, opts.ttlSeconds || 60));
  return jwt.sign(
    {
      purpose,
      step_up: true,
      actor: opts.actor || 'dashboard',
    },
    JWT_SECRET,
    { expiresIn: ttl },
  );
}

/**
 * @param {string} token
 * @param {string} expectedPurpose
 * @returns {{ ok: true, payload: object } | { ok: false, error: string }}
 */
export function verifyStepUpToken(token, expectedPurpose = 'secrets:reveal') {
  if (!token || typeof token !== 'string') {
    return { ok: false, error: 'Step-up token required' };
  }
  try {
    const payload = jwt.verify(token, JWT_SECRET);
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
export async function verifyDashboardPassword(password) {
  if (!password) return false;
  const config = loadSecurityConfig();
  const passwordHash = config.dashboard?.password_hash;
  if (!passwordHash) return false;
  return bcrypt.compare(String(password), passwordHash);
}

export function logoutHandler(req, res) {
  res.clearCookie('session');
  res.json({ success: true });
}
