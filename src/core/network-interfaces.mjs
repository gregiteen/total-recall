// Compatibility bindings only; implementation is owned by the installed plugin.
import { loadPluginModule, unavailablePluginOperation } from './plugin-runtime.mjs';
const owner = await loadPluginModule('mesh', 'network-interfaces');
export const classifyInterfaceKind = owner.classifyInterfaceKind;
export const isLanIpv4 = owner.isLanIpv4;
export const isOverlayIpv4 = owner.isOverlayIpv4;
export const listLocalInterfaces = owner.listLocalInterfaces;
export const summarizeInterfacesForEntity = owner.summarizeInterfacesForEntity;
export const listLocalLanCidrs = owner.listLocalLanCidrs;
