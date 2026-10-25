/** Host activation policy; never pretends a provider or external daemon is healthy. */
import { getPlugin } from './plugin-loader.mjs';
import { patchPluginRecord, patchProjectActivationRecord, emit, vaultFor, recompileAfterPluginMutation } from './plugin-store.mjs';
import { pluginActivation } from './plugin-state.mjs';
export { pluginActivation };

/**
 * Switch one plugin on or off.
 *
 * A plugin installed in one repository alone (a project copy) carries its own
 * setting. A plugin in the shared folder is switched for the whole machine
 * (`scope: 'shared'`), for the current repository alone (the default), or back to
 * following the shared setting (`clear: true`).
 */
export async function setPluginActive(id, enabled, { projectRoot = process.cwd(), scope = 'project', clear = false } = {}) {
  if (clear === true) {
    const plugin = getPlugin(id, projectRoot);
    if (!plugin?.valid) throw new Error(`Plugin ${id} is missing or invalid`);
    await patchProjectActivationRecord(id, projectRoot, null);
    await emit(vaultFor(plugin), id, 'activation-cleared', { projectRoot });
    const compilation = await recompileAfterPluginMutation(projectRoot, false);
    return { pluginId: id, activation: pluginActivation(plugin, { projectRoot }), scope: 'shared', compilation };
  }
  if (typeof enabled !== 'boolean') throw new Error('Plugin activation requires a boolean');
  const plugin = getPlugin(id, projectRoot);
  if (!plugin?.valid) throw new Error(`Plugin ${id} is missing or invalid`);
  if (scope === 'shared') {
    if (plugin.scope !== 'global') throw new Error(`Plugin ${id} is a ${plugin.scope} copy without a shared setting to change`);
    await patchPluginRecord(plugin, { runtime_enabled: enabled });
    await emit(vaultFor(plugin), id, enabled ? 'activated' : 'deactivated', { enabled, scope: 'shared' });
    const compilation = await recompileAfterPluginMutation(projectRoot, true);
    return { pluginId: id, activation: pluginActivation(plugin, { projectRoot }), scope: 'shared', compilation };
  }
  // Repository scope. A repository-owned copy already is that repository's setting.
  if (plugin.scope !== 'global') {
    await patchPluginRecord(plugin, { runtime_enabled: enabled });
    await emit(vaultFor(plugin), id, enabled ? 'activated' : 'deactivated', { enabled, scope: plugin.scope });
    // A project copy compiles the project's own surface and catalog. Only the
    // shared (scaffold) layer also rebuilds every registered project.
    const compilation = await recompileAfterPluginMutation(projectRoot, plugin.scope === 'scaffold');
    return { pluginId: id, activation: pluginActivation(plugin, { projectRoot }), scope: plugin.scope, compilation };
  }
  await patchProjectActivationRecord(id, projectRoot, enabled, { manifest: plugin.manifest });
  await emit(vaultFor(plugin), id, enabled ? 'activated' : 'deactivated', { enabled, projectRoot, scope: 'project' });
  const compilation = await recompileAfterPluginMutation(projectRoot, false);
  return { pluginId: id, activation: pluginActivation(plugin, { projectRoot }), scope: 'project', compilation };
}
