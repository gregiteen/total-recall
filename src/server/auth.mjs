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

import { agentDir, sessionSecret, nodeEnv } from '../core/config.mjs';

const AGENT_DIR = agentDir;
const CONFIG_FILE = path.join(AGENT_DIR, 'config', 'security.yml');

// Persist JWT secret to disk so sessions survive restarts
const JWT_SECRET_PATH = path.join(AGENT_DIR, 'config', 'session-secret');
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
      rate_limits: { api_requests_per_minute: 60 },
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
  const limit = config.rate_limits?.api_requests_per_minute || 60;
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
    secure: nodeEnv !== 'development',
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
  res.json({ success: true });
}

export function logoutHandler(req, res) {
  res.clearCookie('session');
  res.json({ success: true });
}
