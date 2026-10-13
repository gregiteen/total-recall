import { importHostModule } from './host-runtime.mjs';
const hostModule = await importHostModule('src/core/project-id.mjs');
export const { readProjectId, ensureProjectId, repairProjectIds } = hostModule;
