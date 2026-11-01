/** Required auth plugin adapter for dashboard authentication routes. */
import express from 'express';
import * as auth from '../auth.mjs';
import { logger } from '../../core/logger.mjs';
import { BRAIN_DIR } from './_shared.mjs';
import { loadPluginModule } from '../../core/plugin-runtime.mjs';
const { createAuthRouter } = await loadPluginModule('auth', 'auth-router');
const pluginRouter = createAuthRouter({ auth, logger, BRAIN_DIR });

/**
 * Total Recall has no Google sign-in: the plugin serves it for apps that do,
 * so this router refuses those routes and drops Google from provider discovery.
 */
export const authRouter = express.Router();
authRouter.use('/auth/google', (_req, res) => res.status(404).json({ error: 'Google sign-in is not available in Total Recall' }));
authRouter.get('/auth/providers', (req, res, next) => {
  const json = res.json.bind(res);
  res.json = (body) => {
    if (body && typeof body === 'object') delete body.google;
    return json(body);
  };
  next();
});
authRouter.get('/auth/status', (req, res, next) => {
  const json = res.json.bind(res);
  res.json = (body) => json({ ...body, login_required: auth.loginRequired() });
  next();
});
authRouter.use(pluginRouter);
