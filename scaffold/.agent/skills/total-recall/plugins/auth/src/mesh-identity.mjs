import { importHostModule } from './host-runtime.mjs';

// Loaded on first use, not at import, so importing the secrets routes does not
// require the host runtime until a mesh-identity request actually arrives.
let owner;
async function mesh() {
  if (!owner) {
    const { loadPluginModule } = await importHostModule('src/core/plugin-runtime.mjs');
    owner = await loadPluginModule('mesh', 'mesh-identity');
  }
  return owner;
}
export async function identifyCaller(...args) { return (await mesh()).identifyCaller(...args); }
export async function loadPolicy(...args) { return (await mesh()).loadPolicy(...args); }
export async function isKeyAllowed(...args) { return (await mesh()).isKeyAllowed(...args); }
export async function allowedKeys(...args) { return (await mesh()).allowedKeys(...args); }
