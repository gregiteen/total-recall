/** Private dashboard chrome settings, shared by the HTTP and CLI adapters. */
import path from 'node:path';
import { executePluginState, PluginStateStore } from './plugin-state-store.mjs';

const OWNER = 'workspace-ui';
const ID = /^[a-z][a-z0-9-]{0,63}$/;
const EMPTY = { html: '', chunks: [], panels: [], shortcuts: [] };
export const MAX_DRAWER_HTML_BYTES = 64 * 1024;
export const MAX_DRAWER_HISTORY = 10;
export const MAX_DRAWER_HISTORY_BYTES = 256 * 1024;
const VERSION = /^[0-9a-f]{64}$/;

export class DrawerInputError extends Error {}

function stateFile(brainDir, edge) {
  if (edge !== 'right' && edge !== 'bottom') throw new DrawerInputError('Choose the right or bottom drawer.');
  return path.join(brainDir, 'config', `workspace-drawer-${edge}.json`);
}

function list(value, name, limit) {
  if (!Array.isArray(value) || value.length > limit) throw new DrawerInputError(`${name} must contain at most ${limit} items.`);
  return value;
}

function shortcutHref(value) {
  if (typeof value !== 'string' || value.length > 1024 || /[\u0000-\u0020\u007f\\]/.test(value)) {
    throw new DrawerInputError('Use a dashboard path or an HTTPS address for each shortcut.');
  }
  const base = 'https://workspace.invalid';
  let url;
  try { url = new URL(value, base); } catch { throw new DrawerInputError('Invalid shortcut address.'); }
  if (value.startsWith('/') && !value.startsWith('//') && url.origin === base && !url.pathname.startsWith('//') &&
      !/%(?:2f|5c)/i.test(url.pathname)) {
    return url.pathname + url.search + url.hash;
  }
  if (value.startsWith('https://') && !url.username && !url.password) return url.href;
  throw new DrawerInputError('Use a dashboard path or an HTTPS address for each shortcut.');
}

export function validateDrawerConfig(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).some(key => !Object.hasOwn(EMPTY, key))) {
    throw new DrawerInputError('Invalid drawer configuration.');
  }
  const { html = '', chunks = [], panels = [], shortcuts = [] } = value;
  if (typeof html !== 'string' || Buffer.byteLength(html, 'utf8') > MAX_DRAWER_HTML_BYTES) {
    throw new DrawerInputError('Drawer HTML must be at most 64 KiB.');
  }
  const chunkIds = list(chunks, 'Chunks', 8).map(key => {
    if (typeof key !== 'string' || key.split(':').length !== 2 || key.split(':').some(id => !ID.test(id))) {
      throw new DrawerInputError('Each chunk needs a plugin ID and a chunk ID.');
    }
    return key;
  });
  const references = list(panels, 'Panels', 6).map(panel => {
    if (!panel || Object.keys(panel).some(key => !['plugin', 'element'].includes(key)) ||
        typeof panel?.plugin !== 'string' || typeof panel?.element !== 'string' ||
        !ID.test(panel.plugin) || !ID.test(panel.element)) throw new DrawerInputError('Invalid plugin panel reference.');
    return { plugin: panel.plugin, element: panel.element };
  });
  const links = list(shortcuts, 'Shortcuts', 16).map(shortcut => {
    if (!shortcut || Object.keys(shortcut).some(key => !['label', 'href'].includes(key))) throw new DrawerInputError('Invalid shortcut.');
    const label = typeof shortcut?.label === 'string' ? shortcut.label.trim() : '';
    if (!label || label.length > 80 || /[\u0000-\u001f\u007f]/.test(label)) throw new DrawerInputError('Give each shortcut a name of 1–80 characters.');
    return { label, href: shortcutHref(shortcut.href) };
  });
  return { html, chunks: [...new Set(chunkIds)], panels: references, shortcuts: links };
}

function readState(brainDir, edge) {
  const store = new PluginStateStore(stateFile(brainDir, edge), OWNER);
  const value = store.read(EMPTY);
  // The original canonical document held only a layout. Reads never migrate or
  // create state; the next CAS-protected save archives it in the new envelope.
  if (!Object.hasOwn(value ?? {}, 'schemaVersion')) {
    return { config: validateDrawerConfig(value), history: [], version: store.version };
  }
  try {
    if (value.schemaVersion !== 1 || Object.keys(value).some(key => !['schemaVersion', 'config', 'history'].includes(key)) ||
        !Array.isArray(value.history) || value.history.length > MAX_DRAWER_HISTORY ||
        Buffer.byteLength(JSON.stringify(value.history)) > MAX_DRAWER_HISTORY_BYTES) throw new Error();
    const seen = new Set();
    const history = value.history.map(entry => {
      if (!entry || Object.keys(entry).some(key => !['version', 'savedAt', 'config'].includes(key)) ||
          typeof entry.version !== 'string' || !VERSION.test(entry.version) || seen.has(entry.version) ||
          typeof entry.savedAt !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(entry.savedAt) ||
          !Number.isFinite(Date.parse(entry.savedAt)) || new Date(entry.savedAt).toISOString() !== entry.savedAt) throw new Error();
      seen.add(entry.version);
      return { ...entry, config: validateDrawerConfig(entry.config) };
    });
    return { config: validateDrawerConfig(value.config), history, version: store.version };
  } catch { throw new Error('Invalid saved drawer history.'); }
}

export function readDrawerConfig(brainDir, edge) {
  const { config, version } = readState(brainDir, edge);
  return { config, version };
}

export function readDrawerHistory(brainDir, edge) {
  const { history, version } = readState(brainDir, edge);
  return { history, version };
}

function checkVersion(version) {
  if (version !== null && (typeof version !== 'string' || !VERSION.test(version))) {
    throw new DrawerInputError('Reload the drawer before saving.');
  }
}

export async function writeDrawerConfig(brainDir, edge, config, version) {
  checkVersion(version);
  const value = validateDrawerConfig(config);
  const current = readState(brainDir, edge);
  if (current.version !== version) throw new Error('Plugin state version conflict; reload before retrying');
  const history = [...current.history];
  if (current.version !== null) history.unshift({ version: current.version, savedAt: new Date().toISOString(), config: current.config });
  history.splice(MAX_DRAWER_HISTORY);
  while (Buffer.byteLength(JSON.stringify(history)) > MAX_DRAWER_HISTORY_BYTES) history.pop();
  const result = await executePluginState({
    file: stateFile(brainDir, edge), plugin: OWNER, action: 'write',
    value: { schemaVersion: 1, config: value, history }, expectedVersion: version,
  });
  return { config: value, version: result.version };
}

export async function restoreDrawerConfig(brainDir, edge, revision, version) {
  checkVersion(version);
  if (typeof revision !== 'string' || !VERSION.test(revision)) throw new DrawerInputError('Choose a saved drawer revision.');
  const current = readState(brainDir, edge);
  if (current.version !== version) throw new Error('Plugin state version conflict; reload before retrying');
  const saved = current.history.find(entry => entry.version === revision);
  if (!saved) throw new DrawerInputError('That saved drawer revision is unavailable.');
  return writeDrawerConfig(brainDir, edge, saved.config, version);
}
