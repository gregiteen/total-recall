import path from 'node:path';
import { configDir } from './paths.mjs';
import { PluginStateStore } from './ssss-store.mjs';
import { getActiveAdapters } from './worker.mjs';

const CODEX_DRAFT = 'codex://threads/new';
const MAX_SELECTION_BYTES = 16_384;
const MAX_DRAFT_LINK_LENGTH = 8_192;
const UNSAFE_TEXT = /[\p{Cc}\p{Cf}\p{Zl}\p{Zp}]/u;
const BRAIN_ID = /^(?:global|project:[^,]+|tenant:[a-zA-Z0-9._-]+)$/u;
const ADAPTER_ID = /^[a-z][a-z0-9-]{0,63}$/;

// Chat preferences follow the dashboard's brain. The auth store override is
// exclusively for credentials and may point outside an isolated dashboard.
const chatStore = () => new PluginStateStore(
  path.join(configDir({ ...process.env, TR_SECRETS_BRAIN: undefined }), 'chat-default.json'),
  'meta-harness',
);
const displayAdapter = ({ id, name }) => ({ id, name });

function brainContext(selection) {
  if (typeof selection !== 'string' || Buffer.byteLength(selection) > MAX_SELECTION_BYTES || UNSAFE_TEXT.test(selection)) {
    throw new Error('Chat requires a bounded comma-separated list of brain IDs');
  }
  const ids = [...new Set(selection.split(',').map(id => id.trim()))];
  if (ids.some(id => !BRAIN_ID.test(id))) throw new Error('Chat brain IDs must use global, project:<name>, or tenant:<name>');
  return `Use this Total Recall brain selection for Chat: ${JSON.stringify(ids)}. Resolve the selected IDs through Total Recall before retrieving or writing memory.`;
}

function launchUrl(adapterId, value) {
  if (value === undefined) return undefined;
  const message = 'Use an HTTPS launch URL without credentials, a query or a fragment, or a Codex Chat link for Codex';
  if (typeof value !== 'string' || value.length > 2048 || UNSAFE_TEXT.test(value) || /\s|\\/u.test(value)) {
    throw new Error(message);
  }
  if (adapterId === 'codex' && /^codex:\/\/threads\/[a-zA-Z0-9_-]{1,128}$/.test(value)) return value;
  if (!value.startsWith('https://') || /[?#]/.test(value)) throw new Error(message);
  const url = URL.parse(value);
  if (!url?.hostname || url.username || url.password) throw new Error(message);
  return url.href;
}

function resolveTarget(settings, adapters, context) {
  const choices = adapters.map(displayAdapter);
  if (!settings) return { ok: true, configured: false, choices, context };
  const adapter = adapters.find(({ id }) => id === settings.adapterId);
  if (!adapter) {
    return {
      ok: true, configured: false, choices, context,
      warning: 'The saved Chat harness is unavailable. Choose a new default.',
    };
  }

  const target = launchUrl(adapter.id, settings.url) ?? (adapter.id === 'codex' ? CODEX_DRAFT : undefined);
  let href = target;
  if (target === CODEX_DRAFT) {
    const draft = `${target}?prompt=${encodeURIComponent(context)}`;
    if (draft.length <= MAX_DRAFT_LINK_LENGTH) href = draft;
  }
  return { ok: true, configured: true, choices, context, harness: displayAdapter(adapter), ...(href ? { href } : {}) };
}

/** Return a draft target. The caller decides when to open it and the operator submits in the harness. */
export function chatTarget(brains = 'global') {
  const context = brainContext(brains);
  const settings = chatStore().read(null);
  if (settings !== null && (!settings || typeof settings.adapterId !== 'string' || !ADAPTER_ID.test(settings.adapterId))) {
    throw new Error('The saved Chat default is invalid');
  }
  return resolveTarget(settings, getActiveAdapters(), context);
}

/** Only the adapter and optional launch URL are persistent. */
export function setChatDefault(adapterId, url) {
  const adapters = getActiveAdapters();
  if (!adapters.some(({ id }) => id === adapterId)) throw new Error('Choose a registered Metaharness adapter for Chat');
  const settings = { adapterId, url: launchUrl(adapterId, url) };
  chatStore().write(settings);
  return resolveTarget(settings, adapters, brainContext('global'));
}
