/**
 * Transactional master-password rotation for encrypted Total Recall stores.
 *
 * Secret material stays in process memory. Callers must source the old/new
 * passwords without argv, stdout, logs, or transcripts.
 */

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { decryptSecrets, encryptSecrets } from './crypto.mjs';

const MASTER_KEY = 'TR_SECRETS_PASSWORD';

function assertObject(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Secrets payload must be an object');
  }
  return value;
}

function xmlEscape(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}

function xmlUnescape(value) {
  return String(value)
    .replaceAll('&apos;', "'")
    .replaceAll('&quot;', '"')
    .replaceAll('&gt;', '>')
    .replaceAll('&lt;', '<')
    .replaceAll('&amp;', '&');
}

function parseEnvValue(raw) {
  const value = String(raw).trim();
  if (
    value.length >= 2 &&
    ((value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'")))
  ) {
    return value.slice(1, -1);
  }
  return value;
}

export function readMasterPasswordFromCarrierText(text, type) {
  if (type === 'launchd-plist') {
    const match = String(text).match(
      /<key>\s*TR_SECRETS_PASSWORD\s*<\/key>\s*<string>([\s\S]*?)<\/string>/,
    );
    return match ? xmlUnescape(match[1]) : null;
  }
  if (type === 'env') {
    const line = String(text)
      .split(/\r?\n/)
      .find((entry) => /^\s*(?:export\s+)?TR_SECRETS_PASSWORD\s*=/.test(entry));
    if (!line) return null;
    return parseEnvValue(line.slice(line.indexOf('=') + 1));
  }
  throw new Error(`Unsupported credential carrier type: ${type}`);
}

export function updateMasterPasswordCarrierText(text, type, newPassword, options = {}) {
  if (type === 'launchd-plist') {
    const source = String(text);
    const expression =
      /(<key>\s*TR_SECRETS_PASSWORD\s*<\/key>\s*<string>)[\s\S]*?(<\/string>)/;
    if (expression.test(source)) {
      return source.replace(expression, `$1${xmlEscape(newPassword)}$2`);
    }
    if (!options.allowInsert) {
      throw new Error('LaunchAgent does not define TR_SECRETS_PASSWORD');
    }
    const environment = /(<key>\s*EnvironmentVariables\s*<\/key>\s*<dict>)/;
    if (!environment.test(source)) {
      throw new Error('LaunchAgent does not define an EnvironmentVariables dictionary');
    }
    return source.replace(
      environment,
      `$1\n\t\t<key>${MASTER_KEY}</key>\n\t\t<string>${xmlEscape(newPassword)}</string>`,
    );
  }

  if (type === 'env') {
    const source = String(text);
    const expression = /^\s*(?:export\s+)?TR_SECRETS_PASSWORD\s*=.*$/m;
    const replacement = `${MASTER_KEY}=${newPassword}`;
    if (expression.test(source)) return source.replace(expression, replacement);
    if (!options.allowInsert) throw new Error('Environment file does not define TR_SECRETS_PASSWORD');
    return `${source.replace(/\s*$/, '')}\n${replacement}\n`;
  }

  throw new Error(`Unsupported credential carrier type: ${type}`);
}

export function readMasterPasswordFromCarrier(carrier) {
  const text = fs.readFileSync(carrier.path, 'utf8');
  return readMasterPasswordFromCarrierText(text, carrier.type);
}

export function generateSecretsMasterPassword(bytes = 48) {
  if (!Number.isInteger(bytes) || bytes < 32) {
    throw new Error('Master password generation requires at least 32 random bytes');
  }
  return crypto.randomBytes(bytes).toString('base64url');
}

function looksLikeJson(buffer) {
  const first = buffer.toString('utf8', 0, Math.min(buffer.length, 64)).trimStart()[0];
  return first === '{';
}

async function decodeStore(buffer, oldPassword) {
  if (looksLikeJson(buffer)) {
    return { payload: assertObject(JSON.parse(buffer.toString('utf8') || '{}')), encrypted: false };
  }
  if (!oldPassword) throw new Error('Encrypted secrets store has no current master password');
  return { payload: assertObject(await decryptSecrets(buffer, oldPassword)), encrypted: true };
}

function payloadFingerprint(payload) {
  return crypto.createHash('sha256').update(JSON.stringify(payload)).digest('hex');
}

function writeStagedFile(targetPath, data, mode, transactionId) {
  const stagedPath = `${targetPath}.rekey-${transactionId}.tmp`;
  const fd = fs.openSync(stagedPath, 'wx', mode);
  try {
    fs.writeFileSync(fd, data);
    fs.fsyncSync(fd);
  } finally {
    fs.closeSync(fd);
  }
  fs.chmodSync(stagedPath, mode);
  return stagedPath;
}

function fsyncDirectory(targetPath) {
  let fd;
  try {
    fd = fs.openSync(path.dirname(targetPath), 'r');
    fs.fsyncSync(fd);
  } catch {
    // Some filesystems do not allow directory fsync. File fsync + atomic rename
    // still provides the strongest portable behavior available here.
  } finally {
    if (fd !== undefined) fs.closeSync(fd);
  }
}

/**
 * Re-encrypt stores and update persistent credential carriers as one rollback-
 * protected transaction. Backups encrypted with the old password are deleted
 * immediately after verification succeeds.
 */
export async function rekeySecretsTransaction({
  storePaths,
  carriers,
  oldPassword,
  newPassword,
  allowStoreOnly = false,
}) {
  const uniqueStores = [...new Set((storePaths || []).filter(Boolean))];
  const uniqueCarriers = [...new Map((carriers || []).map((item) => [item.path, item])).values()];
  if (!uniqueStores.length) throw new Error('No secrets stores were provided');
  if (!uniqueCarriers.length && !allowStoreOnly) {
    throw new Error('No persistent credential carriers were provided');
  }
  if (!oldPassword) throw new Error('Current master password is required');
  if (!newPassword || newPassword.length < 32 || newPassword === oldPassword) {
    throw new Error('New master password must be distinct and at least 32 characters');
  }

  const targets = new Set();
  for (const targetPath of [...uniqueStores, ...uniqueCarriers.map((item) => item.path)]) {
    if (targets.has(targetPath)) throw new Error(`Duplicate rekey target: ${targetPath}`);
    targets.add(targetPath);
  }

  const transactionId = crypto.randomUUID();
  const writes = [];
  const storeChecks = [];

  try {
    for (const storePath of uniqueStores) {
      if (!fs.existsSync(storePath)) continue;
      const original = fs.readFileSync(storePath);
      const decoded = await decodeStore(original, oldPassword);
      const encrypted = await encryptSecrets(decoded.payload, newPassword);
      const verified = assertObject(await decryptSecrets(encrypted, newPassword));
      const expectedFingerprint = payloadFingerprint(decoded.payload);
      if (payloadFingerprint(verified) !== expectedFingerprint) {
        throw new Error(`Rekey verification failed for ${storePath}`);
      }
      writes.push({
        path: storePath,
        original,
        mode: 0o600,
        staged: writeStagedFile(storePath, encrypted, 0o600, transactionId),
      });
      storeChecks.push({
        path: storePath,
        expectedFingerprint,
        keys: Object.keys(decoded.payload).length,
      });
    }
    if (!storeChecks.length) throw new Error('None of the provided secrets stores exist');

    for (const carrier of uniqueCarriers) {
      const original = fs.readFileSync(carrier.path);
      const source = original.toString('utf8');
      const current = readMasterPasswordFromCarrierText(source, carrier.type);
      if (current && current !== oldPassword) {
        throw new Error(`Credential carrier does not match the current master password: ${carrier.path}`);
      }
      if (!current && !carrier.allowInsert) {
        throw new Error(`Credential carrier is missing TR_SECRETS_PASSWORD: ${carrier.path}`);
      }
      const updated = updateMasterPasswordCarrierText(source, carrier.type, newPassword, {
        allowInsert: carrier.allowInsert,
      });
      if (readMasterPasswordFromCarrierText(updated, carrier.type) !== newPassword) {
        throw new Error(`Credential carrier verification failed: ${carrier.path}`);
      }
      const mode = fs.statSync(carrier.path).mode & 0o777;
      writes.push({
        path: carrier.path,
        original,
        mode,
        staged: writeStagedFile(carrier.path, updated, mode, transactionId),
      });
    }

    for (const write of writes) {
      write.backup = `${write.path}.rekey-${transactionId}.backup`;
      fs.copyFileSync(write.path, write.backup, fs.constants.COPYFILE_EXCL);
      fs.chmodSync(write.backup, write.mode);
    }

    const applied = [];
    try {
      for (const write of writes) {
        fs.renameSync(write.staged, write.path);
        fs.chmodSync(write.path, write.mode);
        fsyncDirectory(write.path);
        applied.push(write);
      }

      for (const check of storeChecks) {
        const current = fs.readFileSync(check.path);
        const verified = assertObject(await decryptSecrets(current, newPassword));
        if (payloadFingerprint(verified) !== check.expectedFingerprint) {
          throw new Error(`Post-commit verification failed for ${check.path}`);
        }
        let oldPasswordAccepted = false;
        try {
          await decryptSecrets(current, oldPassword);
          oldPasswordAccepted = true;
        } catch {
          // Expected: AES-GCM authentication rejects the retired key.
        }
        if (oldPasswordAccepted) throw new Error(`Retired master password still decrypts ${check.path}`);
      }

      for (const carrier of uniqueCarriers) {
        if (readMasterPasswordFromCarrier(carrier) !== newPassword) {
          throw new Error(`Post-commit credential carrier verification failed: ${carrier.path}`);
        }
      }
    } catch (error) {
      for (const write of applied.reverse()) {
        if (write.backup && fs.existsSync(write.backup)) {
          fs.renameSync(write.backup, write.path);
          fs.chmodSync(write.path, write.mode);
          fsyncDirectory(write.path);
        }
      }
      throw error;
    }

    for (const write of writes) {
      if (write.backup && fs.existsSync(write.backup)) fs.rmSync(write.backup, { force: true });
    }

    return {
      stores: storeChecks.map(({ path: storePath, keys }) => ({ path: storePath, keys })),
      carriers: uniqueCarriers.map((carrier) => ({ path: carrier.path, type: carrier.type })),
      old_password_rejected: true,
    };
  } finally {
    for (const write of writes) {
      if (write.staged && fs.existsSync(write.staged)) fs.rmSync(write.staged, { force: true });
      if (write.backup && fs.existsSync(write.backup)) fs.rmSync(write.backup, { force: true });
    }
  }
}
