// Compatibility bindings only; implementation is owned by the installed plugin.
import { loadPluginModule, unavailablePluginOperation } from './plugin-runtime.mjs';
const owner = await loadPluginModule('mesh', 'device-io');
export const buildIoProfileFromSignals = owner.buildIoProfileFromSignals;
export const uiHintsFromIo = owner.uiHintsFromIo;
export const detectDeviceIo = owner.detectDeviceIo;
export const mergeIoProfiles = owner.mergeIoProfiles;
