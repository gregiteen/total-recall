/**
 * Run the read commands installed plugins contribute to `startup check` and
 * `brief` (`startup_check` in plugin.json). Core runs them and reports what
 * they say; the domain knowledge stays in the plugin. A check that fails,
 * times out or prints the wrong shape is reported as unavailable, never as
 * clean.
 */
import { discoverPlugins } from './plugin-loader.mjs';
import { runPluginCommand } from './plugin-runner.mjs';
import { pluginExecutionEnabled } from './plugin-state.mjs';
import { readStartupCheckOutput, STARTUP_CHECK_MAX_TIMEOUT_MS } from './plugin-contracts/startup-check.mjs';

const DEFAULT_TIMEOUT_MS = 15000;

/**
 * @param {{ cwd?: string, plugins?: object[], run?: Function, enabled?: Function }} [options]
 * @returns {Promise<Array<{ plugin: string, command: string, status: string, outstanding?: number, summary?: string, reason?: string }>>}
 */
export async function runPluginStartupChecks({ cwd = process.cwd(), plugins, run = runPluginCommand, enabled = pluginExecutionEnabled } = {}) {
  let found;
  try { found = plugins ?? discoverPlugins(cwd); } catch (error) { return [{ plugin: '*', command: 'plugin discovery', status: 'unavailable', reason: error.message }]; }
  const declared = found.filter((plugin) => plugin.valid && plugin.manifest?.startup_check);
  return Promise.all(declared.map(async (plugin) => {
    const check = plugin.manifest.startup_check;
    const command = `${plugin.manifest.cli?.command || plugin.id} ${check.command}`;
    try {
      if (!enabled(plugin, { projectRoot: cwd })) return { plugin: plugin.id, command, status: 'inactive' };
    } catch (error) {
      return { plugin: plugin.id, command, status: 'unavailable', reason: `activation policy unreadable: ${error.message}` };
    }
    const timeoutMs = Math.min(check.timeout_ms ?? DEFAULT_TIMEOUT_MS, STARTUP_CHECK_MAX_TIMEOUT_MS);
    try {
      const result = await run(plugin, { subcommand: check.command, args: check.args || [], cwd, timeoutMs });
      if (result.timedOut) return { plugin: plugin.id, command, status: 'unavailable', reason: `timed out after ${timeoutMs} ms` };
      const read = readStartupCheckOutput(result.stdout);
      if (read.status !== 'unavailable' && result.exitCode !== 0) {
        return { plugin: plugin.id, command, ...read, status: 'unavailable', reason: `exited ${result.exitCode}` };
      }
      return { plugin: plugin.id, command, ...read };
    } catch (error) {
      return { plugin: plugin.id, command, status: 'unavailable', reason: error.message };
    }
  }));
}
