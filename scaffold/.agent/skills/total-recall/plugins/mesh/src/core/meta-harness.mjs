import { importHostModule } from '../host-runtime.mjs';
const hostModule = await importHostModule('src/core/meta-harness.mjs');
export const { detectHarnesses } = hostModule;
