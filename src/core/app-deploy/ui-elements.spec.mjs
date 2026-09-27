import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createElement } from 'react';
import { render, waitFor, cleanup, act } from '@testing-library/react';
import {
  normalizeUiSpec,
  validateUiSpec,
  validateUiElementSource,
  generateUiElements,
  writeUiElements,
  uiTargetForAdapter,
  UiSpecError,
  UiElementError,
  UI_MANIFEST_FILE,
} from './ui-elements.mjs';
import { validatePluginManifest } from '../plugin-loader.mjs';
import { run as runAppCli } from '../../cli/app/index.mjs';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');

const ELEMENT_SOURCE = [
  'class NotesPanel extends HTMLElement {',
  '  #notes = [];',
  '  constructor() {',
  '    super();',
  "    this.attachShadow({ mode: 'open' });",
  '  }',
  '  set notes(value) {',
  '    this.#notes = Array.isArray(value) ? value : [];',
  '    this.render();',
  '  }',
  '  get notes() {',
  '    return this.#notes;',
  '  }',
  '  connectedCallback() {',
  '    this.render();',
  '  }',
  '  render() {',
  '    this.shadowRoot.innerHTML = `<style>',
  '      :host { display: block; color: var(--color-text); background: var(--color-surface); padding: var(--spacing-md); border-radius: var(--radius-md); --_gap: 4px; }',
  '      button { color: var(--color-accent, var(--color-text)); margin-top: var(--_gap); }',
  '    </style><p part="count">${this.#notes.length} notes</p><button type="button">Refresh</button>`;',
  "    this.shadowRoot.querySelector('button').addEventListener('click', () => {",
  "      this.dispatchEvent(new CustomEvent('refresh', { bubbles: true, detail: { count: this.#notes.length } }));",
  '    });',
  '  }',
  '}',
  "if (!customElements.get('notes-panel')) customElements.define('notes-panel', NotesPanel);",
  '',
].join('\n');

const ELEMENT = {
  id: 'notes-panel',
  kind: 'panel',
  tag: 'notes-panel',
  module: 'ui/notes-panel.js',
  slot: 'dashboard',
  description: 'Shows the note count',
  props: { notes: { type: 'array', description: 'Notes to count', required: true }, heading: { type: 'string' } },
  events: ['refresh'],
  tokens: ['color-text', 'color-surface', 'spacing-md', 'radius-md'],
  optional_tokens: ['color-accent'],
};

const designMd = ({ text, surface, md = '16px' }) => [
  '---',
  'name: app',
  'colors:',
  `  text: "${text}"`,
  `  surface: "${surface}"`,
  'spacing:',
  `  md: "${md}"`,
  'rounded:',
  '  md: "8px"',
  '---',
  '# App design',
  '',
].join('\n');

function manifest(ui = { design_tokens: 'ui/DESIGN.md', elements: [ELEMENT] }) {
  return { id: 'notes', name: 'Notes', version: '1.2.0', description: 'Notes capability', ui };
}

function writePlugin(dir, { ui, source = ELEMENT_SOURCE } = {}) {
  fs.mkdirSync(path.join(dir, 'ui'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'plugin.json'), JSON.stringify(manifest(ui)));
  fs.writeFileSync(path.join(dir, 'ui', 'notes-panel.js'), source);
  fs.writeFileSync(path.join(dir, 'ui', 'DESIGN.md'), designMd({ text: '#222222', surface: '#fafafa' }));
  return dir;
}

const withElement = (mutate) => {
  const el = structuredClone(ELEMENT);
  mutate(el);
  return { elements: [el] };
};

describe('ui spec validation', () => {
  it('normalizes a valid spec', () => {
    const spec = normalizeUiSpec({ design_tokens: 'ui/DESIGN.md', elements: [ELEMENT] });
    expect(spec.design_tokens).toBe('ui/DESIGN.md');
    expect(spec.elements[0]).toMatchObject({ id: 'notes-panel', tag: 'notes-panel', events: ['refresh'] });
    expect(spec.elements[0].props.heading).toEqual({ type: 'string', required: false });
    expect(validatePluginManifest(manifest()).valid).toBe(true);
  });

  it.each([
    ['a tag without a hyphen', withElement((e) => { e.tag = 'notes'; }), /valid custom element name/],
    ['a reserved tag', withElement((e) => { e.tag = 'font-face'; }), /valid custom element name/],
    ['a traversing module', withElement((e) => { e.module = '../x.js'; }), /module must be/],
    ['an absolute module', withElement((e) => { e.module = '/etc/x.js'; }), /module must be/],
    ['a non-normalized module', withElement((e) => { e.module = 'ui/../ui/x.js'; }), /module must be/],
    ['a reserved prop', withElement((e) => { e.props.children = { type: 'string' }; }), /prop names/],
    ['an on-prefixed prop', withElement((e) => { e.props.onRefresh = { type: 'string' }; }), /prop names/],
    ['an unknown prop type', withElement((e) => { e.props.notes.type = 'date'; }), /type must be one of/],
    ['a duplicate event', withElement((e) => { e.events = ['refresh', 'refresh']; }), /listed twice/],
    ['a token both required and optional', withElement((e) => { e.optional_tokens = ['color-text']; }), /both required and optional/],
    ['a token with the -- prefix', withElement((e) => { e.tokens = ['--color-text']; }), /not a token name/],
    ['an unknown element key', withElement((e) => { e.style = 'x'; }), /unknown key 'style'/],
    ['an unknown kind', withElement((e) => { e.kind = 'modal'; }), /kind must be one of/],
    ['duplicate ids and tags', { elements: [ELEMENT, ELEMENT] }, /duplicate id/],
    ['design tokens outside the plugin', { design_tokens: '../../tokens.md', elements: [] }, /design_tokens must be/],
    ['design tokens that are not markdown', { design_tokens: 'ui/tokens.yaml', elements: [] }, /design_tokens must be/],
  ])('rejects %s', (_label, ui, message) => {
    expect(() => normalizeUiSpec(ui)).toThrow(UiSpecError);
    expect(validateUiSpec(ui).join('\n')).toMatch(message);
    expect(validatePluginManifest(manifest(ui)).valid).toBe(false);
  });

  it('maps adapters to UI targets', () => {
    expect(uiTargetForAdapter('flask')).toBe('web-components');
    expect(uiTargetForAdapter('ssss-app')).toBe('web-components');
    expect(uiTargetForAdapter('nextjs')).toBe('react');
    expect(uiTargetForAdapter('react')).toBe('react');
    expect(() => uiTargetForAdapter('rails')).toThrow(/no UI element target/);
  });
});

describe('element source validation', () => {
  const el = normalizeUiSpec({ elements: [ELEMENT] }).elements[0];

  it('accepts a self-contained, token-only element', () => {
    expect(validateUiElementSource(ELEMENT_SOURCE, el)).toEqual({ errors: [], warnings: [] });
  });

  it.each([
    ['a static import', `import { x } from './x.js';\n${ELEMENT_SOURCE}`, /self-contained/],
    ['a side-effect import', `import './x.js';\n${ELEMENT_SOURCE}`, /self-contained/],
    ['a dynamic import', `${ELEMENT_SOURCE}\nimport('./x.js');`, /self-contained/],
    ['an export-from', `export * from './x.js';\n${ELEMENT_SOURCE}`, /self-contained/],
    ['a second define', `${ELEMENT_SOURCE}\ncustomElements.define('other-el', class extends HTMLElement {});`, /exactly once/],
    ['a different tag', ELEMENT_SOURCE.replaceAll("'notes-panel'", "'note-panel'"), /exactly once/],
    ['a hardcoded color', ELEMENT_SOURCE.replace('color: var(--color-text);', 'color: #5D2A7A;'), /Hardcoded color/],
    ['a hardcoded var() fallback', ELEMENT_SOURCE.replace('var(--color-accent, var(--color-text))', 'var(--color-accent, rgb(1, 2, 3))'), /Hardcoded color/],
    ['an undeclared token', ELEMENT_SOURCE.replace('var(--spacing-md)', 'var(--spacing-lg)'), /--spacing-lg\) is not a declared design token/],
  ])('rejects %s', (_label, source, message) => {
    expect(validateUiElementSource(source, el).errors.join('\n')).toMatch(message);
  });

  it('warns about declared tokens the element never uses', () => {
    const extra = { ...el, optional_tokens: ['color-accent', 'color-muted'] };
    expect(validateUiElementSource(ELEMENT_SOURCE, extra).warnings.join('\n')).toMatch(/never uses: color-muted/);
  });
});

describe('UI element generation', () => {
  let root;
  let plugin;

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'tr-ui-gen-'));
    plugin = writePlugin(path.join(root, 'notes'));
  });
  afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

  it('builds web components with tokens.css from the app DESIGN.md, deterministically', () => {
    const tokens = path.join(root, 'DESIGN.md');
    fs.writeFileSync(tokens, designMd({ text: '#101010', surface: '#ffffff' }));
    const a = generateUiElements(manifest(), { pluginDir: plugin, target: 'web-components', tokens });
    const b = generateUiElements(manifest(), { pluginDir: plugin, target: 'web-components', tokens });
    expect(b.files).toEqual(a.files);
    expect(a.files.map((f) => f.path)).toEqual(['elements/notes-panel.js', 'index.js', 'tokens.css', UI_MANIFEST_FILE]);
    const file = (p) => a.files.find((f) => f.path === p).content;
    expect(file('tokens.css')).toContain('--color-text: #101010;');
    expect(file('tokens.css')).toContain("from the app's DESIGN.md");
    expect(file('elements/notes-panel.js').endsWith(ELEMENT_SOURCE)).toBe(true);
    expect(file('elements/notes-panel.js').split('\n')[0]).toMatch(/^\/\/ Generated by Total Recall from plugin notes@1\.2\.0/);
    expect(file('index.js')).toContain("import './elements/notes-panel.js';");
    const uiManifest = JSON.parse(file(UI_MANIFEST_FILE));
    expect(uiManifest.tokens.source).toBe('app');
    for (const f of a.files.filter((x) => x.path !== UI_MANIFEST_FILE)) expect(uiManifest.files[f.path]).toBe(f.sha256);
    expect(a.warnings).toEqual(['element \'notes-panel\': optional tokens not defined, the element\'s fallbacks apply: --color-accent']);
    expect(a.usage).toContain('<notes-panel></notes-panel>');
  });

  it('restyles through tokens alone: element files stay byte-identical', () => {
    const light = path.join(root, 'light.md');
    const dark = path.join(root, 'dark.md');
    fs.writeFileSync(light, designMd({ text: '#101010', surface: '#ffffff' }));
    fs.writeFileSync(dark, designMd({ text: '#f0f0f0', surface: '#121212', md: '20px' }));
    const a = generateUiElements(manifest(), { pluginDir: plugin, target: 'react', tokens: light });
    const b = generateUiElements(manifest(), { pluginDir: plugin, target: 'react', tokens: dark });
    const hashes = (r) => Object.fromEntries(r.files.map((f) => [f.path, f.sha256]));
    for (const p of ['elements/notes-panel.js', 'react/NotesPanel.jsx', 'index.js']) expect(hashes(b)[p]).toBe(hashes(a)[p]);
    expect(hashes(b)['tokens.css']).not.toBe(hashes(a)['tokens.css']);
    expect(b.files.find((f) => f.path === 'tokens.css').content).toContain('--spacing-md: 20px;');
  });

  it('fails when the app tokens lack a required token, naming it', () => {
    const tokens = path.join(root, 'DESIGN.md');
    fs.writeFileSync(tokens, designMd({ text: '#101010', surface: '#ffffff' }).replace(/rounded:\n {2}md: "8px"\n/, ''));
    expect(() => generateUiElements(manifest(), { pluginDir: plugin, target: 'web-components', tokens }))
      .toThrow(/does not define required tokens: --radius-md/);
  });

  it("falls back to the plugin's default DESIGN.md, and omits tokens.css with none at all", () => {
    const withDefault = generateUiElements(manifest(), { pluginDir: plugin, target: 'web-components' });
    expect(withDefault.tokens.source).toBe('plugin');
    expect(withDefault.files.find((f) => f.path === 'tokens.css').content).toContain('--color-text: #222222;');

    const bare = generateUiElements(manifest({ elements: [ELEMENT] }), { pluginDir: plugin, target: 'web-components' });
    expect(bare.tokens).toEqual({ source: null, sha256: null });
    expect(bare.files.some((f) => f.path === 'tokens.css')).toBe(false);
    expect(bare.usage).not.toContain('tokens.css');
    expect(withDefault.usage).toContain('<static-base>/notes/tokens.css');
  });

  it('refuses an element module that escapes the plugin through a symlink', () => {
    const outside = path.join(root, 'outside.js');
    fs.writeFileSync(outside, ELEMENT_SOURCE);
    fs.rmSync(path.join(plugin, 'ui', 'notes-panel.js'));
    fs.symlinkSync(outside, path.join(plugin, 'ui', 'notes-panel.js'));
    expect(() => generateUiElements(manifest(), { pluginDir: plugin, target: 'web-components' })).toThrow(/resolves outside the plugin/);
  });

  it('rejects an element that fails source validation', () => {
    fs.writeFileSync(path.join(plugin, 'ui', 'notes-panel.js'), ELEMENT_SOURCE.replace('color: var(--color-text);', 'color: #000;'));
    expect(() => generateUiElements(manifest(), { pluginDir: plugin, target: 'web-components' })).toThrow(UiElementError);
  });

  it('generates typed TSX wrappers', () => {
    const r = generateUiElements(manifest(), { pluginDir: plugin, target: 'react', typescript: true });
    const tsx = r.files.find((f) => f.path === 'react/NotesPanel.tsx').content;
    expect(tsx.startsWith("'use client';\n")).toBe(true);
    expect(tsx).toContain('export interface NotesPanelProps extends Omit<HTMLAttributes<HTMLElement>, "notes" | "heading" | "onRefresh">');
    expect(tsx).toContain('  notes: unknown[];');
    expect(tsx).toContain('  heading?: string;');
    expect(tsx).toContain('  onRefresh?: (event: CustomEvent) => void;');
    expect(r.elements[0].react).toEqual({ component: 'NotesPanel', file: 'react/NotesPanel.tsx' });
    const dts = r.files.find((f) => f.path === 'elements/notes-panel.d.ts').content;
    expect(dts).toContain('"notes-panel": HTMLElement & { notes: unknown[]; heading?: string };');
    expect(generateUiElements(manifest(), { pluginDir: plugin, target: 'react' }).files.some((f) => f.path.endsWith('.d.ts'))).toBe(false);
  });

  it('writes <out>/<plugin-id>/ atomically and only replaces its own output', () => {
    const r = generateUiElements(manifest(), { pluginDir: plugin, target: 'web-components' });
    const out = path.join(root, 'static');
    const dest = writeUiElements(r, out);
    expect(dest).toBe(path.join(out, 'notes'));
    for (const f of r.files) expect(fs.readFileSync(path.join(dest, f.path), 'utf8')).toBe(f.content);
    expect(() => writeUiElements(r, out)).toThrow(/pass --force/);
    fs.writeFileSync(path.join(dest, 'stale.js'), 'x');
    writeUiElements(r, out, { force: true });
    expect(fs.existsSync(path.join(dest, 'stale.js'))).toBe(false);
    expect(fs.readdirSync(out)).toEqual(['notes']);

    const foreign = path.join(root, 'foreign');
    fs.mkdirSync(path.join(foreign, 'notes'), { recursive: true });
    fs.writeFileSync(path.join(foreign, 'notes', 'app.js'), 'keep');
    expect(() => writeUiElements(r, foreign, { force: true })).toThrow(/not generated by Total Recall/);
    expect(fs.readFileSync(path.join(foreign, 'notes', 'app.js'), 'utf8')).toBe('keep');
  });
});

describe('generated elements at runtime (jsdom)', () => {
  let root;
  let dest;

  beforeEach(() => {
    // Inside the repo (gitignored): Vite does not load modules created outside
    // the project root after the run starts, and 'react' resolves from here.
    fs.mkdirSync(path.join(REPO_ROOT, '.vitest-tmp'), { recursive: true });
    root = fs.mkdtempSync(path.join(REPO_ROOT, '.vitest-tmp', 'ui-run-'));
    const plugin = writePlugin(path.join(root, 'plugin'));
    const result = generateUiElements(manifest(), { pluginDir: plugin, target: 'react' });
    dest = writeUiElements(result, path.join(root, 'app'));
  });
  afterEach(() => {
    cleanup();
    fs.rmSync(root, { recursive: true, force: true });
  });

  it('the web-component build defines the element and renders from properties', async () => {
    await import(/* @vite-ignore */ path.join(dest, 'index.js'));
    const el = document.createElement('notes-panel');
    document.body.append(el);
    el.notes = [{ id: 1 }, { id: 2 }];
    expect(el.shadowRoot.querySelector('[part=count]').textContent).toBe('2 notes');
    expect(el.shadowRoot.querySelector('style').textContent).toContain('var(--color-surface)');
    el.remove();
  });

  it('the React wrapper sets props as element properties after upgrade and wires events', async () => {
    const { default: NotesPanel } = await import(/* @vite-ignore */ path.join(dest, 'react', 'NotesPanel.jsx'));
    const onRefresh = vi.fn();
    const notes = [{ id: 1 }, { id: 2 }, { id: 3 }];
    const view = render(createElement(NotesPanel, { notes, onRefresh, className: 'panel', 'data-testid': 'np' }));
    const el = view.getByTestId('np');
    expect(el.tagName.toLowerCase()).toBe('notes-panel');
    await waitFor(() => expect(el.shadowRoot?.querySelector('[part=count]')?.textContent).toBe('3 notes'));
    expect(el.notes).toBe(notes);
    expect(Object.prototype.hasOwnProperty.call(el, 'notes')).toBe(false);

    act(() => el.shadowRoot.querySelector('button').click());
    expect(onRefresh).toHaveBeenCalledTimes(1);
    expect(onRefresh.mock.calls[0][0].detail).toEqual({ count: 3 });

    view.rerender(createElement(NotesPanel, { notes: [{ id: 9 }], onRefresh, 'data-testid': 'np' }));
    await waitFor(() => expect(el.shadowRoot.querySelector('[part=count]').textContent).toBe('1 notes'));
  });
});

describe('total-recall app ui', () => {
  let root;
  let plugin;
  let logSpy;
  let errSpy;
  let exitSpy;

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'tr-app-ui-cmd-'));
    plugin = writePlugin(path.join(root, 'notes'));
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    exitSpy = vi.spyOn(process, 'exit').mockImplementation((code) => { throw new Error(`process.exit(${code})`); });
  });
  afterEach(() => {
    logSpy.mockRestore();
    errSpy.mockRestore();
    exitSpy.mockRestore();
    fs.rmSync(root, { recursive: true, force: true });
  });

  it('writes the adapter target and reports files as JSON', async () => {
    const tokens = path.join(root, 'DESIGN.md');
    fs.writeFileSync(tokens, designMd({ text: '#101010', surface: '#ffffff' }));
    const out = path.join(root, 'static');
    await expect(runAppCli(['app', 'ui', plugin, '--adapter', 'flask', '--tokens', tokens, '--out', out, '--json'])).rejects.toThrow('process.exit(0)');
    const result = JSON.parse(logSpy.mock.calls[0][0]);
    expect(result).toMatchObject({ target: 'web-components', plugin: 'notes', out: path.join(out, 'notes'), tokens: { source: 'app' } });
    expect(result.files.map((f) => f.path)).toContain('tokens.css');
    expect(fs.readFileSync(path.join(out, 'notes', 'tokens.css'), 'utf8')).toContain('--color-surface: #ffffff;');

    await expect(runAppCli(['app', 'ui', plugin, '--ui', 'react', '--out', out])).rejects.toThrow('process.exit(1)');
    await expect(runAppCli(['app', 'ui', plugin, '--ui', 'react', '--typescript', '--out', out, '--force'])).rejects.toThrow('process.exit(0)');
    expect(fs.existsSync(path.join(out, 'notes', 'react', 'NotesPanel.tsx'))).toBe(true);
  });

  it('lists files without --out, and exits 3 or 1 on bad targets', async () => {
    await expect(runAppCli(['app', 'ui', plugin, '--ui', 'web-components'])).rejects.toThrow('process.exit(0)');
    expect(logSpy.mock.calls.flat().join('\n')).toMatch(/elements\/notes-panel\.js/);
    expect(fs.readdirSync(root)).toEqual(['notes']);

    await expect(runAppCli(['app', 'ui', plugin, '--adapter', 'rails'])).rejects.toThrow('process.exit(3)');
    await expect(runAppCli(['app', 'ui', plugin, '--ui', 'vue'])).rejects.toThrow('process.exit(1)');
    await expect(runAppCli(['app', 'ui', plugin, '--ui', 'web-components', '--typescript'])).rejects.toThrow('process.exit(1)');
    expect(errSpy.mock.calls.flat().join('\n')).toMatch(/--typescript applies to --ui react only/);
  });
});
