/**
 * API Key Lifecycle Manager
 *
 * Manages Personal Access Tokens (PATs) in validated native SSSS records.
 *
 * Schema:
 *   { id, name, token_hash, token_prefix, scopes, expires_at, created_at, last_used_at, hit_count, revoked }
 */

import path from 'node:path';
import crypto from 'node:crypto';
import { authState, assertNoSecretValues, appendAuthMetadata, authLedger } from './metadata-state.mjs';

export function createKeyStore({ brainDir }) {
if (!brainDir) throw new Error('Explicit auth key store required');
const BRAIN_DIR = brainDir;
const KEYS_FILE = path.join(BRAIN_DIR, 'config', 'keys.jsonl');
const state = authState(KEYS_FILE);
const roleState = authState(path.join(BRAIN_DIR, 'config/key-roles.json'));
const usageFile = path.join(BRAIN_DIR, 'logs/key-usage.jsonl');

const ALL_SCOPES = '*';

const KNOWN_SCOPES = [
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
  // name must always be a string — guard against bad issueKey({ name }) calls
  if (key.name && typeof key.name === 'object') {
    key.name = String(key.name.name || key.name.label || 'Unnamed Key');
  } else if (typeof key.name !== 'string' || !key.name.trim()) {
    key.name = key.name == null ? 'Unnamed Key' : String(key.name);
  }
  if (Object.hasOwn(key, 'token')) throw new Error('Raw credentials are not a native key record');
  key.scopes = normalizeScopes(key.scopes);
  key.expires_at = key.expires_at || null;
  key.hit_count = key.hit_count || 0;
  key.revoked = !!key.revoked;
  return key;
}

function normalizeScopes(scopes) {
  if (scopes == null) return [];
  if (!Array.isArray(scopes) || scopes.some(scope => typeof scope !== 'string' || !(scope === ALL_SCOPES || /^[a-z][a-z0-9-]*:(\*|[a-z][a-z0-9-]*)$/.test(scope)))) throw new Error('Invalid scopes; no permissions granted');
  return [...new Set(scopes)];
}

function loadRoles() {
  const roles = roleState.read({ admin: ['*'], reader: KNOWN_SCOPES.filter(scope => scope.endsWith(':read')), operator: ['memory:read', 'memory:write', 'ssss:read', 'tasks:read', 'tasks:write'] });
  if (!roles || typeof roles !== 'object' || Array.isArray(roles)) throw new Error('Invalid key role policy');
  for (const [name, scopes] of Object.entries(roles)) { if (!/^[a-z][a-z0-9-]{0,63}$/.test(name)) throw new Error('Invalid role name'); normalizeScopes(scopes); }
  return roles;
}
function setRole(name, scopes) {
  const roles = loadRoles();
  if (!/^[a-z][a-z0-9-]{0,63}$/.test(name)) throw new Error('Invalid role name');
  roles[name] = normalizeScopes(scopes); roleState.write(roles); return { name, scopes: roles[name] };
}
function scopeMatches(scopes, required) {
  return scopes.includes('*') || scopes.includes(required) || scopes.includes(`${String(required).split(':')[0]}:*`);
}

function isExpiredKey(key, now = new Date()) {
  if (!key?.expires_at) return false;
  const expires = new Date(key.expires_at);
  if (Number.isNaN(expires.getTime())) return true;
  return expires.getTime() <= now.getTime();
}

function keyHasScope(key, requiredScope) {
  if (!key || key.revoked || isExpiredKey(key)) return false;
  if (!requiredScope) return true;
  const scopes = normalizeScopes(key?.scopes);
  const role = key.role ? loadRoles()[key.role] : null;
  return scopeMatches(scopes, requiredScope) && (!key.role || (Array.isArray(role) && scopeMatches(role, requiredScope)));
}

function keyHasAnyScope(key, requiredScopes = []) {
  if (!requiredScopes.length) return true;
  return requiredScopes.some(scope => keyHasScope(key, scope));
}

function loadKeys() {
  const keys = state.read([]);
  if (!Array.isArray(keys)) throw new Error('Invalid PAT registry');
  keys.forEach(assertNoSecretValues);
  return keys.map(normalizeKey);
}

function saveKeys(keys) {
  const sanitized = keys.map((key) => {
    const { token, ...rest } = normalizeKey(key);
    return rest;
  });
  sanitized.forEach(assertNoSecretValues);
  state.write(sanitized);
}

/**
 * Issue a PAT.
 * @param {string|object} nameOrOpts - display name, or { name, scopes, expires_at }
 * @param {object} [options]
 */
function issueKey(nameOrOpts, options = {}) {
  let name = nameOrOpts;
  let opts = options;
  // Accept issueKey({ name, scopes }) form safely
  if (nameOrOpts && typeof nameOrOpts === 'object' && !Array.isArray(nameOrOpts)) {
    name = nameOrOpts.name || nameOrOpts.label || 'Unnamed Key';
    opts = {
      scopes: nameOrOpts.scopes ?? options.scopes,
      expires_at: nameOrOpts.expires_at ?? nameOrOpts.expiresAt ?? options.expires_at ?? options.expiresAt,
      role: nameOrOpts.role ?? options.role,
      issuer: options.issuer,
      kind: nameOrOpts.kind ?? options.kind,
    };
  }
  if (typeof name !== 'string' || !name.trim()) {
    name = 'Unnamed Key';
  }

  const scopes = normalizeScopes(opts.scopes);
  if (opts.role && !Object.hasOwn(loadRoles(), opts.role)) throw new Error('Unknown key role');
  if (opts.kind && !['pat', 'api_key'].includes(opts.kind)) throw new Error('Invalid key kind');
  const issuer = opts.issuer;
  if (issuer && (!keyHasScope(issuer, 'keys:write') || scopes.some(scope => !keyHasScope(issuer, scope)))) throw new Error('Cannot issue privileges beyond the issuer');
  const expiresAt = opts.expires_at || opts.expiresAt || null;
  if (expiresAt && !Number.isFinite(Date.parse(expiresAt))) throw new Error('Invalid key expiry');
  if (issuer?.expires_at && (!expiresAt || Date.parse(expiresAt) > Date.parse(issuer.expires_at))) throw new Error('Issued key cannot outlive its issuer');
  const keys = loadKeys();
  const token = `tr_${crypto.randomBytes(32).toString('base64url')}`;
  const key = {
    id: crypto.randomUUID(),
    name: name.trim(),
    token_hash: hashToken(token),
    token_prefix: token.slice(0, 8),
    scopes,
    role: opts.role || null,
    issued_by: issuer?.id || 'local-operator',
    kind: opts.kind || 'pat',
    expires_at: expiresAt,
    created_at: new Date().toISOString(),
    last_used_at: null,
    hit_count: 0,
    revoked: false,
  };
  keys.push(key);
  saveKeys(keys);
  return { ...key, token };
}

function revokeKey(id) {
  const keys = loadKeys();
  const key = keys.find(k => k.id === id);
  if (!key) return null;
  key.revoked = true;
  saveKeys(keys);
  return key;
}

function recordKeyUsage(token, details = {}) {
  const keys = loadKeys();
  const tokenHash = hashToken(token);
  const key = keys.find(k => safeEqualHex(k.token_hash, tokenHash) && !k.revoked && !isExpiredKey(k));
  if (!key) return false;
  key.hit_count = (key.hit_count || 0) + 1;
  key.last_used_at = new Date().toISOString();
  saveKeys(keys);
  appendAuthMetadata(usageFile, { key_id: key.id, timestamp: key.last_used_at, action: 'request',
    ...(typeof details.method === 'string' ? { method: details.method } : {}),
    ...(typeof details.path === 'string' ? { path: details.path.split('?')[0] } : {}),
    ...(Number.isInteger(details.status) ? { status: details.status } : {}) });
  return true;
}
function listKeyUsage(id) { return authLedger(usageFile).filter(row => !id || row.key_id === id); }
function recordKeyOutcome(id, { method, path: requestPath, status } = {}) {
  if (typeof id !== 'string' || !Number.isInteger(status) || status < 100 || status > 599) throw new Error('Invalid request outcome');
  appendAuthMetadata(usageFile, { action: 'request_outcome', key_id: id, timestamp: new Date().toISOString(),
    method: typeof method === 'string' ? method : '', path: typeof requestPath === 'string' ? requestPath.split('?')[0] : '', status });
}

function isValidToken(token) {
  return !!findValidKeyByToken(token);
}

function findValidKeyByToken(token) {
  if (!token || token === 'local') return null;
  const tokenHash = hashToken(token);
  const keys = loadKeys();
  return keys.find(k => safeEqualHex(k.token_hash, tokenHash) && !k.revoked && !isExpiredKey(k)) || null;
}

return { ALL_SCOPES, KNOWN_SCOPES, normalizeScopes, isExpiredKey, keyHasScope, keyHasAnyScope, loadKeys, issueKey, revokeKey, recordKeyUsage, isValidToken, findValidKeyByToken, loadRoles, setRole, listKeyUsage, recordKeyOutcome };
}
