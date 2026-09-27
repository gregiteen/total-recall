/**
 * Total Recall — plugin UI elements and their framework adapters.
 *
 * A plugin authors each UI element once, as a self-contained custom element
 * (an ES module that defines exactly one tag, imports nothing, and styles itself
 * only with the design-token CSS variables it declares). This module validates
 * the manifest's `ui` spec and the element sources, then generates, without
 * writing, the files a host app needs:
 *
 *   web-components  tokens.css + elements/<id>.js + index.js (Flask/Jinja, any HTML host)
 *   react           the same, plus react/<Name>.jsx|tsx wrappers for React/Next
 *
 * The app's DESIGN.md becomes tokens.css, so an app restyles every element by
 * editing its tokens; the element files do not change. Generation is
 * deterministic: the same plugin, tokens, and options give byte-identical files.
 */

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { parseDesignTokens, validatePluginUiAgainstTokens } from './design-tokens.mjs';

export const UI_TARGETS = ['web-components', 'react'];
const ADAPTER_UI_TARGETS = { 'ssss-app': 'web-components', flask: 'web-components', nextjs: 'react', react: 'react' };
export const UI_ELEMENT_KINDS = ['panel', 'form', 'list', 'detail', 'settings', 'widget'];
const PROP_TYPES = ['string', 'number', 'boolean', 'object', 'array'];
const MAX_ELEMENT_BYTES = 256 * 1024;
export const UI_MANIFEST_FILE = 'ui-manifest.json';

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

export class UiElementError extends Error {
  constructor(errors) {
    super(`UI elements failed validation:\n- ${errors.join('\n- ')}`);
    this.name = 'UiElementError';
    this.errors = errors;
  }
}

const isPlainObject = (v) => typeof v === 'object' && v !== null && !Array.isArray(v);
const sha256 = (text) => crypto.createHash('sha256').update(text).digest('hex');
const pascal = (id) => id.split('-').map((p) => p.charAt(0).toUpperCase() + p.slice(1)).join('');
export const eventHandlerName = (event) => `on${pascal(event)}`;

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

export function uiTargetForAdapter(adapter) {
  const target = ADAPTER_UI_TARGETS[adapter];
  if (!target) throw new Error(`Adapter '${adapter}' has no UI element target (known: ${Object.keys(ADAPTER_UI_TARGETS).join(', ')})`);
  return target;
}

function stripComments(source) {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`\\])\/\/[^\n]*/g, '$1');
}

/**
 * Checks one element module against its declaration.
 * @returns {{ errors: string[], warnings: string[] }}
 */
export function validateUiElementSource(source, element) {
  const errors = [];
  const warnings = [];
  const at = `element '${element.id}' (${element.module})`;
  if (Buffer.byteLength(source) > MAX_ELEMENT_BYTES) errors.push(`${at}: larger than ${MAX_ELEMENT_BYTES} bytes`);
  const code = stripComments(source);
  if (/(^|[;\n{}])\s*(import|export)\b[^\n(]*\bfrom\s*['"]/.test(code) || /(^|[;\n])\s*import\s*['"]/.test(code) || /\bimport\s*\(/.test(code) || /\brequire\s*\(/.test(code)) {
    errors.push(`${at}: element modules must be self-contained (no import, export-from, or require)`);
  }
  const defines = [...code.matchAll(/customElements\.define\(\s*(['"`])([^'"`]+)\1/g)].map((m) => m[2]);
  if (defines.length !== 1 || defines[0] !== element.tag) {
    errors.push(`${at}: must call customElements.define('${element.tag}', …) exactly once, for its own tag (found: ${defines.join(', ') || 'none'})`);
  }
  const allowed = [...element.tokens, ...element.optional_tokens];
  const check = validatePluginUiAgainstTokens(source, { allowedTokens: allowed });
  for (const v of check.violations) errors.push(`${at}: ${v}`);
  const unused = allowed.filter((t) => !check.usedTokens.includes(t));
  if (unused.length) warnings.push(`${at}: declares tokens it never uses: ${unused.join(', ')}`);
  return { errors, warnings };
}

function readPluginFile(pluginDir, rel, where) {
  const root = fs.realpathSync(pluginDir);
  const full = path.resolve(root, rel);
  let real;
  try {
    real = fs.realpathSync(full);
  } catch {
    throw new UiElementError([`${where}: ${rel} does not exist in the plugin`]);
  }
  if (real !== root && !real.startsWith(root + path.sep)) throw new UiElementError([`${where}: ${rel} resolves outside the plugin`]);
  if (!fs.statSync(real).isFile()) throw new UiElementError([`${where}: ${rel} is not a file`]);
  return fs.readFileSync(real, 'utf8');
}

const TS_TYPES = { string: 'string', number: 'number', boolean: 'boolean', object: 'Record<string, unknown>', array: 'unknown[]' };

function reactWrapper(element, { typescript, header }) {
  const name = pascal(element.id);
  const props = Object.keys(element.props);
  const events = element.events.map((event) => [eventHandlerName(event), event]);
  const destructured = [...props, ...events.map(([handler]) => handler)];
  const lines = ["'use client';", header, ''];
  lines.push(typescript
    ? "import { createElement, useEffect, useRef, useState, type HTMLAttributes } from 'react';"
    : "import { createElement, useEffect, useRef, useState } from 'react';");
  lines.push('', `const TAG = ${JSON.stringify(element.tag)};`, '');
  if (typescript) {
    const omitted = destructured.length ? `Omit<HTMLAttributes<HTMLElement>, ${destructured.map((k) => JSON.stringify(k)).join(' | ')}>` : 'HTMLAttributes<HTMLElement>';
    lines.push(`export interface ${name}Props extends ${omitted} {`);
    for (const prop of props) {
      const def = element.props[prop];
      if (def.description) lines.push(`  /** ${def.description.replace(/\*\//g, '* /')} */`);
      lines.push(`  ${prop}${def.required ? '' : '?'}: ${TS_TYPES[def.type]};`);
    }
    for (const [handler, event] of events) lines.push(`  /** '${event}' event */`, `  ${handler}?: (event: CustomEvent) => void;`);
    lines.push('}', '');
  }
  if (element.description) lines.push(`/** ${element.description.replace(/\*\//g, '* /')} */`);
  const signature = typescript ? `props: ${name}Props` : 'props';
  lines.push(`export default function ${name}(${signature}) {`);
  lines.push(`  const { ${[...destructured, '...rest'].join(', ')} } = props;`);
  lines.push(typescript ? '  const ref = useRef<HTMLElement | null>(null);' : '  const ref = useRef(null);');
  lines.push('  const [ready, setReady] = useState(false);', '');
  lines.push('  // Load the element on the client only, then set properties once it is defined,');
  lines.push('  // so a value set before the upgrade never shadows the element\'s own setter.');
  lines.push('  useEffect(() => {');
  lines.push('    let live = true;');
  lines.push(`    import('../elements/${element.id}.js')`);
  lines.push('      .then(() => customElements.whenDefined(TAG))');
  lines.push('      .then(() => { if (live) setReady(true); })');
  lines.push(`      .catch((err) => console.error(\`Could not load <\${TAG}>:\`, err));`);
  lines.push('    return () => { live = false; };');
  lines.push('  }, []);');
  for (const prop of props) {
    lines.push('', '  useEffect(() => {');
    lines.push(typescript
      ? `    if (ready && ref.current) (ref.current as unknown as Record<string, unknown>).${prop} = ${prop};`
      : `    if (ready && ref.current) ref.current.${prop} = ${prop};`);
    lines.push(`  }, [ready, ${prop}]);`);
  }
  for (const [handler, event] of events) {
    lines.push('', '  useEffect(() => {');
    lines.push('    const el = ref.current;');
    lines.push(`    if (!el || !${handler}) return undefined;`);
    lines.push(typescript ? `    const listener = ${handler} as unknown as EventListener;` : `    const listener = ${handler};`);
    lines.push(`    el.addEventListener(${JSON.stringify(event)}, listener);`);
    lines.push(`    return () => el.removeEventListener(${JSON.stringify(event)}, listener);`);
    lines.push(`  }, [${handler}]);`);
  }
  lines.push('', '  return createElement(TAG, { ...rest, ref });', '}', '');
  return lines.join('\n');
}

/**
 * Generates a host app's UI element files. Writes nothing.
 *
 * @param {object} manifest - plugin manifest (with `id`, `version`, `ui`)
 * @param {object} options
 * @param {string} options.pluginDir - directory holding the plugin's files
 * @param {'web-components'|'react'} options.target
 * @param {string} [options.tokens] - the app's DESIGN.md (path or content); falls back to the plugin's ui.design_tokens
 * @param {boolean} [options.typescript] - React wrappers as .tsx
 * @returns {{ target, pluginId, files: Array<{ path, content, sha256 }>, elements, tokens, warnings, usage }}
 */
export function generateUiElements(manifest, { pluginDir, target, tokens, typescript = false } = {}) {
  if (!UI_TARGETS.includes(target)) throw new Error(`Unknown UI target '${target}' (known: ${UI_TARGETS.join(', ')})`);
  if (!manifest?.ui) throw new UiSpecError([`Plugin '${manifest?.id}' declares no ui`]);
  const spec = normalizeUiSpec(manifest.ui);
  if (!spec.elements.length) throw new UiSpecError([`Plugin '${manifest.id}' declares no ui elements`]);
  const source = `${manifest.id}@${manifest.version}`;
  const errors = [];
  const warnings = [];
  const files = [];
  const add = (rel, content) => files.push({ path: rel, content, sha256: sha256(content) });

  let tokenInfo = { source: null, variables: null, sha256: null };
  let tokenContent = null;
  if (tokens) tokenInfo.source = 'app';
  else if (spec.design_tokens) tokenInfo.source = 'plugin';
  if (tokenInfo.source) {
    try {
      tokenContent = tokens
        ? (!/[\r\n]/.test(tokens) && fs.existsSync(tokens) ? fs.readFileSync(tokens, 'utf8') : tokens)
        : readPluginFile(pluginDir, spec.design_tokens, 'ui.design_tokens');
      const parsed = parseDesignTokens(tokenContent);
      tokenInfo = { ...tokenInfo, variables: parsed.variables, sha256: sha256(tokenContent) };
      add('tokens.css', `/* Generated by Total Recall from the ${tokenInfo.source === 'app' ? "app's" : `plugin ${source}'s default`} DESIGN.md (sha256 ${tokenInfo.sha256.slice(0, 12)}). Edit DESIGN.md, then regenerate. */\n${parsed.css}`);
    } catch (err) {
      errors.push(`design tokens: ${err.message}`);
    }
  }

  const elements = [];
  for (const el of spec.elements) {
    let code;
    try {
      code = readPluginFile(pluginDir, el.module, `element '${el.id}'`);
    } catch (err) {
      if (!(err instanceof UiElementError)) throw err;
      errors.push(...err.errors);
      continue;
    }
    const check = validateUiElementSource(code, el);
    errors.push(...check.errors);
    warnings.push(...check.warnings);
    if (tokenInfo.variables) {
      const missing = el.tokens.filter((t) => !tokenInfo.variables.includes(t));
      if (missing.length) errors.push(`element '${el.id}': the ${tokenInfo.source === 'app' ? "app's" : "plugin's default"} DESIGN.md does not define required tokens: ${missing.map((t) => `--${t}`).join(', ')}`);
      const absent = el.optional_tokens.filter((t) => !tokenInfo.variables.includes(t));
      if (absent.length) warnings.push(`element '${el.id}': optional tokens not defined, the element's fallbacks apply: ${absent.map((t) => `--${t}`).join(', ')}`);
    }
    add(`elements/${el.id}.js`, `// Generated by Total Recall from plugin ${source} (element ${el.id}, <${el.tag}>). Regenerate instead of editing.\n${code.endsWith('\n') ? code : `${code}\n`}`);
    if (target === 'react' && typescript) {
      // Lets a strict TypeScript app import the plain-JS element, and types the tag.
      const fields = Object.entries(el.props).map(([prop, def]) => `${prop}${def.required ? '' : '?'}: ${TS_TYPES[def.type]}`);
      add(`elements/${el.id}.d.ts`, [
        `// Generated by Total Recall from plugin ${source} (element ${el.id}). Regenerate instead of editing.`,
        'declare global {',
        '  interface HTMLElementTagNameMap {',
        `    ${JSON.stringify(el.tag)}: HTMLElement${fields.length ? ` & { ${fields.join('; ')} }` : ''};`,
        '  }',
        '}',
        'export {};',
        ''
      ].join('\n'));
    }
    if (target === 'react') {
      const header = `// Generated by Total Recall from plugin ${source}: React wrapper for <${el.tag}>. Regenerate instead of editing.`;
      add(`react/${pascal(el.id)}.${typescript ? 'tsx' : 'jsx'}`, reactWrapper(el, { typescript, header }));
    }
    elements.push({
      id: el.id,
      kind: el.kind,
      tag: el.tag,
      ...(el.slot ? { slot: el.slot } : {}),
      props: el.props,
      events: el.events,
      tokens: el.tokens,
      optional_tokens: el.optional_tokens,
      ...(target === 'react' ? { react: { component: pascal(el.id), file: `react/${pascal(el.id)}.${typescript ? 'tsx' : 'jsx'}` } } : {})
    });
  }
  if (errors.length) throw new UiElementError(errors);

  add('index.js', `// Generated by Total Recall from plugin ${source}. Loads every element.\n${elements.map((el) => `import './elements/${el.id}.js';`).join('\n')}\n`);
  files.sort((a, b) => a.path.localeCompare(b.path));
  const uiManifest = {
    generated_by: 'total-recall',
    plugin: { id: manifest.id, version: manifest.version },
    target,
    ...(target === 'react' ? { typescript } : {}),
    tokens: { source: tokenInfo.source, sha256: tokenInfo.sha256 },
    elements,
    files: Object.fromEntries(files.map((f) => [f.path, f.sha256]))
  };
  add(UI_MANIFEST_FILE, `${JSON.stringify(uiManifest, null, 2)}\n`);

  const first = elements[0];
  const hasTokens = Boolean(tokenInfo.source);
  const usage = (target === 'react'
    ? [
      hasTokens ? `import './${manifest.id}/tokens.css'; // once, e.g. in the root layout` : null,
      `import ${first.react.component} from './${manifest.id}/${first.react.file.replace(/\.[jt]sx$/, '')}';`,
      `<${first.react.component} ${Object.keys(first.props).slice(0, 1).map((p) => `${p}={…}`).join(' ')} />`
    ]
    : [
      hasTokens ? `<link rel="stylesheet" href="<static-base>/${manifest.id}/tokens.css">` : null,
      `<script type="module" src="<static-base>/${manifest.id}/index.js"></script>`,
      `<${first.tag}></${first.tag}>`
    ]).filter(Boolean).join('\n');

  return {
    target,
    pluginId: manifest.id,
    files,
    elements,
    tokens: uiManifest.tokens,
    warnings,
    usage
  };
}

/**
 * Writes generated files to `<outDir>/<pluginId>/`, replacing that directory
 * whole and atomically. An existing directory is replaced only with `force`,
 * and only when it was generated by Total Recall (it holds ui-manifest.json).
 * @returns {string} the written directory
 */
export function writeUiElements(result, outDir, { force = false } = {}) {
  const dest = path.resolve(outDir, result.pluginId);
  if (fs.existsSync(dest)) {
    if (!force) throw new Error(`${dest} exists; pass --force to regenerate it`);
    if (!fs.existsSync(path.join(dest, UI_MANIFEST_FILE))) {
      throw new Error(`${dest} exists and was not generated by Total Recall (no ${UI_MANIFEST_FILE}); refusing to replace it`);
    }
  }
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  const stage = fs.mkdtempSync(path.join(path.dirname(dest), `.${result.pluginId}.ui-`));
  try {
    for (const file of result.files) {
      const full = path.join(stage, file.path);
      fs.mkdirSync(path.dirname(full), { recursive: true });
      fs.writeFileSync(full, file.content);
    }
    let old = null;
    if (fs.existsSync(dest)) {
      old = `${stage}.old`;
      fs.renameSync(dest, old);
    }
    try {
      fs.renameSync(stage, dest);
    } catch (err) {
      if (old) fs.renameSync(old, dest);
      throw err;
    }
    if (old) fs.rmSync(old, { recursive: true, force: true });
  } catch (err) {
    fs.rmSync(stage, { recursive: true, force: true });
    throw err;
  }
  return dest;
}
