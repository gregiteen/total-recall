import { describe, it, expect } from 'vitest';
import {
  parseDesignTokens,
  generateCssVariables,
  collectCssVariables,
  resolveTokenReferences,
  validatePluginUiAgainstTokens,
  DesignTokenError
} from './design-tokens.mjs';

describe('Design Tokens Engine (app-deploy/design-tokens.mjs)', () => {
  const sampleDesignMd = `---
version: 1.0.0
name: test-design
colors:
  primary: "#5D2A7A"
  secondary: "#69FBD2"
  background: "#1A1A1A"
typography:
  fontFamily:
    heading: "'Montserrat', sans-serif"
    body: "'Merriweather', serif"
spacing:
  sm: "8px"
  md: "16px"
rounded:
  sm: "4px"
  full: "9999px"
components:
  button:
    bg: "{colors.primary}"
---
# Design System
Documentation content.
`;

  it('parses tokens and generates CSS custom properties', () => {
    const { tokens, css } = parseDesignTokens(sampleDesignMd);

    expect(tokens.name).toBe('test-design');
    expect(tokens.colors.primary).toBe('#5D2A7A');

    expect(css).toContain('--color-primary: #5D2A7A;');
    expect(css).toContain('--color-secondary: #69FBD2;');
    expect(css).toContain('--color-background: #1A1A1A;');
    expect(css).toContain("--font-family-heading: 'Montserrat', sans-serif;");
    expect(css).toContain('--spacing-sm: 8px;');
    expect(css).toContain('--radius-sm: 4px;');
    expect(css).toContain('--radius-full: 9999px;');
  });

  it('resolves nested token references', () => {
    const tokens = {
      colors: {
        brand: '#0070f3'
      },
      btn: {
        color: '{colors.brand}'
      }
    };
    const resolved = resolveTokenReferences(tokens);
    expect(resolved.btn.color).toBe('#0070f3');
  });

  it('passes UI component that strictly references CSS variables', () => {
    const cleanUi = `
      .my-component {
        background-color: var(--color-background);
        color: var(--color-text-primary);
        padding: var(--spacing-md);
        border-radius: var(--radius-sm);
      }
    `;
    const result = validatePluginUiAgainstTokens(cleanUi);
    expect(result.valid).toBe(true);
    expect(result.violations.length).toBe(0);
  });

  it('rejects hardcoded brand colors and values in UI code', () => {
    const badUi = `
      .bad-button {
        background: #5D2A7A;
        color: #ffffff;
      }
    `;
    const result = validatePluginUiAgainstTokens(badUi);
    expect(result.valid).toBe(false);
    expect(result.violations.length).toBeGreaterThan(0);
    expect(result.violations[0]).toContain('Hardcoded color value detected');
  });

  it('emits spec typography styles, components, and CRLF frontmatter', () => {
    const md = [
      '---',
      'colors:',
      '  ink: "#111111"',
      'typography:',
      '  body-md:',
      '    fontFamily: Public Sans',
      '    fontSize: 16px',
      '    fontWeight: 400',
      '    lineHeight: 1.5',
      'components:',
      '  button-primary:',
      '    backgroundColor: "{colors.ink}"',
      '    typography: "{typography.body-md}"',
      '---',
      'Body'
    ].join('\r\n');
    const { css, variables } = parseDesignTokens(md);
    expect(css).toContain('--typography-body-md-font-family: Public Sans;');
    expect(css).toContain('--typography-body-md-font-weight: 400;');
    expect(css).toContain('--typography-body-md-line-height: 1.5;');
    expect(css).toContain('--component-button-primary-background-color: #111111;');
    // A composite reference is not a CSS value, so it produces no variable.
    expect(variables).not.toContain('component-button-primary-typography');
  });

  it.each([
    ['a value that closes the declaration', { colors: { a: 'red; } body { color: red' } }, /not allowed in a CSS value/],
    ['a value that closes a style element', { colors: { a: '</style><script>' } }, /not allowed in a CSS value/],
    ['an unresolved reference', { colors: { a: '{colors.missing}' } }, /unresolved reference/],
    ['a circular reference', { colors: { a: '{colors.b}', b: '{colors.a}' } }, /unresolved reference/],
    ['an unsafe token name', { colors: { 'a b': '#fff' } }, /token names may use/],
    ['a name collision', { colors: { textPrimary: '#fff', 'text-primary': '#000' } }, /already produced/],
  ])('rejects %s', (_label, tokens, message) => {
    expect(() => collectCssVariables(tokens)).toThrow(DesignTokenError);
    expect(() => generateCssVariables(tokens)).toThrow(message);
  });

  it("parses Dabber CRM's DESIGN.md shape (fontFamily role map, references, numbers)", () => {
    const md = `---
version: 1.0.0
colors:
  primary: "#5D2A7A"
  textSecondary: "rgba(255, 255, 255, 0.9)"
typography:
  fontFamily:
    heading: "'Montserrat', sans-serif"
  h1:
    fontFamily: "{typography.fontFamily.heading}"
    fontSize: "clamp(2.2rem, 5vw, 4rem)"
    fontWeight: 700
components:
  button-primary:
    backgroundColor: "{colors.primary}"
    padding: "12px 24px"
---
`;
    const { css } = parseDesignTokens(md);
    expect(css).toContain('--color-text-secondary: rgba(255, 255, 255, 0.9);');
    expect(css).toContain("--font-family-heading: 'Montserrat', sans-serif;");
    expect(css).toContain("--typography-h1-font-family: 'Montserrat', sans-serif;");
    expect(css).toContain('--typography-h1-font-size: clamp(2.2rem, 5vw, 4rem);');
    expect(css).toContain('--typography-h1-font-weight: 700;');
    expect(css).toContain('--component-button-primary-padding: 12px 24px;');
  });

  it('flags hardcoded var() fallbacks and undeclared tokens, and ignores private properties', () => {
    const ui = [
      '.a { color: var(--color-text, #111); }',
      '.b { padding: var(--spacing-lg); margin: var(--_gap); }',
      '.c { border: 1px solid var(--color-line); }'
    ].join('\n');
    const result = validatePluginUiAgainstTokens(ui, { allowedTokens: ['color-text', 'color-line'] });
    expect(result.valid).toBe(false);
    expect(result.violations).toHaveLength(2);
    expect(result.violations[0]).toMatch(/Line 1: Hardcoded color/);
    expect(result.violations[1]).toMatch(/Line 2: var\(--spacing-lg\) is not a declared design token/);
    expect(result.usedTokens.sort()).toEqual(['color-line', 'color-text', 'spacing-lg']);
  });
});
