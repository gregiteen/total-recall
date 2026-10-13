// Compatibility bindings only; implementation is owned by the installed plugin.
import { loadPluginModule, unavailablePluginOperation } from './plugin-runtime.mjs';
const owner = await loadPluginModule('mesh', 'plugin-peers');
export const meshPeerUrl = owner.meshPeerUrl;
export const listPeerPlugins = owner.listPeerPlugins;
export const parsePeerSource = owner.parsePeerSource;
export const fetchPeerBundle = owner.fetchPeerBundle;
