/** Host activation policy; never pretends a provider or external daemon is healthy. */
import path from 'node:path';
import { getPlugin, globalPluginsDir, projectPluginsDir, vaultForPluginsDir } from './plugin-loader.mjs';
import { patchPluginRecord, patchProjectActivationRecord, recordPath, emit, vaultFor, recompileAfterPluginMutation } from './plugin-store.mjs';
import { patchVfsDocument } from './ssss-operation-service.mjs';
import { pluginActivation, readActivationRecord, usesSharedPluginPolicy } from './plugin-state.mjs';
import { moveRepositoryPluginState, withRepositoryPluginLifecycle } from './plugin-lifecycle.mjs';
import { REQUIRED_INSTALLATION_PLUGIN_IDS } from './default-plugins.mjs';
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
  const onUse = enabled === 'on-use';
  if (onUse && (scope !== 'project' || !projectRoot || projectPluginsDir(projectRoot) === globalPluginsDir() || clear)) {
    throw new Error('On use is available for individual repository brains.');
  }
  if ((enabled === false || onUse) && REQUIRED_INSTALLATION_PLUGIN_IDS.includes(id)) {
    throw new Error('Required plugin ' + id + ' cannot be disabled');
  }
  if (clear === true) {
    const plugin = getPlugin(id, projectRoot);
    if (!plugin?.valid) throw new Error(`Plugin ${id} is missing or invalid`);
    await withRepositoryPluginLifecycle(projectRoot, id, async brain => {
      if (!usesSharedPluginPolicy(plugin) || pluginActivation(plugin, { projectRoot: null }).enabled) {
        moveRepositoryPluginState(brain, id, 'restore');
      }
      await patchProjectActivationRecord(id, projectRoot, null);
      await emit(vaultForPluginsDir(projectPluginsDir(projectRoot)), id, 'activation-cleared', {});
    });
    const compilation = await recompileAfterPluginMutation(projectRoot, false);
    return { pluginId: id, activation: pluginActivation(plugin, { projectRoot }), scope: 'shared', compilation };
  }
  if (onUse) enabled = false;
  if (typeof enabled !== 'boolean') throw new Error('Plugin activation requires a boolean or On use');
  const plugin = getPlugin(id, projectRoot);
  if (!plugin?.valid) throw new Error(`Plugin ${id} is missing or invalid`);
  if (scope === 'shared') {
    if (!usesSharedPluginPolicy(plugin)) throw new Error(`Plugin ${id} is a ${plugin.scope} copy without a shared setting to change`);
    await patchPluginRecord(plugin, { runtime_enabled: enabled, runtime_on_use: false });
    await emit(vaultFor(plugin), id, enabled ? 'activated' : 'deactivated', { enabled, scope: 'shared' });
    const compilation = await recompileAfterPluginMutation(projectRoot, true);
    return { pluginId: id, activation: pluginActivation(plugin, { projectRoot }), scope: 'shared', compilation };
  }
  // Repository scope. A repository-owned copy already is that repository's setting.
  const event = onUse ? 'activation-on-use' : enabled ? 'activated' : 'deactivated';
  const shared = usesSharedPluginPolicy(plugin);
  const resultScope = shared ? 'project' : plugin.scope;
  const vaultRoot = shared ? vaultForPluginsDir(projectPluginsDir(projectRoot)) : vaultFor(plugin);
  const cleanup = await withRepositoryPluginLifecycle(projectRoot, id, async brain => {
    if (onUse && !brain) throw new Error('On use is available for individual repository brains.');
    let result = enabled ? moveRepositoryPluginState(brain, id, 'restore') : undefined;
    if (shared) await patchProjectActivationRecord(id, projectRoot, enabled, { manifest: plugin.manifest, onUse });
    else await patchPluginRecord(plugin, { runtime_enabled: enabled, runtime_on_use: onUse });
    if (!enabled && !onUse) {
      try { result = moveRepositoryPluginState(brain, id, 'archive'); }
      catch (error) {
        result = { ok: false, state: 'pending', error: error.code ? `Could not archive repository plugin state (${error.code}).` : error.message };
      }
    }
    await emit(vaultRoot, id, event, { enabled, scope: resultScope, ...(result ? { cleanup: result.state } : {}) });
    return result;
  });
  const compilation = await recompileAfterPluginMutation(projectRoot, false);
  return { pluginId: id, activation: pluginActivation(plugin, { projectRoot }), scope: resultScope, compilation, ...(cleanup ? { cleanup } : {}) };
}

/** Claim one armed project policy through the SSSS compare-and-set writer. */
export async function activatePluginOnUse(id, { projectRoot = process.cwd() } = {}) {
  if (!projectRoot || projectPluginsDir(projectRoot) === globalPluginsDir()) return null;
  const plugin = getPlugin(id, projectRoot);
  if (!plugin?.valid || pluginActivation(plugin, { projectRoot }).mode !== 'on-use') return null;
  const vaultRoot = usesSharedPluginPolicy(plugin) ? vaultForPluginsDir(projectPluginsDir(projectRoot)) : vaultFor(plugin);
  const cleanup = await withRepositoryPluginLifecycle(projectRoot, id, async brain => {
    if (!brain) return null;
    const current = readActivationRecord(path.join(vaultRoot, recordPath(id)), id, { withHash: true });
    if (current?.record.runtime_on_use !== true) return null;
    const result = moveRepositoryPluginState(brain, id, 'restore');
    await patchVfsDocument(recordPath(id), { runtime_enabled: true, runtime_on_use: false, timestamp: new Date().toISOString() }, {
      vaultRoot, expectedBeforeHash: current.hash, intent: 'Activate plugin on deliberate use',
    });
    await emit(vaultRoot, id, 'activated-on-use', { enabled: true, scope: 'project', cleanup: result.state });
    return result;
  });
  if (!cleanup) return null;
  const compilation = await recompileAfterPluginMutation(projectRoot, false);
  return { pluginId: id, activation: pluginActivation(plugin, { projectRoot }), scope: 'project', compilation, cleanup };
}
