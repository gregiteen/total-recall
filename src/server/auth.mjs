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

const AGENT_DIR = process.env.AGENT_DIR || path.join(os.homedir(), '.agent');
const CONFIG_FILE = path.join(AGENT_DIR, 'config', 'security.yml');

// In-memory secret for JWT signing. Generates fresh on each start.
const JWT_SECRET = process.env.SESSION_SECRET || crypto.randomBytes(32).toString('hex');

export function loadSecurityConfig() {
  if (!fs.existsSync(CONFIG_FILE)) {
    return {
      dashboard: {},
      api: { pats: [], allow_static_pats: false },
      network: { require_https: true, public_health: false, allowed_origins: [] },
      bind: { host: '127.0.0.1', port: 3000, allow_public_bind: false },
      rate_limits: { api_requests_per_minute: 60, mcp_requests_per_minute: 120 }
    };
  }
  return yaml.parse(fs.readFileSync(CONFIG_FILE, 'utf8')) || {};
}

export function apiRateLimiter() {
  const config = loadSecurityConfig();
  const limit = config.rate_limits?.api_requests_per_minute || 60;
  return rateLimit({
    windowMs: 60 * 1000,
    max: limit,
    message: 'Too many requests to the API',
    standardHeaders: true,
    legacyHeaders: false,
  });
}

export function mcpRateLimiter() {
  const config = loadSecurityConfig();
  const limit = config.rate_limits?.mcp_requests_per_minute || 120;
  return rateLimit({
    windowMs: 60 * 1000,
    max: limit,
    message: 'Too many requests to the MCP gateway',
    standardHeaders: true,
    legacyHeaders: false,
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
  const xForwardedFor = req.headers?.['x-forwarded-for'];
  if (typeof xForwardedFor === 'string') {
    ips.push(...xForwardedFor.split(',').map((ip) => ip.trim()).filter(Boolean));
  }

  const forwarded = req.headers?.forwarded;
  if (typeof forwarded === 'string') {
    for (const part of forwarded.split(',')) {
      const match = part.match(/(?:^|;)\s*for=("[^"]+"|[^;,\s]+)/i);
      if (match) ips.push(match[1].trim());
    }
  }

  return ips;
}

export function isLocalRequest(req) {
  const forwardedIps = forwardedClientIps(req);
  if (forwardedIps.length > 0) {
    return forwardedIps.every((ip) => isLoopbackIp(ip));
  }

  return isLoopbackIp(req.ip) || isLoopbackIp(req.socket?.remoteAddress);
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
  if (process.env.NODE_ENV !== 'production') return next();
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
    // Optional compatibility path for explicitly enabled static PATs.
    const validPats = config.api?.allow_static_pats === true ? (config.api?.pats || []) : [];
    if (token !== 'local' && validPats.some((pat) => timingSafeStringEqual(pat, token))) {
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
    secure: process.env.NODE_ENV === 'production',
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
  const hash = await bcrypt.hash(newPassword, 10);
  
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
