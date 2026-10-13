import { importHostModule } from './host-runtime.mjs';
const { loadPluginModule } = await importHostModule('src/core/plugin-runtime.mjs');
export async function normalizeHostname(...args) { return (await loadPluginModule('mesh', 'mesh')).normalizeHostname(...args); }
export async function meshNodeDocSlug(...args) { return (await loadPluginModule('mesh', 'mesh')).meshNodeDocSlug(...args); }
export async function meshNodeKey(...args) { return (await loadPluginModule('mesh', 'mesh')).meshNodeKey(...args); }
export async function clearMeshStatusCache(...args) { return (await loadPluginModule('mesh', 'mesh')).clearMeshStatusCache(...args); }
export async function isMeshAvailable(...args) { return (await loadPluginModule('mesh', 'mesh')).isMeshAvailable(...args); }
export async function getMeshSelf(...args) { return (await loadPluginModule('mesh', 'mesh')).getMeshSelf(...args); }
export async function getMeshIp(...args) { return (await loadPluginModule('mesh', 'mesh')).getMeshIp(...args); }
export async function getMeshHostname(...args) { return (await loadPluginModule('mesh', 'mesh')).getMeshHostname(...args); }
export async function getMeshPeers(...args) { return (await loadPluginModule('mesh', 'mesh')).getMeshPeers(...args); }
export async function meshVaultRoot(...args) { return (await loadPluginModule('mesh', 'mesh')).meshVaultRoot(...args); }
export async function listMeshNodeEntities(...args) { return (await loadPluginModule('mesh', 'mesh')).listMeshNodeEntities(...args); }
export async function entityForPeer(...args) { return (await loadPluginModule('mesh', 'mesh')).entityForPeer(...args); }
export async function mergeLivePeersWithEntities(...args) { return (await loadPluginModule('mesh', 'mesh')).mergeLivePeersWithEntities(...args); }
export async function listEnrichedMeshNodes(...args) { return (await loadPluginModule('mesh', 'mesh')).listEnrichedMeshNodes(...args); }
export async function attachSelfInterfaces(...args) { return (await loadPluginModule('mesh', 'mesh')).attachSelfInterfaces(...args); }
export async function findMeshNode(...args) { return (await loadPluginModule('mesh', 'mesh')).findMeshNode(...args); }
export async function setMeshNodeAccess(...args) { return (await loadPluginModule('mesh', 'mesh')).setMeshNodeAccess(...args); }
export async function ensureMeshNodeEntities(...args) { return (await loadPluginModule('mesh', 'mesh')).ensureMeshNodeEntities(...args); }
export async function patchOwnMeshNode(...args) { return (await loadPluginModule('mesh', 'mesh')).patchOwnMeshNode(...args); }
export async function execMeshCommand(...args) { return (await loadPluginModule('mesh', 'mesh')).execMeshCommand(...args); }
export async function resolveMeshControlUrl(...args) { return (await loadPluginModule('mesh', 'mesh')).resolveMeshControlUrl(...args); }
