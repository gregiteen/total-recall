/**
 * Let installed plugins set up what a repository needs once it has a project
 * brain. A plugin declares `runtime.modules["project-provision"]`, an ES module
 * exporting `provisionProject({ projectRoot, dryRun })` that resolves to
 * `{ ok, summary }`. Core runs each enabled plugin's hook in turn and reports
 * the result. The domain knowledge stays in the plugin. One failing hook is
 * reported and never stops the others.
 */
import { discoverPlugins } from './plugin-loader.mjs';
import { pluginActivation } from './plugin-state.mjs';
import { loadPluginModule } from './plugin-runtime.mjs';

export const PROVISION_MODULE = 'project-provision';

/**
 * @returns {Promise<Array<{ plugin: string, status: 'ok'|'failed'|'inactive', summary: string }>>}
 */
export async function provisionProject(projectRoot, { dryRun = false, load = loadPluginModule, discover = discoverPlugins, activation = pluginActivation } = {}) {
  const results = [];
  for (const plugin of discover(projectRoot).filter((item) => item.valid && item.manifest?.runtime?.modules?.[PROVISION_MODULE])) {
    try {
      if (!activation(plugin, { projectRoot }).enabled) {
        results.push({ plugin: plugin.id, status: 'inactive', summary: 'plugin is off for this repository' });
        continue;
      }
      const module = await load(plugin.id, PROVISION_MODULE, { projectRoot });
      if (typeof module.provisionProject !== 'function') throw new Error(`${PROVISION_MODULE} module must export provisionProject()`);
      const result = await module.provisionProject({ projectRoot, dryRun });
      results.push({ plugin: plugin.id, status: result?.ok ? 'ok' : 'failed', summary: String(result?.summary || '') });
    } catch (error) {
      results.push({ plugin: plugin.id, status: 'failed', summary: error.message });
    }
  }
  return results;
}
