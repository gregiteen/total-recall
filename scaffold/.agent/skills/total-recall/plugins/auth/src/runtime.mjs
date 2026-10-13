import { importHostModule } from './host-runtime.mjs';
const hostModule = await importHostModule('src/core/runtime.mjs');
export const { findBinaryInPath, loadRuntimeConfig, checkRuntimeHealth, loadDynamicSecrets, callLocalRuntime, callLocalRuntimeRaw, cleanAndParseJSON } = hostModule;
