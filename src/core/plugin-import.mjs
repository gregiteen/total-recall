/** Passive plugin conversion through the canonical SSSS bundle contract. */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { createEngine } from '@ssss/cli';
import { serializeDocument, parseDocument } from '@ssss/cli/frontmatter';
import { contentHash, validateBundle, provisionBundle, importBundle, exportBundle } from '@ssss/cli/bundle';
import { collectSource, decodeAssets, noLinks, safePath, parseDeclaration, rejectCredentials, unresolvedPlaceholders, sha256, object, MAX_BYTES, MAX_FILES } from './plugin-import-source.mjs';
import { decodeBundle } from './plugin-bundle.mjs';
import { validatePluginManifest } from './plugin-loader.mjs';

export const IMPORT_FORMATS = ['native', 'ssss', 'agent-plugin', 'codex-plugin', 'claude-plugin', 'mcp', 'openapi', 'npm', 'vscode', 'python', 'mcpb', 'openclaw', 'generic'];
const assetPath = 'imports/plugin-source.md';
const bytesOf = asset => Buffer.from(asset.data_b64, 'base64');
const declaration = asset => parseDeclaration(bytesOf(asset), asset.path);
const check = (condition, message) => { if (!condition) throw new Error(message); };

function archiveSource(input) {
  const target = noLinks(input);
  check(fs.statSync(target).size <= MAX_BYTES, 'Archive exceeds import limit');
  // Read ZIP members without extraction. Check declared and actual expanded bounds,
  // duplicate names and Unix file types before any member enters our namespace.
  const script = `import sys,zipfile,json,base64,stat
z=zipfile.ZipFile(sys.argv[1]); out=[]; total=0; seen=set()
for f in z.infolist():
 mode=f.external_attr>>16
 if f.is_dir(): continue
 if stat.S_IFMT(mode) not in (0,stat.S_IFREG): raise ValueError('Archive links/special files forbidden')
 if f.filename in seen: raise ValueError('Duplicate archive member')
 seen.add(f.filename); total+=f.file_size
 if total>5242880 or len(out)>=200: raise ValueError('Archive limit')
 b=z.read(f); out.append(dict(path=f.filename,mode=(mode & 493) or 420,data_b64=base64.b64encode(b).decode()))
json.dump(out,sys.stdout)`;
  let entries;
  try { entries = JSON.parse(execFileSync('python3', ['-I', '-c', script, target], { encoding: 'utf8', timeout: 5000, maxBuffer: MAX_BYTES * 2, stdio: ['ignore', 'pipe', 'pipe'] })); }
  catch { throw new Error('Invalid, unsafe or oversized ZIP plugin archive'); }
  entries = entries.map(e => ({ ...e, sha256: sha256(bytesOf(e)) }));
  decodeAssets(entries);
  return { entries, root: path.dirname(target), single: null, archive: { name: path.basename(target), sha256: sha256(fs.readFileSync(target)) } };
}

/** Never executes source code, installs dependencies or inherits declared grants. */
export function inspectPluginSource(input, options = {}) {
  if (options.format) check(IMPORT_FORMATS.includes(options.format), 'Unknown import format');
  let source = /\.(?:mcpb|dxt|zip)$/i.test(input) ? archiveSource(input) : collectSource(input);
  let assets = source.entries;
  const get = name => assets.find(a => a.path === name);
  const parsed = name => get(name) ? declaration(get(name)) : null;
  const marketplace = parsed('.claude-plugin/marketplace.json') || parsed('.codex-plugin/marketplace.json');
  if (marketplace) {
    check(options.select, 'Marketplace requires --select <plugin-name>');
    check(Array.isArray(marketplace.plugins), 'Invalid marketplace plugins');
    const matches = marketplace.plugins.filter(p => p.name === options.select);
    check(matches.length === 1 && typeof matches[0].source === 'string', 'Select exactly one local marketplace entry');
    const relative = safePath(matches[0].source.replace(/^\.\//, ''));
    const prefix = relative + '/';
    check(assets.some(a => a.path.startsWith(prefix)), 'Selected marketplace source is absent or remote');
    assets = assets.filter(a => a.path.startsWith(prefix)).map(a => ({ ...a, path: a.path.slice(prefix.length) }));
    source = { ...source, entries: assets, marketplace: { manifest: marketplace, entry: matches[0] } };
  }
  const candidates = [];
  const add = (format, name) => { if (get(name)) candidates.push({ format, name }); };
  if (get('plugin.json')) add(parsed('plugin.json')?.id ? 'native' : 'agent-plugin', 'plugin.json');
  add('claude-plugin', '.claude-plugin/plugin.json');
  // The root Agent Plugins manifest is authoritative; the Codex overlay is a
  // compatibility companion emitted by our own exporter, not a second plugin.
  if (!get('plugin.json')) add('codex-plugin', '.codex-plugin/plugin.json');
  add('openclaw', 'openclaw.plugin.json'); add('mcpb', 'manifest.json');
  if (!candidates.length) {
    if (get('package.json')) add(parsed('package.json')?.engines?.vscode ? 'vscode' : 'npm', 'package.json');
    add('python', 'pyproject.toml');
    for (const a of assets) {
      if (!/\.(?:json|ya?ml)$/i.test(a.path)) continue;
      const value = declaration(a);
      if (value?.manifest && Array.isArray(value.files)) candidates.push({ format: 'ssss', name: a.path });
      else if (value?.format === 'tr-plugin-bundle/1') candidates.push({ format: 'native-bundle', name: a.path });
      else if (value?.openapi) candidates.push({ format: 'openapi', name: a.path });
      else if (value?.mcpServers && !candidates.length) candidates.push({ format: 'mcp', name: a.path });
    }
  }
  // A companion .mcp.json never competes with another declaration.
  if (candidates.length > 1 && candidates.some(c => c.format === 'mcp' && c.name === '.mcp.json')) candidates.splice(candidates.findIndex(c => c.format === 'mcp' && c.name === '.mcp.json'), 1);
  let selected;
  if (options.format === 'generic') selected = { format: 'generic', name: source.single || assets[0].path };
  else if (options.format) selected = candidates.find(c => c.format === options.format || (options.format === 'native' && c.format === 'native-bundle'));
  else { check(candidates.length <= 1, 'Ambiguous plugin manifests; select --format'); selected = candidates[0]; }
  if (!selected && !options.format && assets.length === 1) selected = { format: 'generic', name: assets[0].path };
  check(selected, 'Cannot identify plugin declaration; use --format generic');
  let { format, name } = selected;
  if (format === 'native-bundle') {
    const wire = declaration(get(name));
    const decoded = decodeBundle(wire);
    const original = assets;
    assets = decoded.entries.map(e => ({ path: e.path, mode: e.mode, sha256: sha256(e.data), data_b64: e.data.toString('base64') }));
    decodeAssets(assets);
    const result = inspectAssets(assets, 'native', 'plugin.json');
    return { ...result, provenance: { ...result.provenance, nativeBundle: { sha256: wire.sha256, declaration: name, source: original.map(({ path: p, mode, sha256: h }) => ({ path: p, mode, sha256: h })) } } };
  }
  if (format === 'ssss') {
    const bundle = declaration(get(name));
    validateSsss(bundle);
    return { format, metadata: bundle.manifest, assets, capabilities: [], provenance: { source_hash: sha256(JSON.stringify(assets)) }, bundle };
  }
  const result = inspectAssets(assets, format, name);
  result.provenance = { ...result.provenance, ...(source.marketplace ? { marketplace: source.marketplace } : {}), ...(source.archive ? { archive: source.archive } : {}) };
  return result;
}

function inspectAssets(assets, format, name) {
  decodeAssets(assets);
  let metadata;
  if (format === 'generic' && !/\.(json|ya?ml|toml)$/i.test(name)) metadata = { declaration: name };
  else metadata = declaration(assets.find(a => a.path === name));
  check(object(metadata), 'Plugin declaration must be an object');
  rejectCredentials(metadata);
  const capabilities = [];
  const cap = (id, kind, spec, executable = false, unsupported = null) => capabilities.push({ id, kind, description: spec.description || spec.title || id, schema: spec, declarationComplete: true, executable, unsupported });
  const local = relative => {
    check(typeof relative === 'string', 'Invalid source reference');
    const p = safePath(relative.replace(/^\.\//, ''));
    check(assets.some(a => a.path === p), 'Referenced source absent; supply the complete plugin directory');
    return p;
  };
  if (['native', 'agent-plugin', 'claude-plugin', 'codex-plugin', 'npm', 'vscode', 'mcpb'].includes(format)) check(typeof metadata.name === 'string' && metadata.name.length > 0, 'Plugin name required');
  if (format === 'native') {
    const validation = validatePluginManifest(metadata);
    check(validation.valid, 'Invalid native plugin schema');
    for (const command of metadata.commands || []) cap(command.name, 'native-command', { ...command, handler: local(command.handler) }, true);
    if (metadata.cli) cap(metadata.cli.command || metadata.id, 'native-host-cli', metadata.cli, false, 'Requires installed native host activation and authority');
  }
  if (format === 'npm') {
    check(typeof metadata.version === 'string', 'npm version required');
    const bins = typeof metadata.bin === 'string' ? { [metadata.name]: metadata.bin } : metadata.bin || {};
    check(object(bins), 'Invalid npm bin declaration');
    for (const [id, file] of Object.entries(bins)) cap(id, 'npm-bin', { handler: local(file) }, /\.(?:mjs|cjs|js)$/.test(file), 'Only JavaScript bins are callable; dependencies are never installed');
  }
  if (format === 'vscode') {
    check(typeof metadata.version === 'string' && typeof metadata.engines?.vscode === 'string', 'Invalid VS Code manifest');
    for (const command of metadata.contributes?.commands || []) { check(typeof command.command === 'string', 'Invalid VS Code command'); cap(command.command, 'vscode-command', command, false, 'VS Code extension host required'); }
  }
  if (format === 'python') {
    check(typeof metadata.project?.name === 'string', 'Python project.name required');
    for (const [id, entry] of Object.entries(metadata.project.scripts || {})) { check(typeof entry === 'string', 'Invalid Python entry point'); cap(id, 'python-entry', { entry }, false, 'Python package environment required'); }
  }
  if (format === 'openclaw') {
    check(typeof metadata.id === 'string' && object(metadata.configSchema), 'OpenClaw id and configSchema required');
    cap(metadata.id, 'openclaw-host', metadata, false, 'OpenClaw runtime required');
  }
  if (format === 'mcpb') {
    check(typeof (metadata.manifest_version || metadata.dxt_version) === 'string' && object(metadata.server) && typeof metadata.server.type === 'string', 'Invalid MCPB/DXT manifest');
    if (metadata.server.entry_point) local(metadata.server.entry_point);
  }
  if (format === 'openapi') {
    check(/^3\.[0-2]\.\d+$/.test(metadata.openapi) && typeof metadata.info?.title === 'string' && typeof metadata.info?.version === 'string' && object(metadata.paths), 'Invalid OpenAPI schema');
    for (const [route, item] of Object.entries(metadata.paths)) {
      check(route.startsWith('/') && object(item), 'Invalid OpenAPI path');
      for (const [method, spec] of Object.entries(item)) if (['get', 'post', 'put', 'patch', 'delete', 'head', 'options'].includes(method)) {
        check(object(spec) && object(spec.responses), 'OpenAPI operation requires responses');
        const unsupported = (spec.security ?? metadata.security)?.length || JSON.stringify(spec).includes('"$ref"') || item.$ref || spec.callbacks || spec.servers?.some(s => s.variables) ? 'Authentication, references, callbacks or server variables require an explicit adapter' : null;
        cap(spec.operationId || `${method}:${route}`, 'openapi-operation', { ...spec, method, route, servers: spec.servers || item.servers || metadata.servers, parameters: [...(item.parameters || []), ...(spec.parameters || [])] }, !unsupported, unsupported);
      }
    }
  }
  const mcp = [];
  if (format === 'mcp') { check(object(metadata.mcpServers), 'mcpServers object required'); mcp.push(metadata); }
  if (format === 'mcpb' && metadata.server.mcp_config) mcp.push({ mcpServers: { [metadata.name]: metadata.server.mcp_config } });
  if (metadata.mcpServers) {
    if (format !== 'mcp') for (const entry of Array.isArray(metadata.mcpServers) ? metadata.mcpServers : [metadata.mcpServers]) {
      if (typeof entry === 'string') mcp.push(declaration(assets.find(a => a.path === local(entry))));
      else mcp.push({ mcpServers: entry });
    }
  }
  for (const a of assets) if (['mcp.json', '.mcp.json'].includes(a.path) && format !== 'mcp') mcp.push(declaration(a));
  for (const config of mcp) {
    check(object(config.mcpServers), 'Invalid MCP config');
    for (const [id, spec] of Object.entries(config.mcpServers)) {
      check(object(spec) && (typeof spec.command === 'string' || typeof spec.url === 'string'), 'MCP server requires command or URL');
      check(spec.args === undefined || (Array.isArray(spec.args) && spec.args.every(a => typeof a === 'string')), 'Invalid MCP argv');
      const unbound = unresolvedPlaceholders(spec);
      const unsupported = spec.type === 'sse' ? 'Legacy SSE transport unsupported' : unbound.length ? `Requires credential/configuration binding for ${unbound.join(', ')}; no auth adapter is attached` : null;
      cap(`mcp:${id}`, 'mcp-server', spec, !unsupported && (!spec.type || ['stdio', 'http', 'streamable-http'].includes(spec.type)), unsupported);
    }
  }
  if (['agent-plugin', 'codex-plugin', 'claude-plugin'].includes(format)) {
    for (const key of ['skills', 'agents', 'commands', 'hooks', 'apps']) if (metadata[key]) cap(key, 'host-declaration', { value: metadata[key] }, false, 'Native host behavior is preserved but not executed');
  }
  const skillDirs = ['skills', ...[metadata.skills].flat().filter(v => typeof v === 'string').map(v => v.replace(/^\.\//, '').replace(/\/$/, ''))].filter(Boolean);
  for (const a of assets) if (skillDirs.some(d => a.path.startsWith(d + '/') && /^[^/]+\/SKILL\.md$/.test(a.path.slice(d.length + 1)))) {
    const { data } = parseDocument(bytesOf(a).toString('utf8'));
    check(typeof data.name === 'string' && typeof data.description === 'string', 'Invalid portable skill declaration');
    cap(`skill:${data.name}`, 'skill', { ...data, path: a.path }, false, 'Agent instruction capability; requires an agent host');
  }
  let companion;
  if (format === 'agent-plugin' && assets.some(a => a.path === '.codex-plugin/plugin.json')) {
    const codex = declaration(assets.find(a => a.path === '.codex-plugin/plugin.json'));
    check(object(codex), 'Codex companion declaration must be an object');
    // OpenAI documents the root manifest's extensions.com.openai as authoritative over the companion overlay.
    companion = { path: '.codex-plugin/plugin.json', precedence: 'root extensions.com.openai overrides companion fields', effective: { ...codex, ...(object(metadata.extensions?.['com.openai']) ? metadata.extensions['com.openai'] : {}) } };
  }
  for (const [namespace, extension] of Object.entries(metadata.extensions || {})) {
    check(object(extension), 'Invalid namespaced extension declaration');
    cap(`extension:${namespace}`, 'host-extension', extension, false, 'Namespaced native host extension preserved');
  }
  check(new Set(capabilities.map(c => c.id)).size === capabilities.length, 'Duplicate capability identifiers');
  return { format, metadata, assets, capabilities, provenance: { source_hash: sha256(JSON.stringify(assets)), declaration: name, ...(companion ? { companion } : {}) } };
}

function validateSsss(bundle) {
  rejectCredentials(bundle);
  check(Array.isArray(bundle?.files) && bundle.files.length <= MAX_FILES && Buffer.byteLength(JSON.stringify(bundle)) <= MAX_BYTES * 2, 'SSSS bundle exceeds bounds');
  for (const file of bundle.files) { safePath(file.path); check(!file.path.split('/').some(p => p.startsWith('.')), 'Infrastructure paths forbidden in bundle'); rejectCredentials(parseDocument(file.content).data); }
  const valid = validateBundle(bundle);
  check(valid.valid, 'Invalid SSSS bundle schema, references or integrity');
  for (const file of bundle.files) {
    const { data } = parseDocument(file.content);
    if (data.x_plugin_import) {
      const payload = Buffer.from(parseDocument(file.content).body.trim(), 'utf8');
      check(sha256(payload) === data.hash, 'Imported payload integrity mismatch');
      const imported = JSON.parse(payload.toString('utf8'));
      decodeAssets(imported.assets);
    }
  }
}

function toBundle(inspected) {
  if (inspected.bundle) return inspected.bundle;
  // Source bytes are stored exactly once (base64 inside the JSON); metadata and capabilities are rebuilt from them on read.
  const payload = JSON.stringify({ format: inspected.format, assets: inspected.assets, provenance: inspected.provenance });
  const files = [{ path: assetPath, content: serializeDocument({ type: 'asset', title: 'Imported plugin source', description: 'Passive lossless plugin declaration and sources', timestamp: '1970-01-01T00:00:00.000Z', name: 'plugin-source', mime_type: 'application/vnd.total-recall.plugin+json', encoding: 'utf-8', hash: sha256(Buffer.from(payload)), x_plugin_import: { format: inspected.format, source_hash: inspected.provenance.source_hash } }, payload) }];
  return { manifest: { name: 'plugin-import', version: '1.0.0', description: 'Imported plugin', exported_at: '1970-01-01T00:00:00.000Z', ssss_core_version: '0.9', required_extensions: [], export_profile: 'backup', primitive_inventory: { asset: 1 }, provisioning: [], parameters: [], file_count: files.length, provenance: { content_hash: contentHash(files), exporter: 'total-recall' } }, files };
}

export async function importPluginSource(input, options = {}) {
  check(typeof options.output === 'string', 'Explicit fresh --output directory required');
  const output = noLinks(options.output);
  check(!fs.existsSync(output), 'Output namespace already exists');
  const inspected = inspectPluginSource(input, options);
  const bundle = toBundle(inspected);
  validateSsss(bundle);
  const provision = provisionBundle(bundle, { workspaceId: 'plugin-import', parameters: options.parameters || {}, dryRun: false });
  check(provision.ok && provision.bindings.every(b => b.value !== null), 'SSSS provisioning failed: unresolved parameters, bindings or references');
  const engine = options.engine || createEngine();
  // Dry-run uses the absent destination and creates no output or infrastructure.
  const preview = await importBundle(provision.plan.map(e => ({ ...e, dry_run: true })), output, engine);
  check(preview.ok, 'SSSS complete-plan preflight failed');
  if (options.dryRun) return { ...preview, format: inspected.format, capabilities: inspected.capabilities };
  fs.mkdirSync(path.dirname(output), { recursive: true, mode: 0o700 });
  const stage = fs.mkdtempSync(path.join(path.dirname(output), '.plugin-import-'));
  let published = false;
  try {
    const result = await importBundle(provision.plan, stage, engine);
    check(result.ok, 'SSSS bundle commit failed');
    check(!fs.existsSync(output), 'Output namespace collision');
    fs.renameSync(stage, output); published = true;
    if (options.compose) {
      const { composeImportedPlugin } = await import('./plugin-import-runtime.mjs');
      await composeImportedPlugin(output, options.compose, options);
    }
    return { ...result, output, format: inspected.format, capabilities: inspected.capabilities };
  } catch (error) {
    if (published) fs.rmSync(output, { recursive: true, force: true });
    throw error;
  } finally { fs.rmSync(stage, { recursive: true, force: true }); }
}

export function readImportedPlugin(vault) {
  const root = noLinks(vault);
  const file = noLinks(path.join(root, assetPath));
  check(fs.statSync(file).size <= MAX_BYTES * 4, 'Imported asset exceeds bounds');
  const { data, body } = parseDocument(fs.readFileSync(file, 'utf8'));
  check(data.type === 'asset' && data.mime_type === 'application/vnd.total-recall.plugin+json', 'Not an imported plugin asset');
  const bytes = Buffer.from(body.trim(), 'utf8');
  check(sha256(bytes) === data.hash, 'Imported plugin payload hash mismatch');
  const imported = JSON.parse(bytes.toString('utf8'));
  check(imported.format === data.x_plugin_import?.format && imported.provenance.source_hash === data.x_plugin_import.source_hash && sha256(JSON.stringify(imported.assets)) === imported.provenance.source_hash, 'Imported plugin metadata mismatch');
  decodeAssets(imported.assets);
  // Rebuild metadata and capability declarations from the hashed bytes so a modified blob cannot inject a handler.
  const rebuilt = inspectAssets(imported.assets, imported.format, imported.provenance.declaration);
  return { ...rebuilt, provenance: imported.provenance };
}
export function exportImportedPlugin(vault) {
  noLinks(vault);
  return exportBundle(vault, { profile: 'backup', name: 'plugin-import' });
}
