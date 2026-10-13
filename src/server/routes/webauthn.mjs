/** Required auth plugin adapter for passkey routes. */
import * as auth from '../auth.mjs';
import { badRequest, serverError, BRAIN_DIR } from './_shared.mjs';
import { logger } from '../../core/logger.mjs';
import { loadPluginModule } from '../../core/plugin-runtime.mjs';
const { createWebauthnRouter } = await loadPluginModule('auth', 'webauthn-router');
export const webauthnRouter = createWebauthnRouter({ auth, badRequest, serverError, BRAIN_DIR, logger });
