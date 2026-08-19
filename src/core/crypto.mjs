import crypto from 'crypto';
import { promisify } from 'node:util';
import fs from 'fs';
import path from 'path';
import os from 'os';

const ALGORITHM = 'aes-256-gcm';

const scryptAsync = promisify(crypto.scrypt);

const SCRYPT_PARAMS = {
  N: 2 ** 16, // CPU/memory cost: 65536
  r: 8,
  p: 1,
  maxmem: 128 * 1024 * 1024
};

/**
 * Derived-key cache.
 *
 * The KDF above is deliberately expensive (~64 MB, measured 190-240 ms per
 * derivation). That cost is correct ONCE — it is what makes the store
 * brute-force resistant — but it was being paid on every single read:
 * loadSecrets() re-derives per call, and listSecretsMeta / getSecretsCatalog /
 * getSharedValueHealth each call loadSecrets, so one Secrets page load paid it
 * three or more times.
 *
 * The cache is keyed by BOTH the salt and a digest of the password, so:
 *   - re-encrypting the store (fresh random salt on every save) misses, and
 *   - rotating the master password misses.
 * Neither can serve a stale key. Entries are bounded and evicted oldest-first.
 *
 * A cached key is strictly less sensitive than what the caller already holds:
 * the password itself is in this process, and the decrypted secrets are about
 * to be. Set TR_SECRETS_KEY_CACHE=0 to disable.
 */
const derivedKeyCache = new Map();
const MAX_CACHED_KEYS = 8;

function keyCacheEnabled() {
  return process.env.TR_SECRETS_KEY_CACHE !== '0';
}

function keyCacheId(password, salt) {
  const pwDigest = crypto.createHash('sha256').update(String(password)).digest();
  return crypto.createHash('sha256').update(salt).update(pwDigest).digest('base64');
}

function cacheGet(id) {
  if (!derivedKeyCache.has(id)) return null;
  // Refresh recency: delete + re-set moves the entry to the tail.
  const key = derivedKeyCache.get(id);
  derivedKeyCache.delete(id);
  derivedKeyCache.set(id, key);
  return key;
}

function cacheSet(id, key) {
  derivedKeyCache.set(id, key);
  while (derivedKeyCache.size > MAX_CACHED_KEYS) {
    derivedKeyCache.delete(derivedKeyCache.keys().next().value);
  }
}

/** Drop every cached key — call after a master-password rotation. */
export function clearDerivedKeyCache() {
  derivedKeyCache.clear();
}

/**
 * Derives a 32-byte encryption key from a master password using scrypt
 * (Node built-in — no native dependency required).
 *
 * Parameters chosen for ~64 MB of memory, matching OWASP scrypt guidance.
 *
 * @param {object} [opts]
 * @param {boolean} [opts.cache=true] - false on the encrypt path: every save
 *   generates a fresh random salt that is never derived against again, so
 *   caching it would only evict keys that ARE reused.
 */
export async function deriveKey(password, salt, opts = {}) {
  const useCache = opts.cache !== false && keyCacheEnabled();
  const id = useCache ? keyCacheId(password, salt) : null;
  if (id) {
    const hit = cacheGet(id);
    if (hit) return hit;
  }
  const key = await scryptAsync(password, salt, 32, SCRYPT_PARAMS);
  if (id) cacheSet(id, key);
  return key;
}

export function deriveKeySync(password, salt, opts = {}) {
  const useCache = opts.cache !== false && keyCacheEnabled();
  const id = useCache ? keyCacheId(password, salt) : null;
  if (id) {
    const hit = cacheGet(id);
    if (hit) return hit;
  }
  const key = crypto.scryptSync(password, salt, 32, SCRYPT_PARAMS);
  if (id) cacheSet(id, key);
  return key;
}

/**
 * Encrypts a JSON object into a buffer.
 * Format: [16 bytes salt][12 bytes IV][ciphertext][16 bytes auth tag]
 */
export async function encryptSecrets(secretsObj, password) {
  const salt = crypto.randomBytes(16);
  const key = await deriveKey(password, salt, { cache: false });
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  
  const plaintext = JSON.stringify(secretsObj);
  let ciphertext = cipher.update(plaintext, 'utf8');
  ciphertext = Buffer.concat([ciphertext, cipher.final()]);
  const authTag = cipher.getAuthTag();
  
  return Buffer.concat([salt, iv, ciphertext, authTag]);
}

export function encryptSecretsSync(secretsObj, password) {
  const salt = crypto.randomBytes(16);
  const key = deriveKeySync(password, salt, { cache: false });
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  
  const plaintext = JSON.stringify(secretsObj);
  let ciphertext = cipher.update(plaintext, 'utf8');
  ciphertext = Buffer.concat([ciphertext, cipher.final()]);
  const authTag = cipher.getAuthTag();
  
  return Buffer.concat([salt, iv, ciphertext, authTag]);
}

export async function decryptSecrets(encryptedBuffer, password) {
  const salt = encryptedBuffer.subarray(0, 16);
  const iv = encryptedBuffer.subarray(16, 28);
  const authTag = encryptedBuffer.subarray(encryptedBuffer.length - 16);
  const ciphertext = encryptedBuffer.subarray(28, encryptedBuffer.length - 16);
  
  const key = await deriveKey(password, salt);
  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);
  
  let decrypted = decipher.update(ciphertext);
  decrypted = Buffer.concat([decrypted, decipher.final()]);
  
  return JSON.parse(decrypted.toString('utf8'));
}

export function decryptSecretsSync(encryptedBuffer, password) {
  const salt = encryptedBuffer.subarray(0, 16);
  const iv = encryptedBuffer.subarray(16, 28);
  const authTag = encryptedBuffer.subarray(encryptedBuffer.length - 16);
  const ciphertext = encryptedBuffer.subarray(28, encryptedBuffer.length - 16);
  
  const key = deriveKeySync(password, salt);
  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);
  
  let decrypted = decipher.update(ciphertext);
  decrypted = Buffer.concat([decrypted, decipher.final()]);
  
  return JSON.parse(decrypted.toString('utf8'));
}


/**
 * Generates an Ed25519 keypair for signing releases.
 */
export function generateSignatureKeyPair() {
  const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519');
  return {
    publicKey: publicKey.export({ type: 'spki', format: 'pem' }),
    privateKey: privateKey.export({ type: 'pkcs8', format: 'pem' })
  };
}

/**
 * Signs a payload using an Ed25519 private key.
 */
export function signPayload(payload, privateKeyPem) {
  const signature = crypto.sign(null, Buffer.from(payload), privateKeyPem);
  return signature.toString('base64');
}

/**
 * Verifies a signature using an Ed25519 public key.
 */
export function verifySignature(payload, signatureBase64, publicKeyPem) {
  const signature = Buffer.from(signatureBase64, 'base64');
  return crypto.verify(null, Buffer.from(payload), publicKeyPem, signature);
}
