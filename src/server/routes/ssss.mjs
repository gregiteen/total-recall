/**
 * SSSS Routes
 * Extracted from rest.mjs
 */
import { Router } from 'express';
import { requireAuth, requireScope } from '../auth.mjs';
import { processOperationAsync } from '../../core/operation-validator.mjs';
import { invalidate } from '../../core/vault-cache.mjs';
import {
  resolveVaultFromQuery,
} from './_shared.mjs';

const router = Router();

export const ssssOperationHandler = async (req, res) => {
  try {
    const vaultRoot = resolveVaultFromQuery(req);
    const submittedEnvelope = req.body || {};
    // HTTP authentication is the trust boundary. Never preserve a caller's
    // self-asserted actor role in the committed envelope or authorization step.
    const actorRole = req.auth?.role || 'admin';
    const envelope = {
      ...submittedEnvelope,
      actor: { role: actorRole },
    };
    const result = await processOperationAsync(envelope, vaultRoot, { agentRole: actorRole });
    if (!result.success) return res.status(400).json(result);
    invalidate(vaultRoot);
    return res.status(envelope.type === 'operation' ? 201 : 200).json(result);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};

router.post(
  '/api/v1/ssss',
  requireAuth,
  requireScope('ssss:write'),
  ssssOperationHandler,
);

export { router as ssssRouter };
export default router;
