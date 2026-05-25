import crypto from 'crypto';
import { promisify } from 'node:util';
import fs from 'fs';
import path from 'path';
import os from 'os';

import { brainDir } from './config.mjs';

const ALGORITHM = 'aes-256-gcm';
const BRAIN_DIR = brainDir;
const SECRETS_FILE = path.join(BRAIN_DIR, 'config', 'secrets.enc');

const scryptAsync = promisify(crypto.scrypt);

/**
 * Derives a 32-byte encryption key from a master password using scrypt
 * (Node built-in — no native dependency required).
 *
 * Parameters chosen for ~64 MB of memory, matching OWASP scrypt guidance.
 */
export async function deriveKey(password, salt) {
  return scryptAsync(password, salt, 32, {
    N: 2 ** 16, // CPU/memory cost: 65536
    r: 8,
    p: 1,
    maxmem: 128 * 1024 * 1024
  });
}

/**
 * Encrypts a JSON object into a buffer.
 * Format: [16 bytes salt][12 bytes IV][ciphertext][16 bytes auth tag]
 */
export async function encryptSecrets(secretsObj, password) {
  const salt = crypto.randomBytes(16);
  const key = await deriveKey(password, salt);
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

export async function writeSecrets(secretsObj, password) {
  const buf = await encryptSecrets(secretsObj, password);
  fs.mkdirSync(path.dirname(SECRETS_FILE), { recursive: true });
  fs.writeFileSync(SECRETS_FILE, buf, { mode: 0o600 });
}

export async function readSecrets(password) {
  if (!fs.existsSync(SECRETS_FILE)) {
    return null;
  }
  const buf = fs.readFileSync(SECRETS_FILE);
  return await decryptSecrets(buf, password);
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
  const sign = crypto.createSign('sha512');
  sign.update(payload);
  sign.end();
  return sign.sign(privateKeyPem, 'base64');
}

/**
 * Verifies a signature using an Ed25519 public key.
 */
export function verifySignature(payload, signatureBase64, publicKeyPem) {
  const verify = crypto.createVerify('sha512');
  verify.update(payload);
  verify.end();
  return verify.verify(publicKeyPem, signatureBase64, 'base64');
}
