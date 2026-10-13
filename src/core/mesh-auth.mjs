// Compatibility bindings only; implementation is owned by the installed plugin.
import { loadPluginModule, unavailablePluginOperation } from './plugin-runtime.mjs';
const owner = await loadPluginModule('mesh', 'mesh-auth');
export const normalizeRemoteAddress = owner.normalizeRemoteAddress;
export const isMeshOrLoopbackAddress = owner.isMeshOrLoopbackAddress;
export const getMeshSyncToken = owner.getMeshSyncToken;
export const getMeshSyncAuthorization = owner.getMeshSyncAuthorization;
export const requireMeshSyncAuth = owner.requireMeshSyncAuth;
