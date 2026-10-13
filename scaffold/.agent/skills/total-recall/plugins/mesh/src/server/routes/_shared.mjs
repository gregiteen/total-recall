import { importHostModule } from '../../host-runtime.mjs';
const hostModule = await importHostModule('src/server/routes/_shared.mjs');
export const { BRAIN_DIR, serverError } = hostModule;
