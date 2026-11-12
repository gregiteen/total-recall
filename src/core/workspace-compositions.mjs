import fs from 'node:fs';
import path from 'node:path';
import { executePluginState, listPluginStates, PluginStateStore } from './plugin-state-store.mjs';
import { getUiChunk, UiChunkInputError } from './ui-chunks.mjs';
import { getPluginById } from './plugin-loader.mjs';
import { pluginActivation } from './plugin-state.mjs';

const OWNER = 'workspace-ui';
const SAVED_PAGES = 'workspace-pages';
const ID = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;
const VERSION = /^[a-f0-9]{64}$/;
const MAX_PAGE_BLOCKS = 24;

function stateFile(brainDir, plugin) {
  if (typeof plugin !== 'string' || plugin.length > 64 || !ID.test(plugin)) throw new UiChunkInputError('Invalid plugin ID.');
  return path.join(brainDir, 'config', 'workspace-compositions', plugin + '.json');
}

function readCompositionState(brainDir, plugin, projectRoot) {
  const store = new PluginStateStore(stateFile(brainDir, plugin), OWNER);
  const owner = getPluginById(plugin, projectRoot);
  if (!owner?.valid || !pluginActivation(owner, { projectRoot }).enabled) {
    throw new UiChunkInputError('The destination plugin must be installed and enabled.');
  }
  const state = store.read({ keys: [] });
  return { keys: state.keys, version: store.version };
}

function readPageBlocks(brainDir, keys, projectRoot) {
  return keys.flatMap(key => {
    const chunk = readPageBlock(brainDir, key, projectRoot);
    if (!chunk) return [];
    const { html: _html, ...metadata } = chunk;
    return [metadata];
  });
}

export function readWorkspaceComposition(brainDir, plugin, projectRoot = process.cwd()) {
  const { keys, version } = readCompositionState(brainDir, plugin, projectRoot);
  return { chunks: readPageBlocks(brainDir, keys, projectRoot), version };
}

function readPageBlock(brainDir, key, projectRoot) {
  if (typeof key !== 'string') return null;
  const [owner, id, ...rest] = key.split(':');
  return ID.test(owner) && typeof id === 'string' && ID.test(id) && !rest.length
    ? getUiChunk(owner, id, { surface: 'page', brainDir, projectRoot }) : null;
}

export async function publishWorkspaceComposition(brainDir, plugin, keys, version, projectRoot = process.cwd()) {
  const file = stateFile(brainDir, plugin);
  const owner = getPluginById(plugin, projectRoot);
  if (!owner?.valid || !pluginActivation(owner, { projectRoot }).enabled ||
      !keys.length || keys.length > 3 || keys.some(key => !readPageBlock(brainDir, key, projectRoot))) {
    throw new UiChunkInputError('The selected page blocks changed. Compose the view again.');
  }
  return executePluginState({ file, plugin: OWNER, action: 'write', value: { keys }, expectedVersion: version });
}

function pageDirectory(brainDir) {
  const config = path.join(brainDir, 'config');
  const directory = path.join(config, SAVED_PAGES);
  for (const candidate of [config, directory]) {
    const stat = fs.lstatSync(candidate, { throwIfNoEntry: false });
    if (stat && !stat.isDirectory()) throw new Error('Unsafe saved page directory');
  }
  return directory;
}

function savedPageFile(brainDir, id) {
  if (typeof id !== 'string' || id.length > 64 || !ID.test(id)) throw new UiChunkInputError('Invalid saved page ID.');
  return path.join(pageDirectory(brainDir), id + '.json');
}

function pageConflict(message) {
  return Object.assign(new Error(message), { status: 409 });
}

export function listWorkspacePages(brainDir) {
  return listPluginStates(pageDirectory(brainDir), SAVED_PAGES)
    .map(({ value: { id, title }, version }) => ({ id, title, version }))
    .sort((a, b) => a.title.localeCompare(b.title) || a.id.localeCompare(b.id));
}

export function readWorkspacePage(brainDir, id, projectRoot = process.cwd()) {
  const store = new PluginStateStore(savedPageFile(brainDir, id), SAVED_PAGES);
  const page = store.read(null);
  if (!page) return null;
  return { id, title: page.title, version: store.version, chunks: readPageBlocks(brainDir, page.keys, projectRoot) };
}

export function prepareWorkspacePage(brainDir, id, title) {
  const file = savedPageFile(brainDir, id);
  const name = typeof title === 'string' ? title.trim() : '';
  if (!name || name.length > 120 || /[\u0000-\u001f\u007f-\u009f]/u.test(title)) {
    throw new UiChunkInputError('Enter a saved page title of up to 120 characters.');
  }
  const store = new PluginStateStore(file, SAVED_PAGES);
  if (store.read(null)) throw pageConflict('That saved page ID already exists.');
  return { title: name, file };
}

function verifyPageBlocks(brainDir, keys, projectRoot) {
  if (!Array.isArray(keys) || !keys.length || keys.length > MAX_PAGE_BLOCKS || new Set(keys).size !== keys.length) {
    throw new UiChunkInputError(`Choose one to ${MAX_PAGE_BLOCKS} distinct page blocks.`);
  }
  const chunks = readPageBlocks(brainDir, keys, projectRoot);
  if (chunks.length !== keys.length) throw pageConflict('The selected page blocks are no longer available.');
  return chunks;
}

export async function createWorkspacePage(brainDir, { id, title, keys }, projectRoot = process.cwd()) {
  const page = prepareWorkspacePage(brainDir, id, title);
  const chunks = verifyPageBlocks(brainDir, keys, projectRoot);
  try {
    const { version } = await executePluginState({
      file: page.file, plugin: SAVED_PAGES, action: 'write',
      value: { id, title: page.title, keys }, expectedVersion: null,
    });
    return { id, title: page.title, version, chunks };
  } catch (error) {
    if (error.message.startsWith('Plugin state version conflict')) throw pageConflict('That saved page ID already exists.');
    throw error;
  }
}

export async function updateWorkspacePage(brainDir, { id, keys, revision }, projectRoot = process.cwd()) {
  if (typeof revision !== 'string' || !VERSION.test(revision)) {
    throw new UiChunkInputError('Supply the current saved page revision.');
  }
  const file = savedPageFile(brainDir, id);
  const store = new PluginStateStore(file, SAVED_PAGES);
  const page = store.read(null);
  if (!page) throw Object.assign(new Error('Saved page unavailable'), { status: 404 });
  if (store.version !== revision) throw pageConflict('The saved page changed. Read its current revision before editing.');
  const chunks = verifyPageBlocks(brainDir, keys, projectRoot);
  const { version } = await executePluginState({
    file, plugin: SAVED_PAGES, action: 'write',
    value: { id, title: page.title, keys }, expectedVersion: revision,
  });
  return { id, title: page.title, version, chunks };
}

export async function saveWorkspaceCompositionPage(brainDir, { id, title, sourcePlugin, sourceVersion }, projectRoot = process.cwd()) {
  if (typeof sourceVersion !== 'string' || !VERSION.test(sourceVersion)) {
    throw new UiChunkInputError('Supply the published Home revision to save.');
  }
  const { keys, version } = readCompositionState(brainDir, sourcePlugin, projectRoot);
  if (version !== sourceVersion) throw pageConflict('The plugin Home changed. Read its current revision before saving.');
  return createWorkspacePage(brainDir, { id, title, keys }, projectRoot);
}
