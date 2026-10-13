import { importHostModule } from './host-runtime.mjs';
const hostModule = await importHostModule('src/core/throttled-fetch.mjs');
export const { loadFirewallPolicy, blockDomain, unblockDomain, getAuditLog, throttledFetch, safeFetch, getGateStats, resetGateStats, resetGateStateForTests, setFirewallReady } = hostModule;
