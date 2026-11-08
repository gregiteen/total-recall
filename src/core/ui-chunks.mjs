import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { createValidator } from '@ssss/cli/validator';
import { discoverPlugins, resolvePluginFile, validatePluginManifest } from './plugin-loader.mjs';
import { pluginActivation } from './plugin-state.mjs';

const type = 'ui-chunk:chunk';
const idPattern = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;
const timestampPattern = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/;
const surfaces = new Set(['page', 'left', 'right', 'bottom']);
const maxFileBytes = 64 * 1024;
const maxQueryLength = 1024;
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
  if (fs.realpathSync(filename) !== filename || !fs.lstatSync(filename).isFile()) {
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
    throw new UiChunkFileError('panel must identify a declared non-card content element.');
  }
  try {
    resolvePluginFile(root, element.module);
  } catch {
    throw new UiChunkFileError('The declared panel module is unavailable.');
  }
}

function readChunk(root, manifest, id) {
  const contents = readOwnerFile(root, 'ui/chunks/' + id + '.md');
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
  const operations = new Set(manifest.cli?.subcommands?.map(command => command.name));
  if (data.operations !== undefined && !validList(data.operations, 24, operation => operations.has(operation))) {
    throw new UiChunkFileError('operations must name distinct CLI operations declared by this plugin.');
  }
  if (data.data !== undefined && !validList(data.data, 24, ref => {
    if (!isText(ref, 200)) return false;
    const separator = ref.indexOf(':');
    return separator > 0 && operations.has(ref.slice(0, separator)) &&
      /^(?:\/(?:[^~/]|~[01])*)+$/u.test(ref.slice(separator + 1));
  })) {
    throw new UiChunkFileError('data must name declared operations and JSON pointers in the form operation:/path.');
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

export function searchUiChunks({ projectRoot = process.cwd(), plugin, surface, query = '', limit = 40 } = {}) {
  if (plugin !== undefined && !isId(plugin)) throw new UiChunkInputError('Invalid plugin ID.');
  if (surface !== undefined && !surfaces.has(surface)) throw new UiChunkInputError('Invalid UI surface.');
  if (typeof query !== 'string' || query.length > maxQueryLength) throw new UiChunkInputError('Chunk query exceeds 1024 characters or is invalid.');
  if (!Number.isInteger(limit) || limit < 1 || limit > 200) throw new UiChunkInputError('Limit must be between 1 and 200.');
  const chunks = [];
  const diagnostics = [];
  const normalized = query.trim().toLowerCase();
  const terms = tokens(normalized);

  for (const owner of discoverPlugins(projectRoot)) {
    if (!owner.valid || (plugin && owner.id !== plugin)) continue;
    try {
      if (!pluginActivation(owner, { projectRoot }).enabled) continue;
      const root = fs.realpathSync(owner.dir);
      const directory = chunkDirectory(root);
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
          const chunk = metadata(readChunk(root, owner.manifest, id));
          if (surface && !chunk.surfaces.includes(surface)) continue;
          const score = scoreChunk(chunk, normalized, terms);
          if (!normalized || score > 0) chunks.push({ chunk, score });
        } catch (error) {
          diagnostics.push(diagnostic(error, owner.id, id));
        }
      }
    } catch (error) {
      diagnostics.push(diagnostic(error, owner.id));
    }
  }
  chunks.sort((a, b) => b.score - a.score || a.chunk.key.localeCompare(b.chunk.key, 'en'));
  return { chunks: chunks.slice(0, limit).map(entry => entry.chunk), total: chunks.length, diagnostics, retrieval: 'lexical' };
}

export function getUiChunk(plugin, id, { projectRoot = process.cwd(), surface } = {}) {
  if (!isId(plugin) || !isId(id)) throw new UiChunkInputError('Invalid chunk identity.');
  if (surface !== undefined && !surfaces.has(surface)) throw new UiChunkInputError('Invalid UI surface.');
  const owner = discoverPlugins(projectRoot).find(entry => entry.id === plugin && entry.valid);
  if (!owner) return null;
  try {
    if (!pluginActivation(owner, { projectRoot }).enabled) return null;
    const root = fs.realpathSync(owner.dir);
    if (!chunkDirectory(root)) return null;
    ownerFile(root, 'DESIGN.md');
    const chunk = readChunk(root, owner.manifest, id);
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
