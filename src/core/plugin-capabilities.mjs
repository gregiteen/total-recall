/** Passive manifest declarations. Never imports owner modules or probes services. */
import crypto from 'node:crypto';
import { resolvePluginFile } from './plugin-loader.mjs';

export const fingerprint = value => crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');

/** Keep arbitrary declaration metadata, but never persist credential material. */
export function sanitizeDeclaration(value, key = '') {
  if (/^(authorization|password|passwd|token|api[_-]?key|client[_-]?secret|access[_-]?token|refresh[_-]?token|private[_-]?key|cookie)$/i.test(key)) return '[REDACTED]';
  if (Array.isArray(value)) return value.map(v => sanitizeDeclaration(v));
  if (/^(env|headers|credentials)$/i.test(key) && value && typeof value === 'object') return Object.fromEntries(Object.keys(value).map(k => [k, '[REDACTED]']));
  if (value && typeof value === 'object' && /password|secret|token|api[_-]?key|private[_-]?key/i.test(value.name || value.key || '')) return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, ['default', 'value', 'example', 'examples'].includes(k) ? '[REDACTED]' : sanitizeDeclaration(v, k)]));
  if (value && typeof value === 'object' && value.secret === true) return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, ['default', 'value', 'example', 'examples'].includes(k) ? '[REDACTED]' : sanitizeDeclaration(v, k)]));
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, sanitizeDeclaration(v, k)]));
  if (typeof value === 'string') return value.replace(/(https?:\/\/)[^/\s@]+@/g, '$1[REDACTED]@').replace(/\b(Bearer\s+)\S+/gi, '$1[REDACTED]').replace(/([?&](?:token|key|api_key|secret|password)=)[^&#\s]*/gi, '$1[REDACTED]');
  return value;
}

export function pluginCapabilities(plugin, activation) {
  const manifest = sanitizeDeclaration(plugin.manifest || {});
  const provenance = { plugin: plugin.id, version: manifest.version || null, scope: plugin.scope, source: plugin.dir, manifest: 'plugin.json', fingerprint: fingerprint(manifest) };
  const out = [];
  const ids = new Set();
  function add(kind, name, declaration, { usage = '', bridge = false, complete = false, file = null, pointer = kind } = {}) {
    const id = `plugin:${plugin.id}:${kind}:${encodeURIComponent(name)}`;
    if (ids.has(id)) throw new Error('Duplicate plugin capability identity');
    ids.add(id);
    let available = true;
    if (file) {
      try { resolvePluginFile(plugin.dir, file); }
      catch (error) { if (error.code === 'ENOENT') available = false; else throw new Error('Unsafe plugin capability file'); }
    }
    const callable = plugin.valid === true && activation.enabled && bridge && available;
    const value = { id, plugin: plugin.id, kind, name, description: declaration.description || manifest.description || '', usage,
      schema: declaration.inputSchema || declaration.input_schema || declaration.schema || null, args: declaration.args ?? null,
      effect: declaration.effect || null, output: declaration.output || null, declaration, declarationComplete: complete,
      callable, activation, state: !plugin.valid ? 'invalid' : !activation.enabled ? 'inactive' : !available ? 'unavailable' : bridge ? 'callable' : 'unsupported',
      readiness: 'not-probed', provenance: { ...provenance, pointer }, sourceIdentity: `${plugin.scope}:${plugin.id}:plugin.json#${pointer}` };
    out.push({ ...value, fingerprint: fingerprint(value) });
  }
  const cli = manifest.cli;
  if (cli) {
    add('cli', 'root', { ...cli, description: [manifest.description, ...(manifest.gate?.tasks || [])].filter(Boolean).join(' ') }, { usage: `total-recall ${cli.command}`, bridge: !!cli.handler, file: cli.handler, pointer: 'cli' });
    for (const sub of cli.subcommands || []) add('cli', sub.name, sub, { usage: `total-recall ${cli.command} ${sub.name}`, bridge: !!cli.handler, file: cli.handler, complete: !!(sub.effect && sub.output && Array.isArray(sub.args)), pointer: `cli.subcommands.${sub.name}` });
  }
  for (const [name, file] of Object.entries(manifest.runtime?.modules || {})) add('module', name, { file }, { file, pointer: `runtime.modules.${name}` });
  for (const kind of ['jobs', 'daemons', 'startup']) for (const item of manifest.runtime?.[kind] || []) add(`runtime-${kind}`, item.id, item, { file: item.handler, pointer: `runtime.${kind}.${item.id}` });
  for (const router of manifest.runtime?.routers || []) { const file = typeof router === 'string' ? router : router.module; add('api-router', file || router.name, typeof router === 'string' ? { module: router } : router, { file, pointer: `runtime.routers.${file}` }); }
  for (const endpoint of manifest.app_cli?.commands || []) add('api', endpoint.name, endpoint, { usage: `${endpoint.method} ${endpoint.path}`, complete: !!(endpoint.method && endpoint.path), pointer: `app_cli.commands.${endpoint.name}` });
  for (const endpoint of manifest.api?.endpoints || []) add('api', endpoint.id || endpoint.name || `${endpoint.method} ${endpoint.path}`, endpoint, { usage: `${endpoint.method} ${endpoint.path}`, complete: !!(endpoint.method && endpoint.path), pointer: `api.endpoints.${endpoint.id || endpoint.name || endpoint.path}` });
  const servers = manifest.mcp?.servers || manifest.mcpServers || (manifest.mcp ? { default: manifest.mcp } : {});
  for (const [key, server] of Object.entries(servers)) {
    const name = server.name || key;
    add('mcp-server', name, server, { pointer: `mcp.servers.${name}` });
    for (const tool of server.tools || []) add('mcp-tool', `${name}/${tool.name}`, tool, { usage: `mcp ${name} ${tool.name}`, complete: !!(tool.name && (tool.inputSchema || tool.input_schema)), pointer: `mcp.servers.${name}.tools.${tool.name}` });
  }
  for (const command of manifest.commands || []) add('composed-declaration', command.name, command, { usage: `total-recall ${command.name}`, pointer: `commands.${command.name}` });
  if (manifest.capability) for (const name of manifest.capability.exports || []) add('export', name, { ...manifest.capability, name }, { file: manifest.capability.entry, pointer: `capability.exports.${name}` });
  return out;
}
