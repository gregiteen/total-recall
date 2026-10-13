/**
 * Mesh-authenticated secrets: the leader releases individual secrets to
 * enrolled machines that hold a grant; nodes cache what they were granted.
 *
 * Replaces whole-store replication behind one shared bearer token. The mesh
 * identifies the caller (see the mesh plugin's mesh-identity), so there is no
 * shared credential to leak, and a compromised node exposes only its grants.
 *
 * Uptime comes first: when the leader is unreachable a node keeps serving its
 * cached grants. Revocation takes effect the next time the node reaches the
 * leader (a refused or missing key purges that cache entry). The cache is
 * encrypted with a per-node key kept beside it at mode 0600 — that protects
 * copies and backups of the file, not an attacker who is already root on the node.
 */

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { identifyCaller, isKeyAllowed, allowedKeys, loadPolicy } from './mesh-identity.mjs';
import { getSecret, appendAudit } from './secrets-store.mjs';

export const SOFT_TTL_MS = 5 * 60_000;
const KEY_FILE = 'mesh-cache.key';
const CACHE_FILE = 'mesh-secret-cache.enc';
const FETCH_TIMEOUT_MS = 8_000;

/* ---------- leader side ---------- */

function audit(brainDir, event) {
  try {
    appendAudit(brainDir, event);
  } catch {
    // Auditing must never turn a refusal into a crash.
  }
}

/** Express middleware: attach `req.meshIdentity` or refuse. */
export function createMeshIdentityMiddleware({ identify = identifyCaller } = {}) {
  return async function requireMeshIdentity(req, res, next) {
    const identity = await identify(req.socket?.remoteAddress || req.ip);
    if (!identity) return res.status(403).json({ error: 'Mesh identity required' });
    req.meshIdentity = identity;
    return next();
  };
}

/** GET /api/secrets/mesh/:key */
export function createMeshSecretHandler({ brainDir, policyFor = loadPolicy, read, allowed = isKeyAllowed }) {
  return async function meshSecretHandler(req, res) {
    const key = String(req.params.key || '');
    const identity = req.meshIdentity;
    const policy = await policyFor(brainDir);
    res.set('Cache-Control', 'no-store');
    if (!(await allowed(identity, key, policy))) {
      audit(brainDir, { action: 'mesh_denied', key, actor: `mesh:${identity?.node || 'unknown'}` });
      return res.status(403).json({ error: 'No grant for this key' });
    }
    const result = await (read || getSecret)(brainDir, key, { action: 'mesh_get', actor: `mesh:${identity.node}` });
    if (!result.found) return res.status(404).json({ error: 'Secret not found' });
    return res.json({ key, value: result.value });
  };
}

/** GET /api/secrets/mesh — key names this caller may read (never values). */
export function createMeshListHandler({ brainDir, policyFor = loadPolicy, keysFor, filter = allowedKeys }) {
  return async function meshListHandler(req, res) {
    const policy = await policyFor(brainDir);
    const names = await keysFor();
    res.set('Cache-Control', 'no-store');
    res.json({ keys: await filter(req.meshIdentity, names, policy) });
  };
}

/* ---------- node side ---------- */

function nodeKey(configDir) {
  const file = path.join(configDir, KEY_FILE);
  try {
    const existing = fs.readFileSync(file);
    if (existing.length === 32) return existing;
  } catch {
    // fall through to create
  }
  fs.mkdirSync(configDir, { recursive: true });
  const fresh = crypto.randomBytes(32);
  fs.writeFileSync(file, fresh, { mode: 0o600 });
  return fresh;
}

function readCache(configDir) {
  try {
    const blob = fs.readFileSync(path.join(configDir, CACHE_FILE));
    const decipher = crypto.createDecipheriv('aes-256-gcm', nodeKey(configDir), blob.subarray(0, 12));
    decipher.setAuthTag(blob.subarray(12, 28));
    const plain = Buffer.concat([decipher.update(blob.subarray(28)), decipher.final()]);
    const parsed = JSON.parse(plain.toString('utf8'));
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    // Missing, truncated or tampered cache is an empty cache, not an outage.
    return {};
  }
}

function writeCache(configDir, entries) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', nodeKey(configDir), iv);
  const body = Buffer.concat([cipher.update(JSON.stringify(entries), 'utf8'), cipher.final()]);
  const file = path.join(configDir, CACHE_FILE);
  const temp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(temp, Buffer.concat([iv, cipher.getAuthTag(), body]), { mode: 0o600 });
  fs.renameSync(temp, file);
}

/**
 * Read one granted secret from the leader, falling back to the cache.
 * Returns `{ value, source: 'leader' | 'cache' | 'stale-cache' }`, or throws if
 * the leader refuses (403/404, which also purges the cached entry) or is
 * unreachable and nothing is cached.
 */
export async function getMeshSecret(key, { leaderIp, configDir, fetchImpl = fetch, now = Date.now, softTtlMs = SOFT_TTL_MS }) {
  const entries = readCache(configDir);
  const cached = entries[key];
  if (cached && now() - cached.at < softTtlMs) return { value: cached.value, source: 'cache' };

  try {
    const response = await fetchImpl(`http://${leaderIp}:${process.env.TR_SERVER_PORT || 3000}/api/secrets/mesh/${encodeURIComponent(key)}`, {
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (response.status === 403 || response.status === 404) {
      if (key in entries) {
        delete entries[key];
        writeCache(configDir, entries);
      }
      throw Object.assign(new Error(`Leader refused ${key} (${response.status})`), { refused: true });
    }
    if (!response.ok) throw new Error(`Leader returned ${response.status}`);
    const { value } = await response.json();
    entries[key] = { value, at: now() };
    writeCache(configDir, entries);
    return { value, source: 'leader' };
  } catch (error) {
    if (error.refused) throw error;
    if (cached) return { value: cached.value, source: 'stale-cache' };
    throw error;
  }
}
