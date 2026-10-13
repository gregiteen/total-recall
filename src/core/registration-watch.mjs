// Compatibility bindings only; implementation is owned by the installed plugin.
import { loadPluginModule, unavailablePluginOperation } from './plugin-runtime.mjs';
const owner = await loadPluginModule('mesh', 'registration-watch');
export const resolveLogSource = owner.resolveLogSource;
export const latestAuthId = owner.latestAuthId;
export const getWatchStatus = owner.getWatchStatus;
export const clearWatchResult = owner.clearWatchResult;
export const stopWatch = owner.stopWatch;
export const startWatch = owner.startWatch;
