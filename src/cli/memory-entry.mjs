/** Portable CLI entry. Capability commands must be declared by installed plugins. */
import fs from 'node:fs';
import { discoverPlugins } from '../core/plugin-loader.mjs';

const handlers = {
  init: () => import('./memory-init.mjs'),
  remember: () => import('./remember.mjs'),
  recall: () => import('./recall.mjs'),
  search: () => import('./recall.mjs'),
  edit: () => import('./edit.mjs'),
  forget: () => import('./forget.mjs'),
  context: () => import('./context.mjs'),
  rules: () => import('./rules.mjs'),
  compile: () => import('./rebuild.mjs'),
  rebuild: () => import('./rebuild.mjs'),
  import: () => import('./import-rules.mjs'),
  export: () => import('./export.mjs'),
  lint: () => import('./lint.mjs'),
  key: () => import('./key.mjs'),
  keys: () => import('./key.mjs'),
  pat: () => import('./key.mjs'),
  'generate-pat': () => import('./generate-pat.mjs'),
  plugin: () => import('./memory-plugin.mjs'),
  plugins: () => import('./memory-plugin.mjs'),
};

export async function main(args = []) {
  const [command, ...rest] = args;
  if (!command || ['help', '--help', '-h'].includes(command)) {
    console.log(`Total Recall — portable memory and instructions
Usage: total-recall <command> [options]
  init [--project]          Initialize an empty selected brain
  remember / edit / forget  Validated canonical memory mutations
  recall / search           Local or explicitly selected semantic retrieval
  context / rules           Required task instructions and rule verification
  compile / rebuild         Rebuild derived indexes and instruction shims
  import / export / lint     Portable memory import, export and validation
  key / generate-pat         Scoped memory API credentials
  plugin list|info|install|remove   Explicit capability installation
  status                    Selected brain initialization and node count
Installed capabilities:`);
    for (const plugin of discoverPlugins(process.cwd()).filter(p => p.valid)) {
      if (plugin.manifest.cli?.handler) console.log(`  ${plugin.manifest.cli.command || plugin.id} — ${plugin.manifest.description}`);
      for (const entry of plugin.manifest.commands || []) console.log(`  ${entry.name} — ${entry.description || plugin.manifest.description}`);
    }
    return;
  }
  if (['--version', '-v'].includes(command)) {
    const { version } = JSON.parse(fs.readFileSync(new URL('../../package.json', import.meta.url), 'utf8'));
    console.log(`total-recall v${version}`);
    return;
  }
  if (command === 'status') {
    const { resolveBrainDir, parseLayerFlag } = await import('./agent-dir.mjs');
    const { getNodes } = await import('../core/vault-cache.mjs');
    const path = await import('node:path');
    const brainDir = resolveBrainDir(parseLayerFlag(rest).layer);
    const vaultDir = path.join(brainDir, 'memory-vault');
    const initialized = fs.existsSync(vaultDir);
    console.log(JSON.stringify({ runtime: 'memory', brainDir, initialized, nodes: initialized ? getNodes(vaultDir).length : 0 }));
    if (!initialized) process.exitCode = 1;
    return;
  }
  if (Object.hasOwn(handlers, command)) {
    const mod = await handlers[command]();
    if (typeof mod.run === 'function') await mod.run([process.execPath, process.argv[1], ...args]);
    else await mod.default(rest);
    return;
  }
  const plugins = discoverPlugins(process.cwd()).filter(p => p.valid);
  const plugin = plugins.find(p => p.manifest.cli?.handler && (p.manifest.cli.command || p.id) === command)
    || plugins.find(p => p.manifest.commands?.some(entry => entry.name === command));
  if (!plugin) throw new Error(`Unknown command '${command}'. Install its capability plugin or run total-recall --help.`);
  const declared = plugin.manifest.cli?.handler && (plugin.manifest.cli.command || plugin.id) === command
    ? null : plugin.manifest.commands.find(entry => entry.name === command);
  if (declared && rest.some(arg => ['--help', '-h'].includes(arg))) {
    console.log(`Usage: total-recall ${command} [args] [--json]\n${declared.description || ''}`);
    return;
  }
  if (declared && rest.includes('--background')) throw new Error('Background execution requires the installed capability to manage its own job');
  const target = declared ? { ...plugin, manifest: { ...plugin.manifest, cli: { command, handler: declared.handler } } } : plugin;
  const { runPluginCommand } = await import('../core/plugin-runner.mjs');
  const result = await runPluginCommand(target, { args: rest, stdin: 'inherit', composable: Boolean(declared) });
  if (result.output) process.stdout.write(result.output);
  if (!result.ok) process.exitCode = result.exitCode || 1;
}
