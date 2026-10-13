// Compatibility bindings only; implementation is owned by the installed plugin.
import { loadPluginModule, unavailablePluginOperation } from './plugin-runtime.mjs';
const owner = await loadPluginModule('mesh', 'leader-election');
export const FAILOVER_BOUND_MS = owner.FAILOVER_BOUND_MS;
export const leaderPin = owner.leaderPin;
export const getLeaderInfo = owner.getLeaderInfo;
export const isLeader = owner.isLeader;
export const tryAcquireLease = owner.tryAcquireLease;
export const renewLease = owner.renewLease;
export const releaseLease = owner.releaseLease;
