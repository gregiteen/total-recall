/** Compatibility facade; process lifecycle, isolation, metadata and receipts belong to Metaharness. */
import { loadPluginModule } from './plugin-runtime.mjs';

let owner, ownerError;
try { owner = await loadPluginModule('meta-harness', 'process-manager'); }
catch (error) { ownerError = error; }
function implementation() {
  if (!owner) throw new Error(`Metaharness processes are unavailable: ${ownerError?.message || 'install the plugin'}`);
  return owner;
}
export const loadAgentState = (...args) => implementation().loadAgentState(...args);
export const saveAgentState = (...args) => implementation().saveAgentState(...args);
export const listAgents = (...args) => implementation().listAgents(...args);
export const isProcessRunning = (...args) => implementation().isProcessRunning(...args);
export const buildRemoteSpawnCommand = (...args) => implementation().buildRemoteSpawnCommand(...args);
export async function spawnAgent(...args) {
  return (await loadPluginModule('meta-harness', 'process-manager', { activeRequired: true })).spawnAgent(...args);
}
export async function killAgent(...args) {
  return (await loadPluginModule('meta-harness', 'process-manager')).killAgent(...args);
}
export async function getAgentLogs(...args) {
  return (await loadPluginModule('meta-harness', 'process-manager')).getAgentLogs(...args);
}

