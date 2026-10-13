import { importHostModule } from './host-runtime.mjs';
const { loadPluginModule } = await importHostModule('src/core/plugin-runtime.mjs');
export async function normalizeRemoteAddress(...args) { return (await loadPluginModule('mesh', 'mesh-auth')).normalizeRemoteAddress(...args); }
export async function isMeshOrLoopbackAddress(...args) { return (await loadPluginModule('mesh', 'mesh-auth')).isMeshOrLoopbackAddress(...args); }
export async function getMeshSyncToken(...args) { return (await loadPluginModule('mesh', 'mesh-auth')).getMeshSyncToken(...args); }
export async function getMeshSyncAuthorization(...args) { return (await loadPluginModule('mesh', 'mesh-auth')).getMeshSyncAuthorization(...args); }
export async function requireMeshSyncAuth(...args) { return (await loadPluginModule('mesh', 'mesh-auth')).requireMeshSyncAuth(...args); }
