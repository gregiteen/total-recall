/**
 * Secrets store — portable keys separate from the SSSS memory vault.
 *
 * Format: AES-256-GCM ciphertext at <brain>/config/secrets.enc with mode 0o600.
 *
 * Never write secret values into vault markdown, openwiki, or compiled surfaces.
 */

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import os from 'os';
import { encryptSecrets, decryptSecrets, encryptSecretsSync, decryptSecretsSync } from './crypto.mjs';
import { DEFAULT_KEYCHAIN_SERVICE, readKeychainPassword } from './secrets-keychain.mjs';
import { writeFileSecure, appendFileSecure } from './secure-file.mjs';

export const META_KEY = '__tr_secrets_meta';

/**
 * @param {string} brainDir
 */
export function resolveSecretsPath(brainDir) {
  if (brainDir.endsWith('.agent')) {
    return path.join(brainDir, 'secrets.enc');
  }
  return path.join(brainDir, 'config', 'secrets.enc');
}

/**
 * @param {string} brainDir
 */
export function resolveAuditPath(brainDir) {
  return path.join(brainDir, 'logs', 'secrets-audit.jsonl');
}

/**
 * @param {string} brainDir
 */
export function resolveUsagePath(brainDir) {
  return path.join(brainDir, 'logs', 'usage.jsonl');
}

/**
 * The master password: the environment first, then — on macOS — the Keychain
 * entry `secret rekey` already maintains (service `total-recall-secrets`,
 * overridable with TR_SECRETS_KEYCHAIN_SERVICE), then the host env file
 * (see readTrEnvFilePassword).
 *
 * Only an interactive shell profile used to read the Keychain, so a
 * non-interactive process on the same Mac — a mesh `exec`, a release script —
 * could not open a store its own user owns. Resolved once per process; the
 * value is returned to the caller and never logged. TR_SECRETS_NO_KEYCHAIN=1
 * disables the fallback.
 */
let keychainPassword;
export function secretsPassword({
  env = process.env,
  readKeychain = readTrKeychainPassword,
  readEnvFile = readTrEnvFilePassword,
} = {}) {
  const fromEnv = env.TR_SECRETS_PASSWORD || env.TR_MASTER_PASSWORD;
  if (fromEnv) return fromEnv;
  if (env.TR_SECRETS_NO_KEYCHAIN !== '1') {
    let fromKeychain;
    if (readKeychain !== readTrKeychainPassword) fromKeychain = readKeychain(env) || null;
    else {
      if (keychainPassword === undefined) keychainPassword = readKeychain(env) || null;
      fromKeychain = keychainPassword;
    }
    if (fromKeychain) return fromKeychain;
  }
  return readEnvFile(env) || null;
}

/**
 * The host's env-file carrier: `TR_ENV_FILE`, else `~/.agent/tr.env` — the file
 * `auto-pull.sh` sources and `secret rekey --env-file` rotates. Only a shell
 * that sources it used to see the password, so a non-interactive process on a
 * Linux host (an agent's tool shell, cron, a systemd unit) could not open the
 * store its own user owns. The file is honoured only when it is a regular file
 * (not a symlink) that this user owns and no one else can read or write, in a
 * directory this user owns that no one else can write to.
 */
export function readTrEnvFilePassword(env = process.env) {
  const file = env.TR_ENV_FILE || path.join(env.HOME || os.homedir(), '.agent', 'tr.env');
  try {
    // lstat: a symlink could point the carrier at a file someone else controls.
    const stat = fs.lstatSync(file);
    if (!stat.isFile() || (stat.mode & 0o077) !== 0) return null;
    // A directory others can write to lets them replace the file.
    const dir = fs.statSync(path.dirname(file));
    if ((dir.mode & 0o022) !== 0) return null;
    const uid = typeof process.getuid === 'function' ? process.getuid() : null;
    if (uid !== null && (stat.uid !== uid || dir.uid !== uid)) return null;
    const line = fs
      .readFileSync(file, 'utf8')
      .split(/\r?\n/)
      .find((entry) => /^\s*(?:export\s+)?TR_SECRETS_PASSWORD\s*=/.test(entry));
    if (!line) return null;
    let value = line.slice(line.indexOf('=') + 1).trim();
    if (value.length >= 2 && /^(['"]).*\1$/.test(value)) value = value.slice(1, -1);
    return value || null;
  } catch {
    return null;
  }
}

function readTrKeychainPassword(env) {
  if (process.platform !== 'darwin') return null;
  try {
    return readKeychainPassword({
      service: env.TR_SECRETS_KEYCHAIN_SERVICE || DEFAULT_KEYCHAIN_SERVICE,
      account: env.USER || os.userInfo().username,
    });
  } catch {
    return null;
  }
}

/**
 * Is this buffer the plaintext JSON form of the store, rather than ciphertext?
 *
 * The encrypted form opens with a random 16-byte salt, so its first byte is
 * `{` about once in every 256 stores — measured at 17 in 5000. Deciding the
 * format from that byte alone therefore misreads roughly one store in every
 * 256 as plain JSON. Reads survive it by falling back to decryption, but
 * `migrateSecretsToEncryptedIfNeeded` does not: it reports perfectly good
 * ciphertext as `not-json`, and its caller believes the store still needs
 * migrating. The first byte is a cheap way to reject the common case; only
 * parsing can settle the rest.
 */
export function isPlainJsonStore(buf) {
  if (!buf?.length || buf[0] !== 0x7b /* { */) return false;
  try {
    const parsed = JSON.parse(buf.toString('utf8'));
    return Boolean(parsed) && typeof parsed === 'object' && !Array.isArray(parsed);
  } catch {
    return false;
  }
}

/**
 * Load raw secrets object synchronously
 */
export function loadSecretsSync(brainDir) {
  const filePath = resolveSecretsPath(brainDir);
  if (!fs.existsSync(filePath)) return {};

  const buf = fs.readFileSync(filePath);
  const password = secretsPassword();

  if (password && buf.length > 44 && !isPlainJsonStore(buf)) {
    try {
      return decryptSecretsSync(buf, password);
    } catch (err) {
      throw new Error(`Failed to decrypt secrets store synchronously: ${err.message}`);
    }
  }

  return JSON.parse(buf.toString('utf8') || '{}');
}

/**
 * Save raw secrets object synchronously
 */
export function saveSecretsSync(brainDir, obj) {
  const filePath = resolveSecretsPath(brainDir);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  
  const password = secretsPassword();
  if (!password) throw new Error('TR_SECRETS_PASSWORD or TR_MASTER_PASSWORD is required to write secrets');
  const buf = encryptSecretsSync(obj, password);
  writeFileSecure(filePath, buf, { mode: 0o600 });
}

/**
 * Load raw secrets object (values included). Caller must not log values.
 * @param {string} brainDir
 */
export async function loadSecrets(brainDir) {
  const filePath = resolveSecretsPath(brainDir);
  if (!fs.existsSync(filePath)) return {};

  const buf = fs.readFileSync(filePath);
  const password = secretsPassword();

  if (password && buf.length > 44 && !isPlainJsonStore(buf)) {
    try {
      return await decryptSecrets(buf, password);
    } catch (err) {
      throw new Error(`Failed to decrypt secrets store: ${err.message}`);
    }
  }

  // Plain JSON (legacy / default)
  try {
    const text = buf.toString('utf8').trim();
    if (!text) return {};
    return JSON.parse(text) || {};
  } catch {
    if (password) {
      try {
        return await decryptSecrets(buf, password);
      } catch (err) {
        throw new Error(`Secrets file is not valid JSON and AES decrypt failed: ${err.message}`);
      }
    }
    throw new Error('Secrets file is not valid JSON. Set TR_SECRETS_PASSWORD if it is AES-encrypted.');
  }
}

/**
 * Persist secrets object.
 * @param {string} brainDir
 * @param {object} secrets
 */
export async function saveSecrets(brainDir, secrets, { onlyIfMissing = false } = {}) {
  const filePath = resolveSecretsPath(brainDir);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const password = secretsPassword();

  if (!password) throw new Error('TR_SECRETS_PASSWORD or TR_MASTER_PASSWORD is required to write secrets');
  const buf = await encryptSecrets(secrets, password);
  if (onlyIfMissing) installMissingSecretsBuffer(filePath, buf);
  else writeFileSecure(filePath, buf, { mode: 0o600 });
}

/**
 * If secrets.enc is still legacy plain JSON and a password is configured,
 * re-encrypt in place. Safe no-op when already ciphertext or no password.
 *
 * @param {string} brainDir
 * @returns {Promise<{ migrated: boolean, path: string, reason?: string }>}
 */
export async function migrateSecretsToEncryptedIfNeeded(brainDir) {
  const filePath = resolveSecretsPath(brainDir);
  if (!fs.existsSync(filePath)) {
    return { migrated: false, path: filePath, reason: 'missing' };
  }
  const password = secretsPassword();
  if (!password) {
    return { migrated: false, path: filePath, reason: 'no-password' };
  }
  const buf = fs.readFileSync(filePath);
  if (buf.length > 44 && !isPlainJsonStore(buf)) {
    return { migrated: false, path: filePath, reason: 'already-encrypted' };
  }
  let obj;
  try {
    const text = buf.toString('utf8').trim();
    if (!text) return { migrated: false, path: filePath, reason: 'empty' };
    obj = JSON.parse(text);
  } catch {
    return { migrated: false, path: filePath, reason: 'not-json' };
  }
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) {
    return { migrated: false, path: filePath, reason: 'invalid-payload' };
  }
  await saveSecrets(brainDir, obj);
  appendAudit(brainDir, {
    action: 'migrate_encrypt',
    key: '(store)',
    actor: 'system',
  });
  return { migrated: true, path: filePath };
}

export async function validateSecretsBuffer(buffer) {
  const buf = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer);
  const password = secretsPassword();
  if (password && buf.length > 44 && !isPlainJsonStore(buf)) {
    const parsed = await decryptSecrets(buf, password);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new Error('Decrypted secrets payload must be an object');
    }
    return true;
  }
  const parsed = JSON.parse(buf.toString('utf8') || '{}');
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('Secrets payload must be a JSON object');
  }
  return true;
}

/** Validate then atomically replace the encrypted secrets store. */
function installMissingSecretsBuffer(filePath, buffer) {
  const temporary = `${filePath}.${process.pid}.${crypto.randomUUID()}.tmp`;
  try {
    fs.writeFileSync(temporary, buffer, { mode: 0o600, flag: 'wx' });
    // A hard-link publishes the complete encrypted file without replacing a
    // store created by another process while encryption/validation awaited.
    fs.linkSync(temporary, filePath);
  } finally {
    if (fs.existsSync(temporary)) fs.unlinkSync(temporary);
  }
}

export async function replaceSecretsBufferAtomic(brainDir, buffer, { actor = 'mesh-sync', action = 'mesh_sync_replace', onlyIfMissing = false } = {}) {
  await validateSecretsBuffer(buffer);
  const filePath = resolveSecretsPath(brainDir);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  if (onlyIfMissing) {
    installMissingSecretsBuffer(filePath, buffer);
    appendAudit(brainDir, { action, key: '(encrypted-store)', actor });
    return { success: true, path: filePath };
  }
  const tempPath = `${filePath}.${process.pid}.${crypto.randomUUID()}.tmp`;
  try {
    fs.writeFileSync(tempPath, buffer, { mode: 0o600 });
    fs.renameSync(tempPath, filePath);
    fs.chmodSync(filePath, 0o600);
  } finally {
    if (fs.existsSync(tempPath)) fs.rmSync(tempPath, { force: true });
  }
  appendAudit(brainDir, { action, key: '(encrypted-store)', actor });
  return { success: true, path: filePath };
}

export function ensureMeta(secrets) {
  if (!secrets[META_KEY] || typeof secrets[META_KEY] !== 'object') {
    secrets[META_KEY] = { keys: {}, version: 1 };
  }
  if (!secrets[META_KEY].keys) secrets[META_KEY].keys = {};
  return secrets;
}

export function appendAudit(brainDir, event) {
  const auditPath = resolveAuditPath(brainDir);
  fs.mkdirSync(path.dirname(auditPath), { recursive: true });
  const line = JSON.stringify({
    ts: new Date().toISOString(),
    ...event,
    // never include values
  });
  appendFileSecure(auditPath, line + '\n', { mode: 0o600 });
}
