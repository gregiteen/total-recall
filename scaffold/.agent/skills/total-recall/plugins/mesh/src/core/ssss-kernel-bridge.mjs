import { importHostModule } from '../host-runtime.mjs';
const hostModule = await importHostModule('src/core/ssss-kernel-bridge.mjs');
export const { processViaPackageKernel } = hostModule;
