/** Required auth plugin adapter for dashboard authentication routes. */
import * as auth from '../auth.mjs';
import { logger } from '../../core/logger.mjs';
import { BRAIN_DIR } from './_shared.mjs';
import { loadPluginModule } from '../../core/plugin-runtime.mjs';
const { createAuthRouter } = await loadPluginModule('auth', 'auth-router');
export const authRouter = createAuthRouter({ auth, logger, BRAIN_DIR });
