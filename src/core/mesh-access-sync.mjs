// Compatibility bindings only; implementation is owned by the installed plugin.
import { loadPluginModule, unavailablePluginOperation } from './plugin-runtime.mjs';
const owner = await loadPluginModule('mesh', 'mesh-access-sync');
export const remoteNodeDocsCommand = owner.remoteNodeDocsCommand;
export const parseRemoteNodeDocs = owner.parseRemoteNodeDocs;
export const planAccessFromPeerDocs = owner.planAccessFromPeerDocs;
export const syncAccessFromPeers = owner.syncAccessFromPeers;
