import { importHostModule } from './host-runtime.mjs';
const { loadPluginModule } = await importHostModule('src/core/plugin-runtime.mjs');
export async function FAILOVER_BOUND_MS(...args) { return (await loadPluginModule('mesh', 'leader-election')).FAILOVER_BOUND_MS(...args); }
export async function leaderPin(...args) { return (await loadPluginModule('mesh', 'leader-election')).leaderPin(...args); }
export async function getLeaderInfo(...args) { return (await loadPluginModule('mesh', 'leader-election')).getLeaderInfo(...args); }
export async function isLeader(...args) { return (await loadPluginModule('mesh', 'leader-election')).isLeader(...args); }
export async function tryAcquireLease(...args) { return (await loadPluginModule('mesh', 'leader-election')).tryAcquireLease(...args); }
export async function renewLease(...args) { return (await loadPluginModule('mesh', 'leader-election')).renewLease(...args); }
export async function releaseLease(...args) { return (await loadPluginModule('mesh', 'leader-election')).releaseLease(...args); }
