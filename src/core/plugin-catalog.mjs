/** Generic, derived discovery metadata. Never imports plugin code or reads credentials. */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { discoverPlugins, resolvePluginFile } from './plugin-loader.mjs';
import { globalAgentDir } from './local-config.mjs';
import { listSurfaceCommands, commandScopeDirectories } from './command-surface.mjs';
import { pluginActivation } from './plugin-state.mjs';
import { pluginCapabilities, sanitizeDeclaration, fingerprint } from './plugin-capabilities.mjs';

export function buildPluginCatalog(projectRoot = process.cwd(), { discover = discoverPlugins } = {}) {
  const capabilities = [];
  const plugins = discover(projectRoot).map(plugin => {
    const manifest = sanitizeDeclaration(plugin.manifest || {});
    const activation = pluginActivation(plugin, { projectRoot });
    capabilities.push(...pluginCapabilities({ ...plugin, manifest }, activation));
    let callable = false;
    try { callable = plugin.valid && Boolean(manifest.cli?.handler) && fs.statSync(resolvePluginFile(plugin.dir, manifest.cli.handler)).isFile(); } catch {}
    return {
      id: plugin.id, name: manifest.name || plugin.id, version: manifest.version || null,
      scope: plugin.scope, valid: plugin.valid === true, errors: plugin.errors || [],
      declaration: manifest,
      activation,
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
    callable: plugin.activation.enabled, activation: plugin.activation,
    ...operation, declarationComplete: Boolean(operation.effect && operation.output && operation.args !== null),
  })));
  const commandDirs = commandScopeDirectories(projectRoot, globalAgentDir);
  const composedCommands = listSurfaceCommands(commandDirs).map(command => ({ ...command, command: `total-recall ${command.name}` }));
  const composedSources = new Map();
  for (const { dir } of commandDirs) {
    for (const command of composedCommands) {
      if (composedSources.has(command.name) || !fs.existsSync(path.join(dir, `${command.name}.mjs`))) continue;
      const source = resolvePluginFile(dir, `${command.name}.mjs`);
      composedSources.set(command.name, { source, fingerprint: fingerprint(fs.readFileSync(source, 'utf8')) });
    }
  }
  for (const command of composedCommands) {
    const owners = plugins.filter(plugin => plugin.composedCommands.some(c => c.name === command.name));
    if (owners.length > 1) throw new Error('Composed capability ownership collision');
    const owner = owners[0];
    const activation = owner?.activation || { state: 'active', enabled: true };
    const callable = (!owner || owner.valid) && activation.enabled;
    capabilities.push({ ...command, id: `composed:${command.name}`, plugin: owner?.id || null, kind: 'composed', usage: command.command, schema: null, args: null,
      effect: command.risk || null, declarationComplete: false, callable, activation, state: callable ? 'callable' : 'inactive', readiness: 'not-probed',
      provenance: { scope: command.scope, ...composedSources.get(command.name) }, sourceIdentity: `composed:${command.scope}:${command.name}`, fingerprint: fingerprint({ command, activation, source: composedSources.get(command.name) }) });
  }
  capabilities.sort((a, b) => a.id.localeCompare(b.id));
  if (new Set(capabilities.map(c => c.id)).size !== capabilities.length) throw new Error('Duplicate capability identity');
  const namespaces = plugins.map(p => p.namespace).filter(Boolean);
  if (new Set(namespaces).size !== namespaces.length) throw new Error('Plugin CLI namespace collision');
  const content = { schemaVersion: 1, plugins, commands, composedCommands, capabilities };
  return { ...content, fingerprint: crypto.createHash('sha256').update(JSON.stringify(content)).digest('hex') };
}

export function refreshPluginCatalog(derivedDir, projectRoot = process.cwd(), options = {}) {
  const catalog = options.catalog || buildPluginCatalog(projectRoot, options);
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
