/** Native auth-owner router binding; key policy lives in the auth plugin. */
import { loadPluginModule } from '../../core/plugin-runtime.mjs';
import * as store from '../keys.mjs';
import { requireAuth, requireScope } from '../auth.mjs';
import { notFound, badRequest, serverError } from './_shared.mjs';
const { createKeysRouter } = await loadPluginModule('auth', 'keys-router');
export const keysRouter = createKeysRouter({ store, auth: { requireAuth, requireScope }, notFound, badRequest, serverError });
