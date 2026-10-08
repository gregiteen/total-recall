/** Minimal plugin lifecycle, reusing the canonical store and command projections. */
import { getPlugin } from '../core/plugin-loader.mjs';
import { installPlugin, uninstallPlugin, listInstalledPlugins, describePlugin } from '../core/plugin-store.mjs';

export default async function plugin(args = []) {
  const [action = 'list', ...rest] = args;
  const value = rest.find(arg => !arg.startsWith('-'));
  const global = rest.includes('--global') || rest.includes('-g');
  if (action === 'list') {
    console.log(JSON.stringify(listInstalledPlugins(process.cwd()), null, 2));
  } else if (action === 'info') {
    if (!value) throw new Error('Plugin ID required');
    const installed = getPlugin(value, process.cwd());
    if (!installed) throw new Error(`Plugin '${value}' is not installed`);
    console.log(JSON.stringify({ ...describePlugin(installed), manifest: installed.manifest }, null, 2));
    if (!installed.valid) process.exitCode = 1;
  } else if (action === 'install') {
    if (!value) throw new Error('Plugin directory or Git URL required');
    if (value.startsWith('peer:') || value.includes('/api/public/plugins/')) {
      throw new Error('This source requires the optional plugin distribution capability');
    }
    const result = await installPlugin(value, { projectRoot: process.cwd(), global, link: rest.includes('--link') || rest.includes('-l') });
    console.log(JSON.stringify(result, null, 2));
  } else if (action === 'remove') {
    if (!value) throw new Error('Plugin ID required');
    const result = await uninstallPlugin(value, { projectRoot: process.cwd(), global: global ? true : undefined });
    console.log(JSON.stringify(result, null, 2));
  } else if (['help', '--help', '-h'].includes(action)) {
    console.log('Usage: total-recall plugin list|info <id>|install <directory-or-git-url>|remove <id> [--global] [--link]');
  } else throw new Error(`Unsupported plugin action '${action}'`);
}
