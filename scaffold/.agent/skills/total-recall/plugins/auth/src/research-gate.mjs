import { importHostModule } from './host-runtime.mjs';
const hostModule = await importHostModule('src/core/research-gate.mjs');
export const { AUTONOMOUS_DEFAULTS, resolveAutonomousConfig, loadAutonomousConfig, requestResearch, defaultCoverageCheck, proposeAutonomousResearch } = hostModule;
