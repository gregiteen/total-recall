import { importHostModule } from '../host-runtime.mjs';
const hostModule = await importHostModule('src/cli/agent-dir.mjs');
export const { resolveBrainDir, parseLayerFlag } = hostModule;
