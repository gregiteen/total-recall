/** Compatibility facade only. Adapter contracts, auth, usage and execution belong to Metaharness. */
import { loadPluginModule } from './plugin-runtime.mjs';

let owner, ownerError;
try { owner = await loadPluginModule('meta-harness', 'harness-compat'); }
catch (error) { ownerError = error; }
function implementation() {
  if (!owner) throw new Error(`Metaharness is unavailable: ${ownerError?.message || 'install the plugin'}`);
  return owner;
}

export const HARNESS_SPECS = owner?.HARNESS_SPECS || {};
export const normalizeToolSelection = (...args) => implementation().normalizeToolSelection(...args);
export const buildHarnessArgs = (...args) => implementation().buildHarnessArgs(...args);
export const shellQuote = (...args) => implementation().shellQuote(...args);
export const resolveHarnessEnv = (...args) => implementation().resolveHarnessEnv(...args);
export const detectHarnesses = (...args) => implementation().detectHarnesses(...args);
export const detectHarnessesWithAuth = (...args) => implementation().detectHarnessesWithAuth(...args);
export const getInstalledHarnessVersion = (...args) => implementation().getInstalledHarnessVersion(...args);
export const getLatestHarnessVersion = (...args) => implementation().getLatestHarnessVersion(...args);
export const queryHarnessUsage = (...args) => implementation().queryHarnessUsage(...args);

export async function dispatchTask(...args) {
  return (await loadPluginModule('meta-harness', 'harness-compat', { activeRequired: true })).dispatchTask(...args);
}
export async function runCouncil(...args) {
  return (await loadPluginModule('meta-harness', 'harness-compat', { activeRequired: true })).runCouncil(...args);
}

