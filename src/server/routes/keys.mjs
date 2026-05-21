/**
 * /api/keys/* routes — Personal Access Tokens
 *
 * - GET    /api/keys          list (no raw tokens)
 * - POST   /api/keys          issue (returns raw token once)
 * - DELETE /api/keys/:id      revoke
 */

import express from 'express';
import { issueKey, revokeKey, loadKeys } from '../keys.mjs';
import { requireAuth, requireScope } from '../auth.mjs';
import { notFound, badRequest, serverError } from './_shared.mjs';

const router = express.Router();

router.get('/api/keys', requireAuth, requireScope('keys:read'), (req, res) => {
  try {
    const keys = loadKeys().map(({ token_hash, ...k }) => k);
    res.json({ keys });
  } catch (err) {
    serverError(res, err);
  }
});

router.post('/api/keys', requireAuth, requireScope('keys:write'), (req, res) => {
  try {
    const { name, scopes, expires_at } = req.body || {};
    if (!name) return badRequest(res, 'name is required');
    const key = issueKey(name, { scopes, expires_at });
    res.status(201).json({
      id:           key.id,
      name:         key.name,
      token:        key.token,           // only time it's returned in plaintext
      token_prefix: key.token_prefix,
      scopes:       key.scopes,
      expires_at:   key.expires_at,
      created_at:   key.created_at,
      _warning:     'Save this token — it will not be shown again.',
    });
  } catch (err) {
    serverError(res, err);
  }
});

router.delete('/api/keys/:id', requireAuth, requireScope('keys:write'), (req, res) => {
  try {
    const key = revokeKey(req.params.id);
    if (!key) return notFound(res, `Key not found: ${req.params.id}`);
    res.json({ revoked: true, id: key.id, name: key.name });
  } catch (err) {
    serverError(res, err);
  }
});

export { router as keysRouter };
