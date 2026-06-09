import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { runInSandbox } from '../../core/sandbox.mjs';
import {
  requireAuth,
  requireScope,
  sandboxRateLimiter,
  requireSandboxEnabled,
} from '../auth.mjs';
import { logger } from '../../core/logger.mjs';

function badRequest(res, msg) {
  return res.status(400).json({ error: msg });
}

function serverError(res, err) {
  logger.error('sandbox', 'Internal server error', { error: err.message, stack: err.stack });
  return res.status(500).json({ error: 'Internal server error' });
}

export const sandboxRouter = express.Router();

// ─── Sandbox ──────────────────────────────────────────────────────────────────

/**
 * POST /api/sandbox
 * Body: { code }
 */
// Sandbox is rate-limited *before* requireAuth on purpose — limiter keys on
// the authenticated principal when present, so it's IP-bucketed for
// pre-auth misuse and key-bucketed once a PAT is attached.
sandboxRouter.post('/api/sandbox', sandboxRateLimiter(), requireAuth, requireScope('sandbox:run'), requireSandboxEnabled, async (req, res) => {
  try {
    const { code } = req.body || {};
    if (!code) return badRequest(res, 'code is required');

    const tmpDir  = path.join(os.tmpdir(), 'total-recall-sandbox');
    fs.mkdirSync(tmpDir, { recursive: true });
    const script  = path.join(tmpDir, `rest-${Date.now()}.mjs`);
    fs.writeFileSync(script, code);

    const result = await runInSandbox(script, 15000);
    try { fs.unlinkSync(script); } catch {}

    res.json({
      success: result.success,
      exit_code: result.code,
      output: result.output,
    });
  } catch (err) {
    serverError(res, err);
  }
});
