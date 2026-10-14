import express from 'express';
/** Owner API; host injects the selected key store and authentication boundary. */
export function createKeysRouter({ store, auth, notFound, badRequest, serverError }) {
const { issueKey, revokeKey, loadKeys, loadRoles, setRole, listKeyUsage, keyHasScope } = store;
const { requireAuth, requireScope } = auth;
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
    const { name, scopes, expires_at, role, kind } = req.body || {};
    if (!name) return badRequest(res, 'name is required');
    const key = issueKey(name, { scopes, expires_at, role, kind, issuer: req.auth?.type === 'pat' ? req.auth : undefined });
    res.set('Cache-Control', 'no-store');
    res.status(201).json({
      id:           key.id,
      name:         key.name,
      token:        key.token,           // only time it's returned in plaintext
      token_prefix: key.token_prefix,
      scopes:       key.scopes,
      role:         key.role,
      expires_at:   key.expires_at,
      created_at:   key.created_at,
      _warning:     'Save this token — it will not be shown again.',
    });
  } catch (err) {
    serverError(res, err);
  }
});

router.get('/api/key-roles', requireAuth, requireScope('keys:read'), (_req, res) => {
  try { res.json({ roles: loadRoles() }); } catch (err) { serverError(res, err); }
});
router.put('/api/key-roles/:name', requireAuth, requireScope('keys:write'), (req, res) => {
  if (req.auth?.type !== 'dashboard_session' && !keyHasScope(req.auth, '*')) return res.status(403).json({ error: 'Role policy requires administrator permissions' });
  try { res.json(setRole(req.params.name, req.body?.scopes)); } catch (err) { badRequest(res, err.message); }
});
router.get('/api/keys/:id/usage', requireAuth, requireScope('keys:read'), (req, res) => {
  try { res.json({ events: listKeyUsage(req.params.id) }); } catch (err) { serverError(res, err); }
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

return router;
}
