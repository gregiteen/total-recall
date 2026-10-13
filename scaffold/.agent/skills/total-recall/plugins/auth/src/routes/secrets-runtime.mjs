import { importHostModule } from '../host-runtime.mjs';
import { createSecretsRouter } from './secrets.mjs';
const auth = await importHostModule('src/server/auth.mjs');
const shared = await importHostModule('src/server/routes/_shared.mjs');
export default createSecretsRouter({ ...auth, ...shared });
