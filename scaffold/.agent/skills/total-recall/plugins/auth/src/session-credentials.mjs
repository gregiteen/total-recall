import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcrypt';
import { loadSecretsSync, saveSecretsSync } from './secrets-gateway.mjs';

export const BCRYPT_COST = 12;
const keys = { dashboard: 'SESSION_SECRET', 'step-up': 'SESSION_SECRET', collaboration: 'COLLAB_SESSION_SECRET' };

/** Credential operations never expose signing material or use alternate stores. */
export function createSessionCredentials({ brainDir, load = loadSecretsSync, save = saveSecretsSync } = {}) {
  if (!brainDir) throw new Error('An explicit auth store is required');
  const signingKey = purpose => {
    if (!Object.hasOwn(keys, purpose)) throw new Error('Unsupported token purpose');
    const value = load(brainDir)[keys[purpose]];
    if (typeof value !== 'string' || Buffer.byteLength(value) < 32) throw new Error('Required auth signing credential is missing or invalid; initialize it through auth');
    return value;
  };
  return {
    async registerCollaborationPassword(username, password) {
      if (typeof username !== 'string' || !/^[A-Za-z0-9_.@-]{1,128}$/.test(username) || typeof password !== 'string' || password.length < 8 || password.length > 4096) throw new Error('Invalid collaboration credential');
      const hash = await bcrypt.hash(password, BCRYPT_COST);
      const values = load(brainDir);
      const hashes = values.collaboration_password_hashes || {};
      const key = username.toLowerCase();
      if (Object.hasOwn(hashes, key)) throw new Error('User already exists');
      values.collaboration_password_hashes = { ...hashes, [key]: hash };
      save(brainDir, values);
      return { registered: true };
    },
    async verifyCollaborationPassword(username, password) {
      if (typeof username !== 'string' || typeof password !== 'string' || password.length > 4096) return false;
      const hashes = load(brainDir).collaboration_password_hashes || {};
      const hash = Object.hasOwn(hashes, username.toLowerCase()) ? hashes[username.toLowerCase()] : null;
      return typeof hash === 'string' ? bcrypt.compare(password, hash) : false;
    },
    signToken(purpose, payload, { ttlSeconds = 86400 } = {}) {
      if (!Number.isInteger(ttlSeconds) || ttlSeconds < 15 || ttlSeconds > 604800) throw new Error('Invalid token lifetime');
      return jwt.sign(payload, signingKey(purpose), { algorithm: 'HS256', expiresIn: ttlSeconds, audience: purpose, issuer: 'total-recall-auth' });
    },
    verifyToken(purpose, token) {
      return jwt.verify(token, signingKey(purpose), { algorithms: ['HS256'], audience: purpose, issuer: 'total-recall-auth' });
    },
    dashboardState() {
      const values = load(brainDir);
      return { configured: typeof values.dashboard_password_hash === 'string' && values.dashboard_password_hash.length > 0, forcePasswordReset: values.dashboard_force_password_reset === true };
    },
    async verifyDashboardPassword(password) {
      if (typeof password !== 'string' || !password || password.length > 4096) return false;
      const hash = load(brainDir).dashboard_password_hash;
      return typeof hash === 'string' && hash.length > 0 ? bcrypt.compare(password, hash) : false;
    },
    async setDashboardPassword(password, { forcePasswordReset = false } = {}) {
      if (typeof password !== 'string' || password.length < 8 || password.length > 4096) throw new Error('Invalid password length');
      const hash = await bcrypt.hash(password, BCRYPT_COST);
      // Read after bcrypt; preserve updates completed while hashing. One encrypted commit.
      const values = load(brainDir);
      values.dashboard_password_hash = hash;
      values.dashboard_force_password_reset = forcePasswordReset === true;
      values.SESSION_SECRET = crypto.randomBytes(32).toString('hex');
      save(brainDir, values);
      return { updated: true, sessionsInvalidated: true };
    },
    rotateSession(purpose = 'dashboard') {
      if (!Object.hasOwn(keys, purpose)) throw new Error('Unsupported token purpose');
      const values = load(brainDir);
      values[keys[purpose]] = crypto.randomBytes(32).toString('hex');
      save(brainDir, values);
      return { rotated: true, key: keys[purpose] };
    },
  };
}
