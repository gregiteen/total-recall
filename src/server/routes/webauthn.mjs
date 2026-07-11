/**
 * WebAuthn / passkey routes for dashboard step-up (secret reveal).
 *
 * - GET  /api/webauthn/status
 * - POST /api/webauthn/register/options
 * - POST /api/webauthn/register/verify
 * - POST /api/webauthn/assert/options
 * - POST /api/webauthn/assert/verify   → { step_up_token }
 * - POST /api/webauthn/step-up/password → { step_up_token } (fallback if no passkeys)
 * - DELETE /api/webauthn/credentials/:id
 */

import express from 'express';
import { requireAuth, requireScope, mintStepUpToken, verifyDashboardPassword } from '../auth.mjs';
import { badRequest, serverError, BRAIN_DIR } from './_shared.mjs';
import {
  listPasskeys,
  hasPasskeys,
  beginRegistration,
  finishRegistration,
  beginAuthentication,
  finishAuthentication,
  deletePasskey,
  resolveWebAuthnPath,
} from '../../core/webauthn-store.mjs';
import { logger } from '../../core/logger.mjs';

const router = express.Router();

function brainDir() {
  return process.env.TR_SECRETS_BRAIN || BRAIN_DIR;
}

router.get('/api/webauthn/status', requireAuth, requireScope('keys:read', 'config:read'), (req, res) => {
  try {
    const dir = brainDir();
    const passkeys = listPasskeys(dir);
    res.json({
      enabled: true,
      has_passkeys: passkeys.length > 0,
      count: passkeys.length,
      passkeys,
      store: resolveWebAuthnPath(dir),
      // When false, UI may offer password re-entry as step-up fallback
      password_step_up_allowed: true,
    });
  } catch (err) {
    serverError(res, err);
  }
});

router.post(
  '/api/webauthn/register/options',
  requireAuth,
  requireScope('keys:write', 'config:write'),
  async (req, res) => {
    try {
      const options = await beginRegistration(brainDir(), req);
      res.json(options);
    } catch (err) {
      logger.warn('webauthn', `register options failed: ${err.message}`);
      return badRequest(res, err.message);
    }
  },
);

router.post(
  '/api/webauthn/register/verify',
  requireAuth,
  requireScope('keys:write', 'config:write'),
  async (req, res) => {
    try {
      const body = req.body || {};
      const response = body.response || body;
      if (!response?.id) return badRequest(res, 'WebAuthn registration response required');
      const result = await finishRegistration(brainDir(), req, response, {
        label: body.label,
      });
      res.status(201).json({
        ...result,
        passkeys: listPasskeys(brainDir()),
      });
    } catch (err) {
      logger.warn('webauthn', `register verify failed: ${err.message}`);
      return badRequest(res, err.message);
    }
  },
);

router.post(
  '/api/webauthn/assert/options',
  requireAuth,
  requireScope('keys:read', 'config:read'),
  async (req, res) => {
    try {
      const options = await beginAuthentication(brainDir(), req);
      res.json(options);
    } catch (err) {
      return badRequest(res, err.message);
    }
  },
);

router.post(
  '/api/webauthn/assert/verify',
  requireAuth,
  requireScope('keys:read', 'config:read'),
  async (req, res) => {
    try {
      const body = req.body || {};
      const response = body.response || body;
      if (!response?.id) return badRequest(res, 'WebAuthn authentication response required');
      const result = await finishAuthentication(brainDir(), req, response);
      const step_up_token = mintStepUpToken({
        purpose: body.purpose || 'secrets:reveal',
        ttlSeconds: body.ttl_seconds || 60,
        actor: 'passkey',
      });
      logger.info('webauthn', 'Passkey step-up granted', {
        credentialId: result.credentialId,
        purpose: body.purpose || 'secrets:reveal',
      });
      res.json({
        verified: true,
        step_up_token,
        expires_in: body.ttl_seconds || 60,
      });
    } catch (err) {
      logger.warn('webauthn', `assert verify failed: ${err.message}`);
      return badRequest(res, err.message);
    }
  },
);

/** Password re-entry step-up (works always; preferred when no passkeys). */
router.post(
  '/api/webauthn/step-up/password',
  requireAuth,
  requireScope('keys:read', 'config:read'),
  async (req, res) => {
    try {
      const password = req.body?.password;
      if (!password) return badRequest(res, 'password is required');
      const ok = await verifyDashboardPassword(password);
      if (!ok) {
        return res.status(401).json({ error: 'Invalid password' });
      }
      // If passkeys exist, still allow password as fallback but log it
      if (hasPasskeys(brainDir())) {
        logger.info('webauthn', 'Password step-up used while passkeys registered');
      }
      const step_up_token = mintStepUpToken({
        purpose: req.body?.purpose || 'secrets:reveal',
        ttlSeconds: req.body?.ttl_seconds || 60,
        actor: 'password',
      });
      res.json({
        verified: true,
        method: 'password',
        step_up_token,
        expires_in: req.body?.ttl_seconds || 60,
      });
    } catch (err) {
      serverError(res, err);
    }
  },
);

router.delete(
  '/api/webauthn/credentials/:id',
  requireAuth,
  requireScope('keys:write', 'config:write'),
  (req, res) => {
    try {
      const r = deletePasskey(brainDir(), req.params.id);
      if (!r.found) return res.status(404).json({ error: 'Passkey not found' });
      res.json({ deleted: true, passkeys: listPasskeys(brainDir()) });
    } catch (err) {
      serverError(res, err);
    }
  },
);

export { router as webauthnRouter };
