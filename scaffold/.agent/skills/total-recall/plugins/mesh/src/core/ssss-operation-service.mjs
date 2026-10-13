import { importHostModule } from '../host-runtime.mjs';
const hostModule = await importHostModule('src/core/ssss-operation-service.mjs');
export const { appendVfsEvent, listVfsEvents } = hostModule;
