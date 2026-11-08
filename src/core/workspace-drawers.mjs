/** Private dashboard chrome settings, shared by the HTTP and CLI adapters. */
import path from 'node:path';
import { executePluginState, PluginStateStore } from './plugin-state-store.mjs';

const OWNER = 'workspace-ui';
const ID = /^[a-z][a-z0-9-]{0,63}$/;
const EMPTY = { html: '', chunks: [], panels: [], shortcuts: [] };
export const MAX_DRAWER_HTML_BYTES = 64 * 1024;

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
    if (typeof panel?.plugin !== 'string' || typeof panel?.element !== 'string' ||
        !ID.test(panel.plugin) || !ID.test(panel.element)) throw new DrawerInputError('Invalid plugin panel reference.');
    return { plugin: panel.plugin, element: panel.element };
  });
  const links = list(shortcuts, 'Shortcuts', 16).map(shortcut => {
    const label = typeof shortcut?.label === 'string' ? shortcut.label.trim() : '';
    if (!label || label.length > 80 || /[\u0000-\u001f\u007f]/.test(label)) throw new DrawerInputError('Give each shortcut a name of 1–80 characters.');
    return { label, href: shortcutHref(shortcut.href) };
  });
  return { html, chunks: [...new Set(chunkIds)], panels: references, shortcuts: links };
}

export function readDrawerConfig(brainDir, edge) {
  const store = new PluginStateStore(stateFile(brainDir, edge), OWNER);
  const config = validateDrawerConfig(store.read(EMPTY));
  return { config, version: store.version };
}

export async function writeDrawerConfig(brainDir, edge, config, version) {
  if (version !== null && (typeof version !== 'string' || !/^[0-9a-f]{64}$/.test(version))) {
    throw new DrawerInputError('Reload the drawer before saving.');
  }
  const value = validateDrawerConfig(config);
  const result = await executePluginState({
    file: stateFile(brainDir, edge), plugin: OWNER, action: 'write', value, expectedVersion: version,
  });
  return { config: value, version: result.version };
}
