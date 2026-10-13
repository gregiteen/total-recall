// Compatibility bindings only; implementation is owned by the installed plugin.
import { loadPluginModule, unavailablePluginOperation } from './plugin-runtime.mjs';
const owner = await loadPluginModule('mesh', 'mesh-discover');
export const candidateUsers = owner.candidateUsers;
export const localPrivateKeys = owner.localPrivateKeys;
export const classifyProbeFailure = owner.classifyProbeFailure;
export const probeLogin = owner.probeLogin;
export const discoverNodeAccess = owner.discoverNodeAccess;
