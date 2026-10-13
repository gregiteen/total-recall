// Compatibility bindings only; implementation is owned by the installed plugin.
import { loadPluginModule, unavailablePluginOperation } from './plugin-runtime.mjs';
const owner = await loadPluginModule('mesh', 'mesh-activity');
export const getLocalIdleSeconds = owner.getLocalIdleSeconds;
export const detectActiveSurface = owner.detectActiveSurface;
export const getLocalPresence = owner.getLocalPresence;
export const resolveActiveDevice = owner.resolveActiveDevice;
