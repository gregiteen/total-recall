/**
 * A release that changes the plugin contract refuses the shared default plugins the previous release
 * installed, and with them every command that loads one, `update` included: the very command that would
 * replace them. So a machine moving to such a release could not update itself. When a command fails that
 * way, refresh the defaults from this package's bundled copies (a link is its owner's checkout and is left
 * alone) and run the command again, once.
 */
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { ensureRequiredPlugins } from './required-plugins.mjs';
import { globalPluginsDir } from './plugin-loader.mjs';

const REFUSAL = /\bRequired (?:plugin [\w-]+|[\w-]+ plugin) is missing or invalid\b/;
export const REFRESHED_ENV = 'TR_DEFAULT_PLUGINS_REFRESHED';

export function isDefaultPluginRefusal(error) {
  return REFUSAL.test(String(error?.message || ''));
}

/** Returns the rerun's exit status, or null when this error is not one a refresh can fix. */
export function rerunAfterDefaultRefresh(error, {
  env = process.env, argv = process.argv, execPath = process.execPath, ensure = ensureRequiredPlugins,
  sharedBrainDir = path.dirname(globalPluginsDir()), run = spawnSync, log = (line) => console.error(line),
} = {}) {
  if (!isDefaultPluginRefusal(error) || env[REFRESHED_ENV] === '1') return null;
  try {
    ensure(sharedBrainDir, { sharedBrainDir });
  } catch (refreshError) {
    log(`The default plugins could not be refreshed from this release: ${refreshError.message}`);
    return null;
  }
  log('Refreshed the default plugins from this release; running the command again.');
  const result = run(execPath, argv.slice(1), { stdio: 'inherit', env: { ...env, [REFRESHED_ENV]: '1' } });
  if (result.error) {
    log(`The command could not be run again: ${result.error.message}`);
    return 1;
  }
  return result.status ?? 1;
}
