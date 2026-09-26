import { describe, it, expect } from 'vitest';
import {
  parseDesignTokens,
  generateCssVariables,
  resolveTokenReferences,
  validatePluginUiAgainstTokens
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
});
