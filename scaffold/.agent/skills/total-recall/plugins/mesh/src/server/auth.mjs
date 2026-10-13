import { importHostModule } from '../host-runtime.mjs';
const hostModule = await importHostModule('src/server/auth.mjs');
export const { requireAuth, requireScope } = hostModule;
