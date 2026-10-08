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
import { UI_ELEMENT_KINDS, UiSpecError, normalizeUiSpec, validateUiSpec } from '../plugin-contracts/ui.mjs';
export { UI_ELEMENT_KINDS, UiSpecError, normalizeUiSpec, validateUiSpec } from '../plugin-contracts/ui.mjs';
import { parseDesignTokens, validatePluginUiAgainstTokens } from './design-tokens.mjs';

export const UI_TARGETS = ['web-components', 'react'];
const ADAPTER_UI_TARGETS = { 'ssss-app': 'web-components', flask: 'web-components', nextjs: 'react', react: 'react' };
const MAX_ELEMENT_BYTES = 256 * 1024;
export const UI_MANIFEST_FILE = 'ui-manifest.json';

export class UiElementError extends Error {
  constructor(errors) {
    super(`UI elements failed validation:\n- ${errors.join('\n- ')}`);
    this.name = 'UiElementError';
    this.errors = errors;
  }
}

const sha256 = (text) => crypto.createHash('sha256').update(text).digest('hex');
const pascal = (id) => id.split('-').map((p) => p.charAt(0).toUpperCase() + p.slice(1)).join('');
export const eventHandlerName = (event) => `on${pascal(event)}`;

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
