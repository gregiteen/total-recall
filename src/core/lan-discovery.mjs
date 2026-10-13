// Compatibility bindings only; implementation is owned by the installed plugin.
import { loadPluginModule, unavailablePluginOperation } from './plugin-runtime.mjs';
const owner = await loadPluginModule('mesh', 'lan-discovery');
export const parseArpTable = owner.parseArpTable;
export const discoverLanHosts = owner.discoverLanHosts;
export const probeLanBrains = owner.probeLanBrains;
export const discoverLanSnapshot = owner.discoverLanSnapshot;
export const lanHostnameFromIp = owner.lanHostnameFromIp;
export const registerLanMeshNodes = owner.registerLanMeshNodes;
