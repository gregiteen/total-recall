/**
 * Total Recall — Design Token Parser & Validator
 *
 * Implements Phase 2B of CAPABILITY_DEPLOYMENT_PLUGINS:
 * - Parses `DESIGN.md` YAML frontmatter (google-labs-code/design.md format) into tokens
 * - Resolves `{group.token}` references and compiles CSS custom properties (`:root { ... }`)
 * - Validates plugin UI source: no hardcoded colors, and only declared token variables
 *
 * Variable names: colors → `--color-<name>`, spacing → `--spacing-<name>`,
 * rounded → `--radius-<name>`, typography style props → `--typography-<style>-<prop>`,
 * a `typography.fontFamily` map of families → `--font-family-<name>`, and primitive
 * component props → `--component-<name>-<prop>`. Names are kebab-cased.
 */

import fs from 'node:fs';
import { parse as parseYaml } from 'yaml';

export class DesignTokenError extends Error {
  constructor(errors) {
    super(`Invalid design tokens:\n- ${errors.join('\n- ')}`);
    this.name = 'DesignTokenError';
    this.errors = errors;
  }
}

const TOKEN_KEY = /^[A-Za-z0-9_-]+$/;
// A value lands inside a generated stylesheet: nothing that can close the
// declaration, the rule, or an enclosing <style> element.
const UNSAFE_VALUE = /[;{}<>\\\r\n]/;
const TYPOGRAPHY_PROPS = ['fontFamily', 'fontSize', 'fontWeight', 'lineHeight', 'letterSpacing', 'fontFeature', 'fontVariation'];

function toKebabCase(str) {
  return str
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .replace(/[\s_]+/g, '-')
    .toLowerCase();
}

const isPlainObject = (v) => typeof v === 'object' && v !== null && !Array.isArray(v);

/**
 * Extracts YAML frontmatter from a markdown string.
 * @param {string} content
 * @returns {object}
 */
export function extractFrontmatter(content) {
  const match = String(content).match(/^﻿?---\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/);
  if (!match) return {};
  let parsed;
  try {
    parsed = parseYaml(match[1]);
  } catch (err) {
    throw new DesignTokenError([`frontmatter is not valid YAML: ${err.message}`]);
  }
  return isPlainObject(parsed) ? parsed : {};
}

/**
 * Resolves token references like "{colors.primary}" within values.
 * An unresolvable or circular reference is left as written.
 * @param {object} tokens
 * @returns {object}
 */
export function resolveTokenReferences(tokens) {
  function getNested(obj, pathParts) {
    let curr = obj;
    for (const p of pathParts) {
      if (curr === undefined || curr === null) return undefined;
      curr = curr[p];
    }
    return curr;
  }

  function resolveVal(val, seen) {
    if (typeof val !== 'string') return val;
    const whole = val.match(/^\{([a-zA-Z0-9_.-]+)\}$/);
    if (whole && !seen.has(whole[1])) {
      const target = getNested(tokens, whole[1].split('.'));
      // A whole-value reference may point at a composite (e.g. a typography style).
      if (isPlainObject(target)) return walk(target, new Set([...seen, whole[1]]));
    }
    return val.replace(/\{([a-zA-Z0-9_.-]+)\}/g, (match, tokenPath) => {
      if (seen.has(tokenPath)) return match;
      const resolved = getNested(tokens, tokenPath.split('.'));
      if (typeof resolved === 'string' || typeof resolved === 'number') {
        return String(resolveVal(resolved, new Set([...seen, tokenPath])));
      }
      return match;
    });
  }

  function walk(node, seen = new Set()) {
    if (!isPlainObject(node)) return resolveVal(node, seen);
    const out = {};
    for (const [k, v] of Object.entries(node)) out[k] = walk(v, seen);
    return out;
  }

  return walk(tokens);
}

/**
 * Lists the CSS custom properties a token set produces, in document order.
 * @param {object} tokens - Parsed (resolved or not) design tokens
 * @returns {Array<[string, string]>} [name without the leading `--`, value]
 * @throws {DesignTokenError} on unsafe names or values, or unresolved references
 */
export function collectCssVariables(tokens) {
  const resolved = resolveTokenReferences(tokens || {});
  const vars = [];
  const errors = [];
  const seen = new Map();

  const add = (name, value, where) => {
    if (typeof value !== 'string' && typeof value !== 'number') return;
    const text = String(value).trim();
    if (!text) return;
    if (/\{[a-zA-Z0-9_.-]+\}/.test(text)) {
      errors.push(`${where}: unresolved reference '${text}'`);
      return;
    }
    if (UNSAFE_VALUE.test(text)) {
      errors.push(`${where}: value contains a character not allowed in a CSS value`);
      return;
    }
    if (seen.has(name)) {
      errors.push(`${where}: produces --${name}, already produced by ${seen.get(name)}`);
      return;
    }
    seen.set(name, where);
    vars.push([name, text]);
  };
  const keysOf = (group, where) => Object.entries(group).filter(([key]) => {
    if (TOKEN_KEY.test(key)) return true;
    errors.push(`${where}.${key}: token names may use letters, digits, '-' and '_' only`);
    return false;
  });

  if (isPlainObject(resolved.colors)) {
    for (const [name, val] of keysOf(resolved.colors, 'colors')) add(`color-${toKebabCase(name)}`, val, `colors.${name}`);
  }
  if (isPlainObject(resolved.typography)) {
    for (const [style, def] of keysOf(resolved.typography, 'typography')) {
      if (!isPlainObject(def)) continue;
      if (style === 'fontFamily') {
        // A map of font families by role (heading, body, …), as some DESIGN.md files use.
        for (const [name, val] of keysOf(def, 'typography.fontFamily')) {
          add(`font-family-${toKebabCase(name)}`, val, `typography.fontFamily.${name}`);
        }
        continue;
      }
      for (const prop of TYPOGRAPHY_PROPS) {
        add(`typography-${toKebabCase(style)}-${toKebabCase(prop)}`, def[prop], `typography.${style}.${prop}`);
      }
    }
  }
  if (isPlainObject(resolved.spacing)) {
    for (const [name, val] of keysOf(resolved.spacing, 'spacing')) add(`spacing-${toKebabCase(name)}`, val, `spacing.${name}`);
  }
  const rounded = resolved.rounded || resolved.borderRadius;
  if (isPlainObject(rounded)) {
    for (const [name, val] of keysOf(rounded, 'rounded')) add(`radius-${toKebabCase(name)}`, val, `rounded.${name}`);
  }
  if (isPlainObject(resolved.components)) {
    for (const [component, def] of keysOf(resolved.components, 'components')) {
      if (!isPlainObject(def)) continue;
      for (const [prop, val] of keysOf(def, `components.${component}`)) {
        add(`component-${toKebabCase(component)}-${toKebabCase(prop)}`, val, `components.${component}.${prop}`);
      }
    }
  }

  if (errors.length) throw new DesignTokenError(errors);
  return vars;
}

/**
 * Compiles parsed tokens into standard CSS custom properties.
 *
 * @param {object} tokens - Parsed design tokens
 * @returns {string} Compiled CSS block
 */
export function generateCssVariables(tokens) {
  const vars = collectCssVariables(tokens).map(([name, value]) => `  --${name}: ${value};`);
  return `:root {\n${vars.join('\n')}\n}\n`;
}

/**
 * Parses DESIGN.md from a path or string and compiles to CSS variables.
 * @param {string} source - Path to DESIGN.md or raw content
 * @returns {{ tokens: object, css: string, variables: string[] }}
 */
export function parseDesignTokens(source) {
  let content = source;
  if (!/[\r\n]/.test(source) && fs.existsSync(source)) {
    content = fs.readFileSync(source, 'utf8');
  }

  const resolved = resolveTokenReferences(extractFrontmatter(content));
  const entries = collectCssVariables(resolved);
  const css = `:root {\n${entries.map(([name, value]) => `  --${name}: ${value};`).join('\n')}\n}\n`;

  return {
    tokens: resolved,
    css,
    variables: entries.map(([name]) => name)
  };
}

// A color-bearing declaration and the literal color forms that may not appear in its value.
const COLOR_DECLARATION = /\b(color|background(?:-color)?|border(?:-(?:top|right|bottom|left|block|inline))?(?:-color)?|outline(?:-color)?|fill|stroke|box-shadow|text-shadow|caret-color|accent-color|text-decoration(?:-color)?)\s*:\s*([^;}\n]*)/gi;
const LITERAL_COLOR = /#[0-9a-fA-F]{3,8}\b|\b(?:rgba?|hsla?|hwb|lab|lch|oklab|oklch|color)\(/;

/**
 * Validates plugin UI source code against design token compliance.
 * Rejects hardcoded colors in color-bearing declarations (including var()
 * fallbacks), and, when `allowedTokens` is given, any `var(--name)` whose name is
 * not declared. Custom properties starting with `--_` are element-private.
 *
 * @param {string} uiSource - Source code of UI component (HTML, JSX, CSS, Web Component)
 * @param {{ allowedTokens?: Iterable<string> }} [options]
 * @returns {{ valid: boolean, violations: string[], usedTokens: string[] }}
 */
export function validatePluginUiAgainstTokens(uiSource, options = {}) {
  const violations = [];
  const used = new Set();
  const allowed = options.allowedTokens ? new Set(options.allowedTokens) : null;
  const lines = String(uiSource).split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    for (const match of line.matchAll(COLOR_DECLARATION)) {
      if (LITERAL_COLOR.test(match[2])) {
        violations.push(
          `Line ${i + 1}: Hardcoded color value detected ('${line.trim()}'). Use design token CSS variable var(--color-...) instead.`
        );
        break;
      }
    }

    for (const match of line.matchAll(/var\(\s*--([A-Za-z0-9_-]+)/g)) {
      const name = match[1];
      if (name.startsWith('_')) continue;
      used.add(name);
      if (allowed && !allowed.has(name)) {
        violations.push(`Line ${i + 1}: var(--${name}) is not a declared design token.`);
      }
    }
  }

  return {
    valid: violations.length === 0,
    violations,
    usedTokens: [...used]
  };
}
