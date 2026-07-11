/**
 * WebAuthn / passkey credential store for Total Recall dashboard.
 *
 * Credentials live under <brain>/config/webauthn.json (mode 0600).
 * Challenges are in-memory only (short TTL).
 * Never store secret values here — only authenticator public keys.
 */

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {
  generateRegistrationOptions,
  verifyRegistrationResponse,
  generateAuthenticationOptions,
  verifyAuthenticationResponse,
} from '@simplewebauthn/server';

const CHALLENGE_TTL_MS = 5 * 60 * 1000;
/** @type {Map<string, { challenge: string, type: string, exp: number }>} */
const challenges = new Map();

const DASHBOARD_USER = {
  id: Buffer.from('total-recall-dashboard-owner'),
  name: 'dashboard',
  displayName: 'Total Recall Owner',
};

export function resolveWebAuthnPath(brainDir) {
  return path.join(brainDir, 'config', 'webauthn.json');
}

function loadStore(brainDir) {
  const filePath = resolveWebAuthnPath(brainDir);
  if (!fs.existsSync(filePath)) {
    return { version: 1, credentials: [] };
  }
  try {
    const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    if (!data || !Array.isArray(data.credentials)) {
      return { version: 1, credentials: [] };
    }
    return data;
  } catch {
    return { version: 1, credentials: [] };
  }
}

function saveStore(brainDir, store) {
  const filePath = resolveWebAuthnPath(brainDir);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(store, null, 2) + '\n', {
    encoding: 'utf8',
    mode: 0o600,
  });
}

export function listPasskeys(brainDir) {
  const store = loadStore(brainDir);
  return store.credentials.map((c) => ({
    id: c.id,
    created_at: c.created_at || null,
    transports: c.transports || [],
    deviceType: c.deviceType || null,
    backedUp: !!c.backedUp,
    label: c.label || 'Passkey',
  }));
}

export function hasPasskeys(brainDir) {
  return loadStore(brainDir).credentials.length > 0;
}

function putChallenge(key, challenge, type) {
  challenges.set(key, { challenge, type, exp: Date.now() + CHALLENGE_TTL_MS });
}

function takeChallenge(key, type) {
  const row = challenges.get(key);
  challenges.delete(key);
  if (!row) return null;
  if (row.exp < Date.now()) return null;
  if (type && row.type !== type) return null;
  return row.challenge;
}

/**
 * Derive rpID + origin from the request (localhost-safe).
 */
export function resolveRpFromRequest(req) {
  const rawHost = String(req.get('x-forwarded-host') || req.get('host') || 'localhost:3000');
  const host = rawHost.split(',')[0].trim();
  let hostname = host.split(':')[0] || 'localhost';
  // WebAuthn: 127.0.0.1 is awkward; prefer localhost
  if (hostname === '127.0.0.1') hostname = 'localhost';

  const protoHeader = req.get('x-forwarded-proto');
  const proto =
    protoHeader?.split(',')[0]?.trim() ||
    (req.secure || process.env.NODE_ENV === 'production' ? 'https' : 'http');

  // Rebuild origin; map 127.0.0.1 → localhost for WebAuthn origin match
  let originHost = host.replace(/^127\.0\.0\.1/, 'localhost');
  const origin = `${proto}://${originHost}`;

  return {
    rpID: hostname,
    rpName: 'Total Recall',
    origin,
  };
}

function challengeKey(req, kind) {
  const sid = req.auth?.type || 'anon';
  return `${kind}:${sid}:${req.ip || 'local'}`;
}

/**
 * @param {string} brainDir
 * @param {import('express').Request} req
 */
export async function beginRegistration(brainDir, req) {
  const { rpID, rpName } = resolveRpFromRequest(req);
  const store = loadStore(brainDir);
  const options = await generateRegistrationOptions({
    rpName,
    rpID,
    userName: DASHBOARD_USER.name,
    userDisplayName: DASHBOARD_USER.displayName,
    userID: DASHBOARD_USER.id,
    attestationType: 'none',
    excludeCredentials: store.credentials.map((c) => ({
      id: c.id,
      transports: c.transports,
    })),
    authenticatorSelection: {
      residentKey: 'preferred',
      userVerification: 'preferred',
      authenticatorAttachment: 'platform',
    },
  });
  putChallenge(challengeKey(req, 'reg'), options.challenge, 'reg');
  return options;
}

/**
 * @param {string} brainDir
 * @param {import('express').Request} req
 * @param {object} response - browser registration response JSON
 * @param {{ label?: string }} opts
 */
export async function finishRegistration(brainDir, req, response, opts = {}) {
  const expectedChallenge = takeChallenge(challengeKey(req, 'reg'), 'reg');
  if (!expectedChallenge) {
    throw new Error('Registration challenge expired or missing. Try again.');
  }
  const { rpID, origin } = resolveRpFromRequest(req);
  const verification = await verifyRegistrationResponse({
    response,
    expectedChallenge,
    expectedOrigin: origin,
    expectedRPID: rpID,
    requireUserVerification: false,
  });
  if (!verification.verified || !verification.registrationInfo) {
    throw new Error('Passkey registration failed verification');
  }

  const { credential, credentialDeviceType, credentialBackedUp } = verification.registrationInfo;
  const store = loadStore(brainDir);
  const id = credential.id;
  // Replace if same id re-registered
  store.credentials = store.credentials.filter((c) => c.id !== id);
  store.credentials.push({
    id,
    publicKey: Buffer.from(credential.publicKey).toString('base64url'),
    counter: credential.counter ?? 0,
    transports: response.response?.transports || credential.transports || [],
    deviceType: credentialDeviceType,
    backedUp: !!credentialBackedUp,
    label: opts.label || 'Passkey',
    created_at: new Date().toISOString(),
  });
  saveStore(brainDir, store);
  return { id, verified: true };
}

/**
 * @param {string} brainDir
 * @param {import('express').Request} req
 */
export async function beginAuthentication(brainDir, req) {
  const store = loadStore(brainDir);
  if (!store.credentials.length) {
    throw new Error('No passkeys registered. Register a passkey first.');
  }
  const { rpID } = resolveRpFromRequest(req);
  const options = await generateAuthenticationOptions({
    rpID,
    userVerification: 'preferred',
    allowCredentials: store.credentials.map((c) => ({
      id: c.id,
      transports: c.transports,
    })),
  });
  putChallenge(challengeKey(req, 'auth'), options.challenge, 'auth');
  return options;
}

/**
 * @param {string} brainDir
 * @param {import('express').Request} req
 * @param {object} response
 */
export async function finishAuthentication(brainDir, req, response) {
  const expectedChallenge = takeChallenge(challengeKey(req, 'auth'), 'auth');
  if (!expectedChallenge) {
    throw new Error('Authentication challenge expired or missing. Try again.');
  }
  const store = loadStore(brainDir);
  const credId = response?.id;
  const stored = store.credentials.find((c) => c.id === credId);
  if (!stored) {
    throw new Error('Unknown passkey credential');
  }
  const { rpID, origin } = resolveRpFromRequest(req);

  const verification = await verifyAuthenticationResponse({
    response,
    expectedChallenge,
    expectedOrigin: origin,
    expectedRPID: rpID,
    credential: {
      id: stored.id,
      publicKey: Buffer.from(stored.publicKey, 'base64url'),
      counter: stored.counter || 0,
      transports: stored.transports,
    },
    requireUserVerification: false,
  });

  if (!verification.verified) {
    throw new Error('Passkey authentication failed');
  }

  const newCounter = verification.authenticationInfo?.newCounter;
  if (typeof newCounter === 'number') {
    stored.counter = newCounter;
    saveStore(brainDir, store);
  }

  return {
    verified: true,
    credentialId: stored.id,
  };
}

export function deletePasskey(brainDir, credentialId) {
  const store = loadStore(brainDir);
  const before = store.credentials.length;
  store.credentials = store.credentials.filter((c) => c.id !== credentialId);
  if (store.credentials.length === before) {
    return { found: false };
  }
  saveStore(brainDir, store);
  return { found: true, deleted: true };
}

/** Test helper */
export function _clearChallengesForTests() {
  challenges.clear();
}
