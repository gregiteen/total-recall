/** Generic, derived discovery metadata. Never imports plugin code or reads credentials. */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { discoverPlugins, resolvePluginFile } from './plugin-loader.mjs';
import { globalAgentDir } from './config.mjs';
import { listSurfaceCommands, commandScopeDirectories } from './command-surface.mjs';
import { pluginActivation } from './plugin-state.mjs';

export function buildPluginCatalog(projectRoot = process.cwd(), { discover = discoverPlugins } = {}) {
  const plugins = discover(projectRoot).map(plugin => {
    const manifest = plugin.manifest || {};
    let callable = false;
    try { callable = plugin.valid && Boolean(manifest.cli?.handler) && fs.statSync(resolvePluginFile(plugin.dir, manifest.cli.handler)).isFile(); } catch {}
    return {
      id: plugin.id, name: manifest.name || plugin.id, version: manifest.version || null,
      scope: plugin.scope, valid: plugin.valid === true, errors: plugin.errors || [],
      activation: pluginActivation(plugin),
      description: manifest.description || '', namespace: manifest.cli?.command || null,
      callable, operations: [...(manifest.cli?.subcommands || []).filter(command => !['on', 'off'].includes(command.name)),
        ...['on', 'off'].map(name => ({ name, description: `${name === 'on' ? 'Enable' : 'Disable'} host execution and compile surfaces`, effect: 'write', output: 'json', args: [] }))].map(command => ({
        name: command.name, description: command.description || '',
        effect: command.effect || null, output: command.output || null,
        args: Array.isArray(command.args) ? command.args : null,
        timeoutMs: command.timeout_ms || null,
      })),
      composedCommands: (manifest.commands || []).map(command => ({ name: command.name, description: command.description || '' })),
    };
  }).sort((a, b) => a.id.localeCompare(b.id));
  const commands = plugins.filter(plugin => plugin.valid && plugin.callable && plugin.namespace).flatMap(plugin => plugin.operations.map(operation => ({
    plugin: plugin.id, namespace: plugin.namespace, command: `total-recall ${plugin.namespace} ${operation.name}`,
    ...operation, declarationComplete: Boolean(operation.effect && operation.output && operation.args !== null),
  })));
  const composedCommands = listSurfaceCommands(commandScopeDirectories(projectRoot, globalAgentDir)).map(command => ({ ...command, command: `total-recall ${command.name}` }));
  const content = { schemaVersion: 1, plugins, commands, composedCommands };
  return { ...content, fingerprint: crypto.createHash('sha256').update(JSON.stringify(content)).digest('hex') };
}

export function refreshPluginCatalog(derivedDir, projectRoot = process.cwd(), options = {}) {
  const catalog = buildPluginCatalog(projectRoot, options);
  fs.mkdirSync(derivedDir, { recursive: true });
  const write = (name, data) => {
    const target = path.join(derivedDir, name);
    const temporary = `${target}.${crypto.randomUUID()}.tmp`;
    try {
      fs.writeFileSync(temporary, JSON.stringify(data, null, 2) + '\n', { mode: 0o600 });
      fs.renameSync(temporary, target);
    } finally { fs.rmSync(temporary, { force: true }); }
  };
  write('plugin-inventory.json', { schemaVersion: 1, fingerprint: catalog.fingerprint, plugins: catalog.plugins });
  write('cli-library.json', catalog);
  return catalog;
}
