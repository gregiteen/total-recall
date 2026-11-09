/** Run each maintenance owner even when another owner fails. The daemon records the result. */
import { setupIntegrations } from './setup.mjs';
import { maintainDocumentation } from './documentation.mjs';

export async function maintainIntegrations(options = {}, owners = {}) {
  const steps = {
    setup: owners.setup || (() => setupIntegrations()),
    gates: owners.gates || (async () => (await import('./gate-adapters/index.mjs')).installAll()),
    docs: owners.docs || (() => maintainDocumentation(options)),
  };
  const result = {};
  for (const [name, execute] of Object.entries(steps)) {
    try { result[name] = await execute(); }
    catch (error) { result[name] = { ok: false, error: error.message }; }
  }
  return { ...result, ok: Object.values(result).every(step => step?.ok === true) };
}
