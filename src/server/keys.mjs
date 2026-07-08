/**
 * API Key Lifecycle Manager
 *
 * Manages Personal Access Tokens (PATs) in `.agent/config/keys.jsonl`.
 * Each line is a JSON object representing a single API key with metadata.
 *
 * Schema:
 *   { id, name, token_hash, token_prefix, scopes, expires_at, created_at, last_used_at, hit_count, revoked }
 */

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { brainDir } from '../core/config.mjs';

const BRAIN_DIR = brainDir;
const KEYS_FILE = path.join(BRAIN_DIR, 'config', 'keys.jsonl');

export const ALL_SCOPES = '*';

export const KNOWN_SCOPES = [
  ALL_SCOPES,
  'chat:read',
  'chat:write',
  'models:read',
  'instructions:read',
  'ssss:read',
  'ssss:write',
  'memory:read',
  'memory:write',
  'memory:recompile',
  'sandbox:run',
  'tts:use',
  'tasks:read',
  'tasks:write',
  'files:read',
  'config:read',
  'config:write',
  'keys:read',
  'keys:write',
  'health:read'
];

function hashToken(token) {
  return crypto.createHash('sha256').update(token, 'utf8').digest('hex');
}

function safeEqualHex(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  if (!/^[a-f0-9]{64}$/i.test(a) || !/^[a-f0-9]{64}$/i.test(b)) return false;
  return crypto.timingSafeEqual(Buffer.from(a, 'hex'), Buffer.from(b, 'hex'));
}

function normalizeKey(raw) {
  const key = { ...raw };
  if (key.token && typeof key.token === 'string') {
    if (key.token === 'local') {
      key.revoked = true;
      key.token_prefix = 'local';
      key.token_hash = hashToken(key.token);
    } else if (!key.token_hash) {
      key.token_hash = hashToken(key.token);
      key.token_prefix = key.token.slice(0, 8);
    }
    delete key.token;
  }
  key.scopes = normalizeScopes(key.scopes);
  key.expires_at = key.expires_at || null;
  key.hit_count = key.hit_count || 0;
  key.revoked = !!key.revoked;
  return key;
}

export function normalizeScopes(scopes) {
  if (!Array.isArray(scopes) || scopes.length === 0) return [ALL_SCOPES];
  const normalized = scopes
    .map(scope => String(scope || '').trim())
    .filter(Boolean)
    .filter(scope => scope === ALL_SCOPES || /^[a-z][a-z0-9-]*:(\*|[a-z][a-z0-9-]*)$/.test(scope));
  return [...new Set(normalized)].length ? [...new Set(normalized)] : [ALL_SCOPES];
}

export function isExpiredKey(key, now = new Date()) {
  if (!key?.expires_at) return false;
  const expires = new Date(key.expires_at);
  if (Number.isNaN(expires.getTime())) return true;
  return expires.getTime() <= now.getTime();
}

export function keyHasScope(key, requiredScope) {
  if (!requiredScope) return true;
  const scopes = normalizeScopes(key?.scopes);
  if (scopes.includes(ALL_SCOPES)) return true;
  if (scopes.includes(requiredScope)) return true;
  const [namespace] = String(requiredScope).split(':');
  return scopes.includes(`${namespace}:*`);
}

export function keyHasAnyScope(key, requiredScopes = []) {
  if (!requiredScopes.length) return true;
  return requiredScopes.some(scope => keyHasScope(key, scope));
}

function ensureKeysFile() {
  const dir = path.dirname(KEYS_FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  if (!fs.existsSync(KEYS_FILE)) fs.writeFileSync(KEYS_FILE, '', { encoding: 'utf8', mode: 0o600 });
  try {
    fs.chmodSync(KEYS_FILE, 0o600);
  } catch {
    // Best effort: chmod can fail on non-POSIX filesystems.
  }
}

export function loadKeys() {
  ensureKeysFile();
  const raw = fs.readFileSync(KEYS_FILE, 'utf8').trim();
  if (!raw) return [];
  const parsed = raw.split('\n').map(line => normalizeKey(JSON.parse(line)));
  if (raw.includes('"token"')) saveKeys(parsed);
  return parsed;
}

function saveKeys(keys) {
  ensureKeysFile();
  const sanitized = keys.map((key) => {
    const { token, ...rest } = normalizeKey(key);
    return rest;
  });
  fs.writeFileSync(KEYS_FILE, sanitized.map(k => JSON.stringify(k)).join('\n') + (sanitized.length ? '\n' : ''), { encoding: 'utf8', mode: 0o600 });
}

export function issueKey(name, options = {}) {
  const keys = loadKeys();
  const token = `tr_${crypto.randomBytes(32).toString('base64url')}`;
  const key = {
    id: crypto.randomUUID(),
    name: name || 'Unnamed Key',
    token_hash: hashToken(token),
    token_prefix: token.slice(0, 8),
    scopes: normalizeScopes(options.scopes),
    expires_at: options.expires_at || options.expiresAt || null,
    created_at: new Date().toISOString(),
    last_used_at: null,
    hit_count: 0,
    revoked: false,
  };
  keys.push(key);
  saveKeys(keys);
  return { ...key, token };
}

export function revokeKey(id) {
  const keys = loadKeys();
  const key = keys.find(k => k.id === id);
  if (!key) return null;
  key.revoked = true;
  saveKeys(keys);
  return key;
}

export function recordKeyUsage(token) {
  const keys = loadKeys();
  const tokenHash = hashToken(token);
  const key = keys.find(k => safeEqualHex(k.token_hash, tokenHash) && !k.revoked && !isExpiredKey(k));
  if (!key) return false;
  key.hit_count = (key.hit_count || 0) + 1;
  key.last_used_at = new Date().toISOString();
  saveKeys(keys);
  return true;
}

export function isValidToken(token) {
  return !!findValidKeyByToken(token);
}

export function findValidKeyByToken(token) {
  if (!token || token === 'local') return null;
  const tokenHash = hashToken(token);
  const keys = loadKeys();
  return keys.find(k => safeEqualHex(k.token_hash, tokenHash) && !k.revoked && !isExpiredKey(k)) || null;
}
