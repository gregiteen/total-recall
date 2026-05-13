import fs from 'fs';
import path from 'path';
import os from 'os';
import crypto from 'crypto';
import yaml from 'yaml';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcrypt';
import rateLimit from 'express-rate-limit';
import { watchdog } from '../core/watchdog.mjs';
import { isValidToken, recordKeyUsage } from './keys.mjs';

const AGENT_DIR = process.env.AGENT_DIR || path.join(os.homedir(), '.agent');
const CONFIG_FILE = path.join(AGENT_DIR, 'config', 'security.yml');

// In-memory secret for JWT signing. Generates fresh on each start.
const JWT_SECRET = process.env.SESSION_SECRET || crypto.randomBytes(32).toString('hex');

export function loadSecurityConfig() {
  if (!fs.existsSync(CONFIG_FILE)) {
    return { dashboard: {}, api: { pats: [] }, rate_limits: { api_requests_per_minute: 60 } };
  }
  return yaml.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
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


// Global authentication middleware
export function requireAuth(req, res, next) {
  const ip = req.ip || req.socket?.remoteAddress;
  if (ip && watchdog.isIpBlocked(ip)) {
    return res.status(403).json({ error: 'IP blocked due to too many failed auth attempts.' });
  }

  const config = loadSecurityConfig();
  
  // 1. Check Bearer PAT — validated against keys.jsonl (+ legacy 'local' sentinel via security.yml)
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.substring(7);
    // Check dynamic keys store first
    if (isValidToken(token)) {
      recordKeyUsage(token);
      return next();
    }
    // Fallback: check legacy static PATs in security.yml
    const config = loadSecurityConfig();
    const validPats = config.api?.pats || [];
    if (validPats.includes(token)) {
      return next();
    }
    return res.status(401).json({ error: 'Invalid PAT' });
  }

  // 2. Check Cookie Session
  const sessionToken = req.cookies?.session;
  if (sessionToken) {
    try {
      jwt.verify(sessionToken, JWT_SECRET);
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
