import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { createValidator } from '@ssss/cli/validator';
import { discoverPlugins, resolvePluginFile, validatePluginManifest } from './plugin-loader.mjs';
import { pluginActivation } from './plugin-state.mjs';
import { executePluginState, listPluginStates, PluginStateStore } from './plugin-state-store.mjs';
import { collectCssVariables, extractFrontmatter, resolveTokenReferences } from './app-deploy/design-tokens.mjs';

const type = 'ui-chunk:chunk';
const idPattern = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;
const timestampPattern = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/;
const surfaces = new Set(['page', 'left', 'right', 'bottom']);
const maxFileBytes = 64 * 1024;
const maxQueryLength = 1024;
const POOL = 'workspace-chunk-pool';
export const uiChunkRegistryPath = path.join(import.meta.dirname, 'ui-chunk.registry.json');
const registry = JSON.parse(fs.readFileSync(uiChunkRegistryPath, 'utf8'));
const validator = createValidator({ extensions: [registry] });

export class UiChunkInputError extends Error {}
class UiChunkFileError extends Error {}

function isId(value) {
  return typeof value === 'string' && value.length <= 64 && idPattern.test(value);
}

function isText(value, max) {
  return typeof value === 'string' && value.trim().length > 0 &&
    value.length <= max && !/[\u0000-\u001f\u007f]/u.test(value);
}

function validTimestamp(value) {
  return typeof value === 'string' && timestampPattern.test(value) && Number.isFinite(Date.parse(value));
}

function validList(list, max, test) {
  return Array.isArray(list) && list.length > 0 && list.length <= max &&
    new Set(list).size === list.length && list.every(test);
}

// An installed plugin itself may be a deliberate owner link. Files and directories
// inside its resolved root must be regular, and never traverse another link.
function ownerFile(root, relative) {
  const filename = path.join(root, relative);
  if (!filename.startsWith(root + path.sep) || fs.realpathSync(filename) !== filename || !fs.lstatSync(filename).isFile()) {
    throw new UiChunkFileError('Chunk files and DESIGN.md must be regular files inside the plugin.');
  }
  return filename;
}

function readOwnerFile(root, relative) {
  const filename = ownerFile(root, relative);
  const fd = fs.openSync(filename, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW | fs.constants.O_NONBLOCK);
  try {
    const stat = fs.fstatSync(fd);
    if (!stat.isFile() || fs.realpathSync(filename) !== filename) {
      throw new UiChunkFileError('Chunk files must be regular files inside the plugin.');
    }
    if (stat.size > maxFileBytes) throw new UiChunkFileError('Chunk file exceeds 64 KiB.');
    const buffer = Buffer.alloc(Math.min(stat.size + 1, maxFileBytes + 1));
    let used = 0;
    while (used < buffer.length) {
      const count = fs.readSync(fd, buffer, used, buffer.length - used, null);
      if (count === 0) break;
      used += count;
    }
    if (used !== stat.size) throw new UiChunkFileError('Chunk file changed while being read. Retry.');
    return buffer.subarray(0, used);
  } finally {
    fs.closeSync(fd);
  }
}

const componentProperties = {
  backgroundColor: 'background-color', textColor: 'color', color: 'color',
  borderColor: 'border-color', borderWidth: 'border-width', borderStyle: 'border-style',
  rounded: 'border-radius', padding: 'padding', gap: 'gap', size: 'inline-size',
  width: 'width', height: 'height', fontFamily: 'font-family', fontSize: 'font-size',
  fontWeight: 'font-weight', lineHeight: 'line-height', letterSpacing: 'letter-spacing',
  fontFeature: 'font-feature-settings', fontVariation: 'font-variation-settings',
};

function designValue(value) {
  const css = String(value);
  if (/[;{}<>\\\r\n]|\/\*|\burl\s*\(/i.test(css)) {
    throw new UiChunkFileError('Unsafe design token value.');
  }
  return css;
}

export function compilePluginDesign(markdown) {
  // Older owners published the token map in a fenced YAML section.
  const legacy = !/^\uFEFF?---(?:\r?\n|$)/.test(markdown) &&
    markdown.match(/^```yaml\r?\n(tokens:\r?\n[\s\S]*?)^```[ \t]*$/m);
  if (/^\uFEFF?---(?:\r?\n|$)/.test(markdown) && !/^\uFEFF?---\r?\n[\s\S]*?\r?\n---[ \t]*(?:\r?\n|$)/.test(markdown)) {
    throw new UiChunkFileError('Incomplete design frontmatter.');
  }
  const tokens = extractFrontmatter(legacy ? '---\n' + legacy[1] + '---\n' : markdown);
  const flat = Object.entries(tokens.tokens || {}).filter(([name, value]) =>
    /^(?:color|font|spacing|radius|border-radius)(?:-[a-z0-9-]+)?$/.test(name) &&
    (typeof value === 'string' || typeof value === 'number'));
  const entries = new Map([...flat, ...collectCssVariables(tokens)]);
  const properties = Object.fromEntries([...entries].map(([name, value]) => ['--' + name, designValue(value)]));
  const resolved = resolveTokenReferences(tokens);
  const components = [];
  const rules = Object.entries(resolved.components || {}).map(([component, values]) => {
    if (!/^[A-Za-z0-9_-]{1,80}$/.test(component) || !values || typeof values !== 'object') return '';
    const definitions = { ...values.typography, ...values };
    const declarations = Object.entries(componentProperties).flatMap(([key, property]) => {
      const value = definitions[key];
      return typeof value === 'string' || typeof value === 'number' ? [property + ':' + designValue(value) + ';'] : [];
    });
    if (!declarations.length) return '';
    components.push(component);
    return '[data-design-component="' + component + '"]{' + declarations.join('') + '}';
  });
  const css = ':root{' + Object.entries(properties).map(([name, value]) => name + ':' + value + ';').join('') + '}\n' +
    rules.join('\n');
  return { css, components };
}

export function readPluginDesign(plugin, { projectRoot = process.cwd(), revision } = {}) {
  if (!isId(plugin)) throw new UiChunkInputError('Invalid plugin ID.');
  const owner = discoverPlugins(projectRoot).find(entry => entry.id === plugin && entry.valid);
  if (!owner || !pluginActivation(owner, { projectRoot }).enabled) return null;
  const root = fs.realpathSync(owner.dir);
  const declared = owner.manifest.ui?.design_tokens;
  for (const file of declared ? [declared] : ['DESIGN.md', 'ui/DESIGN.md']) {
    let content;
    try {
      content = readOwnerFile(root, file);
    } catch (error) {
      if (!declared && error.code === 'ENOENT') continue;
      throw new UiChunkInputError('The plugin design file could not be read.');
    }
    const version = createHash('sha256').update(content).digest('hex');
    if (version === revision) return { unchanged: true };
    try {
      return { revision: version, ...compilePluginDesign(new TextDecoder('utf-8', { fatal: true }).decode(content)) };
    } catch {
      throw new UiChunkInputError('The plugin design contains invalid tokens. Showing the last valid design.');
    }
  }
  return { revision: null, css: '', components: [] };
}

function chunkDirectory(root) {
  for (const relative of ['ui', 'ui/chunks']) {
    const directory = path.join(root, relative);
    let stat;
    try {
      stat = fs.lstatSync(directory);
    } catch (error) {
      if (error.code === 'ENOENT') return null;
      throw error;
    }
    if (!stat.isDirectory() || stat.isSymbolicLink()) {
      throw new UiChunkFileError('ui/chunks must be a regular directory inside the plugin.');
    }
  }
  return path.join(root, 'ui', 'chunks');
}

function nativePanel(manifest, id, root) {
  const element = manifest.ui?.elements?.find(entry => entry.id === id);
  if (!element || !['panel', 'form', 'list', 'detail', 'widget'].includes(element.kind)) {
    throw new UiChunkFileError('panel must identify a declared native content element.');
  }
  try {
    resolvePluginFile(root, element.module);
  } catch {
    throw new UiChunkFileError('The declared panel module is unavailable.');
  }
}

function readChunk(root, manifest, id) {
  const contents = readOwnerFile(root, 'ui/chunks/' + id + '.md');
  return parseChunk(contents, root, manifest, id);
}

function parseChunk(contents, root, manifest, id) {
  let source;
  try {
    source = new TextDecoder('utf-8', { fatal: true }).decode(contents);
  } catch {
    throw new UiChunkFileError('Chunk file must be UTF-8.');
  }
  const result = validator.validateDocument(source);
  if (!result.valid || result.data?.type !== type) {
    throw new UiChunkFileError('Invalid SSSS UI chunk frontmatter. Run total-recall ssss validate for field errors.');
  }
  const data = result.data;
  if (data.plugin !== manifest.id || data.id !== id) {
    throw new UiChunkFileError('Chunk identity must match the owning manifest and filename.');
  }
  if (!isText(data.title, 120) || !isText(data.description, 600) || !validTimestamp(data.timestamp)) {
    throw new UiChunkFileError('Chunk needs a short title, description and ISO timestamp.');
  }
  if (!validList(data.intents, 12, item => isText(item, 100)) ||
      !validList(data.surfaces, 4, surface => surfaces.has(surface))) {
    throw new UiChunkFileError('Chunk needs distinct intent strings and allowed surfaces.');
  }
  if (data.panel !== undefined) {
    if (!isId(data.panel)) throw new UiChunkFileError('Invalid panel ID.');
    nativePanel(manifest, data.panel, root);
  }
  const operations = new Map(manifest.cli?.subcommands?.map(command => [command.name, command]));
  if (data.operations !== undefined && !validList(data.operations, 24, operation => operations.has(operation))) {
    throw new UiChunkFileError('operations must name distinct CLI operations declared by this plugin.');
  }
  if (data.data !== undefined && !validList(data.data, 24, ref => {
    if (!isText(ref, 200)) return false;
    const separator = ref.indexOf(':');
    const operation = separator > 0 && operations.get(ref.slice(0, separator));
    return operation && operation.sensitive_output !== true &&
      /^(?:\/(?:[^~/]|~[01])*)+$/u.test(ref.slice(separator + 1));
  })) {
    throw new UiChunkFileError('data must name non-sensitive declared operations and JSON pointers in the form operation:/path.');
  }
  const html = result.body.trim();
  if (!html.startsWith('<') || html.includes('\0')) {
    throw new UiChunkFileError('Chunk body must contain raw HTML.');
  }
  return {
    key: data.plugin + ':' + id,
    plugin: data.plugin,
    id,
    title: data.title.trim(),
    description: data.description.trim(),
    intents: data.intents.map(intent => intent.trim()),
    surfaces: data.surfaces,
    ...(data.panel === undefined ? {} : { panel: data.panel }),
    ...(data.operations === undefined ? {} : { operations: data.operations }),
    ...(data.data === undefined ? {} : { data: data.data }),
    sha256: createHash('sha256').update(contents).digest('hex'),
    html,
  };
}

function metadata({ html: _html, ...chunk }) {
  return chunk;
}

function poolDirectory(brainDir) {
  return path.join(brainDir, 'config', POOL);
}

function poolFile(brainDir, plugin, id) {
  return path.join(poolDirectory(brainDir), plugin + ':' + id + '.json');
}

function poolChunk(value, root, manifest, id) {
  if (!value || value.plugin !== manifest.id || value.id !== id ||
      typeof value.markdown !== 'string' || Buffer.byteLength(value.markdown) > maxFileBytes) {
    throw new UiChunkFileError('Invalid workspace block record.');
  }
  return { ...parseChunk(Buffer.from(value.markdown), root, manifest, id), origin: 'workspace' };
}

export async function addWorkspaceUiChunk(brainDir, { plugin, id, markdown }, projectRoot = process.cwd()) {
  if (!isId(plugin) || !isId(id)) throw new UiChunkInputError('Invalid block identity.');
  const owner = discoverPlugins(projectRoot).find(entry => entry.id === plugin && entry.valid);
  if (!owner || !pluginActivation(owner, { projectRoot }).enabled) throw new UiChunkInputError('The block owner must be installed and enabled.');
  const root = fs.realpathSync(owner.dir);
  const directory = chunkDirectory(root);
  if (directory && fs.lstatSync(path.join(directory, id + '.md'), { throwIfNoEntry: false })) {
    throw new UiChunkInputError('That block ID belongs to the installed plugin.');
  }
  const value = { plugin, id, markdown };
  let chunk;
  try { chunk = poolChunk(value, root, owner.manifest, id); }
  catch (error) {
    if (error instanceof UiChunkFileError) throw new UiChunkInputError(error.message);
    throw error;
  }
  const file = poolFile(brainDir, plugin, id);
  const result = await executePluginState({ file, plugin: POOL, action: 'write', value, expectedVersion: null });
  return { chunk: metadata(chunk), version: result.version };
}

function diagnostic(error, plugin, id) {
  const message = error instanceof UiChunkFileError
    ? error.message
    : 'Could not read the owner chunk files.';
  return { plugin, ...(id ? { id } : {}), message };
}

export function validateUiChunkFile(filename, { pluginDir } = {}) {
  if (typeof filename !== 'string' || !filename) throw new UiChunkInputError('Specify a chunk file.');
  const file = path.resolve(filename);
  const root = fs.realpathSync(pluginDir || path.resolve(file, '../../..'));
  const id = path.basename(file, '.md');
  if (!isId(id) || fs.realpathSync(path.dirname(file)) !== chunkDirectory(root) ||
      path.basename(file) !== id + '.md') {
    throw new UiChunkInputError('Place the file at ui/chunks/<id>.md inside its plugin.');
  }
  const manifest = JSON.parse(readOwnerFile(root, 'plugin.json').toString('utf8'));
  if (!validatePluginManifest(manifest).valid) throw new UiChunkInputError('The owner plugin manifest is invalid.');
  ownerFile(root, 'DESIGN.md');
  return metadata(readChunk(root, manifest, id));
}

function tokens(value) {
  return new Set(value.normalize('NFKC').toLowerCase().match(/[\p{L}\p{N}]+/gu) || []);
}

function scoreChunk(chunk, query, terms) {
  if (!query) return 0;
  if (query === chunk.key || query === chunk.id) return Number.MAX_SAFE_INTEGER;
  const identity = tokens(chunk.key + ' ' + chunk.title);
  const intents = tokens([...chunk.intents, ...(chunk.operations || []), ...(chunk.data || [])].join(' '));
  const description = tokens(chunk.description);
  let score = 0;
  for (const term of terms) {
    score += (identity.has(term) ? 5 : 0) + (intents.has(term) ? 3 : 0) + (description.has(term) ? 1 : 0);
  }
  return score;
}

export function searchUiChunks({ projectRoot = process.cwd(), brainDir, plugin, surface, query = '', limit = 40, offset = 0 } = {}) {
  if (plugin !== undefined && !isId(plugin)) throw new UiChunkInputError('Invalid plugin ID.');
  if (surface !== undefined && !surfaces.has(surface)) throw new UiChunkInputError('Invalid UI surface.');
  if (typeof query !== 'string' || query.length > maxQueryLength) throw new UiChunkInputError('Chunk query exceeds 1024 characters or is invalid.');
  if (!Number.isInteger(limit) || limit < 1 || limit > 200) throw new UiChunkInputError('Limit must be between 1 and 200.');
  if (!Number.isSafeInteger(offset) || offset < 0) throw new UiChunkInputError('Offset must be a nonnegative integer.');
  const chunks = [];
  const diagnostics = [];
  const normalized = query.trim().toLowerCase();
  const terms = tokens(normalized);
  const installed = discoverPlugins(projectRoot).filter(owner => owner.valid && (!plugin || owner.id === plugin));
  const visible = new Map();
  const keys = new Set();
  const add = (record) => {
    if (keys.has(record.key)) return;
    keys.add(record.key);
    if (surface && !record.surfaces.includes(surface)) return;
    const score = scoreChunk(record, normalized, terms);
    if (!normalized || score > 0) chunks.push({ chunk: metadata(record), score });
  };

  for (const owner of installed) {
    try {
      if (!pluginActivation(owner, { projectRoot }).enabled) continue;
      const root = fs.realpathSync(owner.dir);
      const directory = chunkDirectory(root);
      visible.set(owner.id, { root, manifest: owner.manifest, directory });
      if (!directory) continue;
      const files = fs.readdirSync(directory).filter(name => name.endsWith('.md')).sort();
      if (!files.length) continue;
      ownerFile(root, 'DESIGN.md');
      for (const file of files) {
        const id = path.basename(file, '.md');
        if (!isId(id)) {
          diagnostics.push({ plugin: owner.id, message: 'Chunk filename must be <kebab-case-id>.md.' });
          continue;
        }
        try {
          add(readChunk(root, owner.manifest, id));
        } catch (error) {
          diagnostics.push(diagnostic(error, owner.id, id));
        }
      }
    } catch (error) {
      diagnostics.push(diagnostic(error, owner.id));
    }
  }
  if (brainDir) {
    for (const { value } of listPluginStates(poolDirectory(brainDir), POOL)) {
      const owner = visible.get(value?.plugin);
      if (!owner || !isId(value.id)) continue;
      try {
        if (owner.directory && fs.lstatSync(path.join(owner.directory, value.id + '.md'), { throwIfNoEntry: false })) continue;
        add(poolChunk(value, owner.root, owner.manifest, value.id));
      } catch (error) { diagnostics.push(diagnostic(error, value.plugin, value.id)); }
    }
  }
  chunks.sort((a, b) => b.score - a.score || a.chunk.key.localeCompare(b.chunk.key, 'en'));
  return { chunks: chunks.slice(offset, offset + limit).map(entry => entry.chunk), total: chunks.length, diagnostics, retrieval: 'lexical' };
}

export function getUiChunk(plugin, id, { projectRoot = process.cwd(), surface, brainDir } = {}) {
  if (!isId(plugin) || !isId(id)) throw new UiChunkInputError('Invalid chunk identity.');
  if (surface !== undefined && !surfaces.has(surface)) throw new UiChunkInputError('Invalid UI surface.');
  const owner = discoverPlugins(projectRoot).find(entry => entry.id === plugin && entry.valid);
  if (!owner) return null;
  try {
    if (!pluginActivation(owner, { projectRoot }).enabled) return null;
    const root = fs.realpathSync(owner.dir);
    const directory = chunkDirectory(root);
    let chunk;
    if (directory && fs.lstatSync(path.join(directory, id + '.md'), { throwIfNoEntry: false })) {
      ownerFile(root, 'DESIGN.md');
      chunk = readChunk(root, owner.manifest, id);
    } else if (brainDir) {
      const record = new PluginStateStore(poolFile(brainDir, plugin, id), POOL).read(null);
      if (record) chunk = poolChunk(record, root, owner.manifest, id);
    }
    if (!chunk) return null;
    return !surface || chunk.surfaces.includes(surface) ? chunk : null;
  } catch {
    return null;
  }
}

export function auditUiChunkCoverage({ projectRoot = process.cwd(), plugin } = {}) {
  if (plugin !== undefined && !isId(plugin)) throw new UiChunkInputError('Invalid plugin ID.');
  return discoverPlugins(projectRoot).filter(owner => !plugin || owner.id === plugin).map(owner => {
    let design = null;
    for (const file of ['DESIGN.md', 'ui/DESIGN.md']) {
      try {
        ownerFile(fs.realpathSync(owner.dir), file);
        design = file;
        break;
      } catch { /* Check the other supported owner path. */ }
    }
    const { chunks, total, diagnostics } = searchUiChunks({ projectRoot, plugin: owner.id, surface: 'page', limit: 200 });
    const covered = new Set(chunks.flatMap(chunk => chunk.operations || []));
    const operations = owner.manifest?.cli?.subcommands?.map(command => command.name) || [];
    const missing = operations.filter(operation => !covered.has(operation));
    return {
      plugin: owner.id,
      active: owner.valid && pluginActivation(owner, { projectRoot }).enabled,
      design,
      panels: (owner.manifest?.ui?.elements || []).filter(element =>
        ['panel', 'form', 'list', 'detail', 'widget'].includes(element.kind)).map(element => element.id),
      pageBlocks: total,
      dataBindings: [...new Set(chunks.flatMap(chunk => chunk.data || []))].sort(),
      operations: { total: operations.length, missing },
      partial: chunks.length < total,
      diagnostics,
    };
  });
}
