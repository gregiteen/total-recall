/**
 * crypto.mjs — Config Encryption/Decryption
 *
 * AES-256-GCM encryption using Node's built-in crypto module.
 * Used by `total-recall setup --share` and `--config` for
 * password-protected config portability.
 *
 * Format: base64-encoded JSON envelope:
 *   { v: 1, salt, iv, tag, data }
 *
 * Key derivation: PBKDF2 with 600K iterations + random salt (OWASP 2024).
 * No npm dependencies.
 */

import crypto from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const KEY_LENGTH = 32;          // 256 bits
const IV_LENGTH = 16;           // 128 bits
const SALT_LENGTH = 32;         // 256 bits
const ITERATIONS = 600_000;      // OWASP 2024 minimum for PBKDF2-HMAC-SHA512
const DIGEST = 'sha512';
const ENVELOPE_VERSION = 1;
const MAGIC_PREFIX = 'TOTALRECALL:';  // Identifies encrypted blobs

/**
 * Derive an encryption key from a password using PBKDF2.
 * @param {string} password
 * @param {Buffer} salt
 * @returns {Buffer}
 */
function deriveKey(password, salt) {
  return crypto.pbkdf2Sync(password, salt, ITERATIONS, KEY_LENGTH, DIGEST);
}

/**
 * Encrypt plaintext with a password.
 *
 * @param {string} plaintext - Content to encrypt
 * @param {string} password - User-provided password
 * @returns {string} Encrypted blob (TOTALRECALL:<base64>)
 */
export function encrypt(plaintext, password) {
  const salt = crypto.randomBytes(SALT_LENGTH);
  const iv = crypto.randomBytes(IV_LENGTH);
  const key = deriveKey(password, salt);

  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([
    cipher.update(plaintext, 'utf-8'),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();

  const envelope = {
    v: ENVELOPE_VERSION,
    salt: salt.toString('base64'),
    iv: iv.toString('base64'),
    tag: tag.toString('base64'),
    data: encrypted.toString('base64'),
  };

  return MAGIC_PREFIX + Buffer.from(JSON.stringify(envelope)).toString('base64');
}

/**
 * Decrypt an encrypted blob with a password.
 *
 * @param {string} blob - Encrypted blob (TOTALRECALL:<base64>)
 * @param {string} password - User-provided password
 * @returns {string} Decrypted plaintext
 * @throws {Error} If password is wrong or blob is corrupt
 */
export function decrypt(blob, password) {
  if (!blob.startsWith(MAGIC_PREFIX)) {
    throw new Error('Not an encrypted Total Recall config (missing magic prefix)');
  }

  const envelopeJson = Buffer.from(blob.slice(MAGIC_PREFIX.length), 'base64').toString('utf-8');
  const envelope = JSON.parse(envelopeJson);

  if (envelope.v !== ENVELOPE_VERSION) {
    throw new Error(`Unsupported encryption version: ${envelope.v}`);
  }

  const salt = Buffer.from(envelope.salt, 'base64');
  const iv = Buffer.from(envelope.iv, 'base64');
  const tag = Buffer.from(envelope.tag, 'base64');
  const data = Buffer.from(envelope.data, 'base64');
  const key = deriveKey(password, salt);

  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(tag);

  try {
    const decrypted = Buffer.concat([
      decipher.update(data),
      decipher.final(),
    ]);
    return decrypted.toString('utf-8');
  } catch {
    throw new Error('Wrong password or corrupt data');
  }
}

/**
 * Check if a string is an encrypted Total Recall blob.
 * @param {string} content
 * @returns {boolean}
 */
export function isEncrypted(content) {
  return typeof content === 'string' && content.trimStart().startsWith(MAGIC_PREFIX);
}
