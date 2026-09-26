/**
 * Total Recall — Design Token Parser & Validator
 *
 * Implements Phase 2B of CAPABILITY_DEPLOYMENT_PLUGINS:
 * - Parses `DESIGN.md` YAML frontmatter into canonical design tokens
 * - Resolves token references and compiles standard CSS variables (`:root { ... }`)
 * - Validates plugin UI elements to reject hardcoded brand values and enforce design token compliance
 */

import fs from 'node:fs';
import path from 'node:path';

// Matches kebab-case transformation
function toKebabCase(str) {
  return str
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .replace(/[\s_]+/g, '-')
    .toLowerCase();
}

/**
 * Extracts YAML frontmatter from a markdown string.
 * @param {string} content
 * @returns {object}
 */
export function extractFrontmatter(content) {
  const match = content.match(/^---\n([\s\S]*?)\n---/);
  if (!match) return {};
  const raw = match[1];

  // Lightweight YAML parser for nested token structures
  const result = {};
  const lines = raw.split('\n');
  const stack = [{ obj: result, indent: -1 }];

  for (const line of lines) {
    if (!line.trim() || line.trim().startsWith('#')) continue;
    const indent = line.search(/\S/);
    const trimmed = line.trim();
    const colonIdx = trimmed.indexOf(':');
    if (colonIdx === -1) continue;

    const key = trimmed.slice(0, colonIdx).trim();
    let val = trimmed.slice(colonIdx + 1).trim();

    while (stack.length > 1 && stack[stack.length - 1].indent >= indent) {
      stack.pop();
    }
    const current = stack[stack.length - 1].obj;

    if (val === '') {
      current[key] = {};
      stack.push({ obj: current[key], indent });
    } else {
      if (
        (val.startsWith('"') && val.endsWith('"')) ||
        (val.startsWith("'") && val.endsWith("'"))
      ) {
        val = val.slice(1, -1);
      }
      current[key] = val;
    }
  }

  return result;
}

/**
 * Resolves token references like "{colors.primary}" within values.
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

  function resolveVal(val) {
    if (typeof val !== 'string') return val;
    return val.replace(/\{([a-zA-Z0-9_.-]+)\}/g, (match, tokenPath) => {
      const parts = tokenPath.split('.');
      const resolved = getNested(tokens, parts);
      return resolved !== undefined ? resolveVal(resolved) : match;
    });
  }

  function walk(node) {
    if (typeof node !== 'object' || node === null) return resolveVal(node);
    const out = {};
    for (const [k, v] of Object.entries(node)) {
      if (typeof v === 'object' && v !== null) {
        out[k] = walk(v);
      } else {
        out[k] = resolveVal(v);
      }
    }
    return out;
  }

  return walk(tokens);
}

/**
 * Compiles parsed tokens into standard CSS custom properties.
 *
 * @param {object} tokens - Parsed design tokens
 * @returns {string} Compiled CSS block
 */
export function generateCssVariables(tokens) {
  const vars = [];
  const resolved = resolveTokenReferences(tokens);

  // 1. Colors
  if (resolved.colors) {
    for (const [name, val] of Object.entries(resolved.colors)) {
      if (typeof val === 'string') {
        vars.push(`  --color-${toKebabCase(name)}: ${val};`);
      }
    }
  }

  // 2. Typography
  if (resolved.typography) {
    if (resolved.typography.fontFamily) {
      for (const [name, val] of Object.entries(resolved.typography.fontFamily)) {
        if (typeof val === 'string') {
          vars.push(`  --font-family-${toKebabCase(name)}: ${val};`);
        }
      }
    }
  }

  // 3. Spacing
  if (resolved.spacing) {
    for (const [name, val] of Object.entries(resolved.spacing)) {
      if (typeof val === 'string') {
        vars.push(`  --spacing-${toKebabCase(name)}: ${val};`);
      }
    }
  }

  // 4. Border Radius (rounded)
  const rounded = resolved.rounded || resolved.borderRadius;
  if (rounded) {
    for (const [name, val] of Object.entries(rounded)) {
      if (typeof val === 'string') {
        vars.push(`  --radius-${toKebabCase(name)}: ${val};`);
      }
    }
  }

  return `:root {\n${vars.join('\n')}\n}\n`;
}

/**
 * Parses DESIGN.md from a path or string and compiles to CSS variables.
 * @param {string} source - Path to DESIGN.md or raw content
 * @returns {{ tokens: object, css: string }}
 */
export function parseDesignTokens(source) {
  let content = source;
  if (fs.existsSync(source)) {
    content = fs.readFileSync(source, 'utf8');
  }

  const rawTokens = extractFrontmatter(content);
  const resolved = resolveTokenReferences(rawTokens);
  const css = generateCssVariables(resolved);

  return {
    tokens: resolved,
    css
  };
}

/**
 * Prohibited patterns: hardcoded hex colors, rgb/hsl, hardcoded px fonts in UI code
 * when design tokens should be referenced via var(--...).
 */
const HARDCODED_COLOR_REGEX = /(?:color|background|border|fill|stroke)\s*:\s*(#[0-9a-fA-F]{3,8}|rgba?\(|hsla?\()/i;

/**
 * Validates plugin UI source code against design token compliance.
 * Rejects hardcoded brand values and ensures use of CSS custom properties.
 *
 * @param {string} uiSource - Source code of UI component (HTML, JSX, CSS, Web Component)
 * @param {object} [options]
 * @returns {{ valid: boolean, violations: string[] }}
 */
export function validatePluginUiAgainstTokens(uiSource, options = {}) {
  const violations = [];
  const lines = uiSource.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Check for hardcoded color values in styles
    if (HARDCODED_COLOR_REGEX.test(line)) {
      // Allow var(--...) even if it has fallback or comments
      if (!line.includes('var(--')) {
        violations.push(
          `Line ${i + 1}: Hardcoded color value detected ('${line.trim()}'). Use design token CSS variable var(--color-...) instead.`
        );
      }
    }
  }

  return {
    valid: violations.length === 0,
    violations
  };
}
