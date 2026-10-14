/** Host activation policy; never pretends a provider or external daemon is healthy. */
import { getPlugin } from './plugin-loader.mjs';
import { patchPluginRecord, emit, vaultFor, recompileAfterPluginMutation } from './plugin-store.mjs';
import { pluginActivation } from './plugin-state.mjs';
export { pluginActivation };

export async function setPluginActive(id, enabled, { projectRoot = process.cwd() } = {}) {
  if (typeof enabled !== 'boolean') throw new Error('Plugin activation requires a boolean');
  const plugin = getPlugin(id, projectRoot);
  if (!plugin?.valid) throw new Error(`Plugin ${id} is missing or invalid`);
  await patchPluginRecord(plugin, { runtime_enabled: enabled });
  await emit(vaultFor(plugin), id, enabled ? 'activated' : 'deactivated', { enabled });
  const compilation = await recompileAfterPluginMutation(projectRoot, plugin.scope === 'global' || plugin.scope === 'scaffold');
  return { pluginId: id, activation: pluginActivation(plugin), compilation };
}
