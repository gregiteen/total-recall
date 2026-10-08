/** Pure plugin UI manifest validation; rendering belongs to capability owners. */
import path from 'node:path';
export const UI_ELEMENT_KINDS = ['panel', 'form', 'list', 'detail', 'settings', 'widget'];
const PROP_TYPES = ['string', 'number', 'boolean', 'object', 'array'];
const ELEMENT_ID = /^[a-z][a-z0-9-]{0,63}$/;
// Custom element names: lowercase, start with a letter, contain a hyphen.
const TAG = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)+$/;
const RESERVED_TAGS = new Set(['annotation-xml', 'color-profile', 'font-face', 'font-face-src', 'font-face-uri', 'font-face-format', 'font-face-name', 'missing-glyph']);
const PROP_NAME = /^[a-z][a-zA-Z0-9]{0,63}$/;
const RESERVED_PROPS = new Set(['children', 'key', 'ref', 'className', 'style', 'class', 'id', 'slot', 'hidden', 'title', 'lang', 'dir']);
const EVENT_NAME = /^[a-z][a-z0-9-]{0,63}$/;
const TOKEN_NAME = /^[a-z][a-z0-9-]{0,127}$/;

export class UiSpecError extends Error {
  constructor(errors) {
    super(`Invalid ui spec:\n- ${errors.join('\n- ')}`);
    this.name = 'UiSpecError';
    this.errors = errors;
  }
}

const isPlainObject = (v) => typeof v === 'object' && v !== null && !Array.isArray(v);
function isSafePluginPath(p, extension) {
  if (typeof p !== 'string' || !p || p.includes('\0') || p.includes('\\')) return false;
  if (path.posix.isAbsolute(p)) return false;
  const normalized = path.posix.normalize(p);
  return normalized === p && !normalized.startsWith('../') && normalized !== '..' && extension.test(p);
}

function unknownKeys(obj, allowed, where, errors) {
  for (const key of Object.keys(obj)) {
    if (!allowed.includes(key)) errors.push(`${where}: unknown key '${key}'`);
  }
}

function tokenList(value, where, errors) {
  if (value === undefined) return [];
  if (!Array.isArray(value)) {
    errors.push(`${where} must be an array of token names`);
    return [];
  }
  const out = [];
  for (const token of value) {
    if (typeof token !== 'string' || !TOKEN_NAME.test(token)) errors.push(`${where}: '${token}' is not a token name (kebab-case, without the leading --)`);
    else if (out.includes(token)) errors.push(`${where}: '${token}' is listed twice`);
    else out.push(token);
  }
  return out;
}

function normalizeElement(raw, index, errors) {
  const where = `ui.elements[${index}]`;
  if (!isPlainObject(raw)) {
    errors.push(`${where} must be an object`);
    return null;
  }
  unknownKeys(raw, ['id', 'kind', 'tag', 'module', 'slot', 'description', 'props', 'events', 'tokens', 'optional_tokens'], where, errors);
  const el = { id: raw.id, kind: raw.kind, tag: raw.tag, module: raw.module };
  if (typeof raw.id !== 'string' || !ELEMENT_ID.test(raw.id)) errors.push(`${where}.id must be lowercase kebab-case`);
  if (!UI_ELEMENT_KINDS.includes(raw.kind)) errors.push(`${where}.kind must be one of: ${UI_ELEMENT_KINDS.join(', ')}`);
  if (typeof raw.tag !== 'string' || !TAG.test(raw.tag) || RESERVED_TAGS.has(raw.tag)) {
    errors.push(`${where}.tag must be a valid custom element name (lowercase, with a hyphen)`);
  }
  if (!isSafePluginPath(raw.module, /\.m?js$/)) errors.push(`${where}.module must be a normalized relative .js/.mjs path inside the plugin`);
  if (raw.slot !== undefined) {
    if (typeof raw.slot !== 'string' || !ELEMENT_ID.test(raw.slot)) errors.push(`${where}.slot must be lowercase kebab-case`);
    else el.slot = raw.slot;
  }
  if (raw.description !== undefined) {
    if (typeof raw.description !== 'string') errors.push(`${where}.description must be a string`);
    else el.description = raw.description;
  }

  el.props = {};
  if (raw.props !== undefined) {
    if (!isPlainObject(raw.props)) errors.push(`${where}.props must be an object of name → { type }`);
    else {
      for (const [name, def] of Object.entries(raw.props)) {
        const at = `${where}.props.${name}`;
        if (!PROP_NAME.test(name) || RESERVED_PROPS.has(name) || /^on[A-Z]/.test(name)) {
          errors.push(`${at}: prop names are camelCase, not reserved, and do not start with 'on'`);
          continue;
        }
        if (!isPlainObject(def)) {
          errors.push(`${at} must be an object`);
          continue;
        }
        unknownKeys(def, ['type', 'description', 'required'], at, errors);
        if (!PROP_TYPES.includes(def.type)) errors.push(`${at}.type must be one of: ${PROP_TYPES.join(', ')}`);
        if (def.required !== undefined && typeof def.required !== 'boolean') errors.push(`${at}.required must be a boolean`);
        if (def.description !== undefined && typeof def.description !== 'string') errors.push(`${at}.description must be a string`);
        el.props[name] = { type: def.type, ...(def.description ? { description: def.description } : {}), required: def.required === true };
      }
    }
  }

  el.events = [];
  if (raw.events !== undefined) {
    if (!Array.isArray(raw.events)) errors.push(`${where}.events must be an array of event names`);
    else {
      for (const event of raw.events) {
        if (typeof event !== 'string' || !EVENT_NAME.test(event)) errors.push(`${where}.events: '${event}' must be lowercase kebab-case`);
        else if (el.events.includes(event)) errors.push(`${where}.events: '${event}' is listed twice`);
        else el.events.push(event);
      }
    }
  }

  el.tokens = tokenList(raw.tokens, `${where}.tokens`, errors);
  el.optional_tokens = tokenList(raw.optional_tokens, `${where}.optional_tokens`, errors);
  for (const token of el.optional_tokens) {
    if (el.tokens.includes(token)) errors.push(`${where}: '${token}' is both required and optional`);
  }
  return el;
}

/**
 * Validates and normalizes a manifest `ui` block.
 * @param {object} ui
 * @returns {{ design_tokens?: string, elements: object[] }}
 * @throws {UiSpecError}
 */
export function normalizeUiSpec(ui) {
  const errors = [];
  if (!isPlainObject(ui)) throw new UiSpecError(["'ui' must be an object"]);
  unknownKeys(ui, ['design_tokens', 'elements'], 'ui', errors);
  const spec = { elements: [] };
  if (ui.design_tokens !== undefined) {
    if (!isSafePluginPath(ui.design_tokens, /\.md$/)) {
      errors.push('ui.design_tokens must be a normalized relative path to a DESIGN.md-format .md file inside the plugin');
    } else spec.design_tokens = ui.design_tokens;
  }
  if (ui.elements !== undefined && !Array.isArray(ui.elements)) errors.push("'ui.elements' must be an array");
  const ids = new Set();
  const tags = new Set();
  (Array.isArray(ui.elements) ? ui.elements : []).forEach((raw, i) => {
    const el = normalizeElement(raw, i, errors);
    if (!el) return;
    if (ids.has(el.id)) errors.push(`ui.elements[${i}]: duplicate id '${el.id}'`);
    if (tags.has(el.tag)) errors.push(`ui.elements[${i}]: duplicate tag '${el.tag}'`);
    ids.add(el.id);
    tags.add(el.tag);
    spec.elements.push(el);
  });
  if (errors.length) throw new UiSpecError(errors);
  return spec;
}

/** @returns {string[]} validation errors; empty when valid */
export function validateUiSpec(ui) {
  try {
    normalizeUiSpec(ui);
    return [];
  } catch (err) {
    if (err instanceof UiSpecError) return err.errors;
    throw err;
  }
}

