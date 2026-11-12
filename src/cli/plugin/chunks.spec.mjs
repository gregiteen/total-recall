import { expect, it, vi, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { chooseUiChunk, chooseUiComposition } from '../../core/ui-chunk-choice.mjs';
import { addWorkspaceUiChunk, compilePluginDesign, getUiChunk, readPluginDesign, searchUiChunks } from '../../core/ui-chunks.mjs';
import { getPluginById, globalPluginsDir, projectPluginsDir } from '../../core/plugin-loader.mjs';

// Plugins install only in the shared folder (main 3.45); each test gets its own.
function isolatedSharedFolder(root) {
  vi.stubEnv('AGENT_DIR', path.join(root, 'agent'));
  return globalPluginsDir();
}
afterEach(() => vi.unstubAllEnvs());
import { patchPluginRecord } from '../../core/plugin-store.mjs';
import { publishWorkspaceComposition, readWorkspaceComposition } from '../../core/workspace-compositions.mjs';

const candidates = [
  { key: 'example:overview', title: 'Overview', description: 'General activity', intents: ['see activity'] },
  { key: 'example:alerts', title: 'Alerts', description: 'Recent failures', intents: ['find errors'] },
];

it('recompiles tokens and component rules after an owner saves DESIGN.md', () => {
  const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'plugin-design-'));
  const plugin = 'test-live-design';
  const directory = path.join(isolatedSharedFolder(projectRoot), plugin);
  try {
    fs.mkdirSync(directory, { recursive: true });
    fs.writeFileSync(path.join(directory, 'plugin.json'), JSON.stringify({
      id: plugin, name: 'Design revisions', version: '1.0.0', description: 'Test the installed design read path.',
      ui: { home: 'home', design_tokens: 'DESIGN.md', elements: [{ id: 'home', kind: 'panel', tag: 'test-design-home', module: 'ui.js' }] },
    }));
    const file = path.join(directory, 'DESIGN.md');
    fs.writeFileSync(file, '---\ncolors:\n  accent: "#112233"\n---\n');
    const before = readPluginDesign(plugin, { projectRoot });
    expect(before.css).toContain('--color-accent:#112233');
    expect(readPluginDesign(plugin, { projectRoot, revision: before.revision })).toEqual({ unchanged: true });
    fs.writeFileSync(file, '---\ncolors:\n  accent: "#223344"\ncomponents:\n  badge:\n    backgroundColor: "{colors.accent}"\n---\n');
    const after = readPluginDesign(plugin, { projectRoot, revision: before.revision });
    expect(after.revision).not.toEqual(before.revision);
    expect(after.components).toEqual(['badge']);
    expect(after.css).toContain('[data-design-component="badge"]{background-color:#223344;}');
    fs.writeFileSync(file, '---\ncolors:');
    expect(() => readPluginDesign(plugin, { projectRoot, revision: after.revision })).toThrow(/invalid tokens/);
  } finally {
    fs.rmSync(projectRoot, { recursive: true, force: true });
  }
});

it('rejects unsafe legacy and composite values before they enter a style element', () => {
  expect(() => compilePluginDesign('---\ncomponents:\n  badge:\n    typography:\n      fontFamily: "x;display:none"\n---\n')).toThrow(/Unsafe design token/);
  expect(() => compilePluginDesign('# Legacy\n\n```yaml\ntokens:\n  color-accent: "</style>"\n```\n')).toThrow(/Unsafe design token/);
});

it('validates agent additions and removes disabled owners from the workspace pool', async () => {
  const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'workspace-blocks-'));
  const plugin = 'workspace-pool-owner';
  const brainDir = path.dirname(projectPluginsDir(projectRoot));
  const directory = path.join(isolatedSharedFolder(projectRoot), plugin);
  const id = 'owner-workflow';
  const markdown = `---
type: ui-chunk:chunk
plugin: workspace-pool-owner
id: owner-workflow
title: Owner workflow
description: Describe the owner operation.
timestamp: '2026-11-08T00:00:00Z'
intents: [inspect owner workflow]
surfaces: [page]
---
<section>Workspace block</section>
`;
  try {
    fs.mkdirSync(directory, { recursive: true });
    fs.writeFileSync(path.join(directory, 'plugin.json'), JSON.stringify({
      id: plugin, name: 'Workspace pool owner', version: '1.0.0', description: 'Owns workflow documentation.',
      cli: { command: plugin, handler: 'cli.mjs', subcommands: [{ name: 'token', sensitive_output: true }] },
      ui: { home: 'home', design_tokens: 'DESIGN.md', elements: [{ id: 'home', kind: 'panel', tag: 'pool-owner-home', module: 'ui.js' }] },
    }));
    await expect(addWorkspaceUiChunk(brainDir, { plugin, id, markdown: markdown.replace('<section>', 'invalid section') }, projectRoot)).rejects.toThrow(/raw HTML/);
    const documentation = markdown.replace('surfaces: [page]', 'surfaces: [page]\noperations: [token]');
    const privateBinding = documentation.replace('operations: [token]', 'operations: [token]\ndata: ["token:/value"]');
    await expect(addWorkspaceUiChunk(brainDir, { plugin, id, markdown: privateBinding }, projectRoot)).rejects.toThrow(/non-sensitive/);
    const added = await addWorkspaceUiChunk(brainDir, { plugin, id, markdown: documentation }, projectRoot);
    const options = { brainDir, projectRoot, surface: 'page' };
    expect(searchUiChunks({ ...options, query: id }).chunks).toContainEqual(added.chunk);
    expect(getUiChunk(plugin, id, options)?.html).toBe('<section>Workspace block</section>');
    await expect(addWorkspaceUiChunk(brainDir, { plugin, id, markdown }, projectRoot)).rejects.toThrow(/version conflict/);
    await patchPluginRecord(getPluginById(plugin, projectRoot), { runtime_enabled: false });
    expect(searchUiChunks({ ...options, plugin, query: id }).chunks).toEqual([]);
    expect(getUiChunk(plugin, id, options)).toBeNull();
  } finally {
    fs.rmSync(projectRoot, { recursive: true, force: true });
  }
});

it('bounds the Decision request to eligible metadata and rejects an invented choice', async () => {
  const picked = await chooseUiChunk(candidates, 'recent errors', 'page', async (state, questions) => {
    expect(state).toEqual({ intent: 'recent errors', surface: 'page' });
    expect(Object.keys(questions.selected_chunk.criteria)).toEqual(['example:overview', 'example:alerts', 'none']);
    return { ok: true, answers: { selected_chunk: { act: true, confidence: 0.99, choice: 'outside:private' } } };
  });
  expect(picked).toEqual({ source: 'decision', key: null, reason: 'invalid-choice' });
});

it('keeps workspace-authored blocks and publication versions inside the selected project', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'selected-blocks-'));
  const plugin = 'scoped-home';
  const id = 'overview';
  const key = plugin + ':' + id;
  const directory = path.join(isolatedSharedFolder(root), plugin);
  fs.mkdirSync(directory, { recursive: true });
  fs.writeFileSync(path.join(directory, 'plugin.json'), JSON.stringify({
    id: plugin, name: 'Scoped Home', version: '1.0.0', description: 'Scoped fixture.',
    cli: { command: plugin, handler: 'cli.mjs', subcommands: [{ name: 'status', effect: 'read' }] },
    ui: { home: 'home', design_tokens: 'DESIGN.md', elements: [{ id: 'home', kind: 'panel', tag: 'scoped-home-panel', module: 'ui.js' }] },
  }));
  const projects = ['a', 'b'].map(name => {
    const projectRoot = path.join(root, name);
    return { projectRoot, brainDir: path.dirname(projectPluginsDir(projectRoot)) };
  });
  const [a, b] = projects;
  try {
    const markdown = `---\ntype: ui-chunk:chunk\nplugin: scoped-home\nid: overview\ntitle: Overview\ndescription: Read the selected workspace overview.\ntimestamp: '2026-11-08T00:00:00Z'\nintents: [show overview]\nsurfaces: [page]\n---\n<section>Scoped content</section>`;
    await addWorkspaceUiChunk(a.brainDir, { plugin, id, markdown }, a.projectRoot);
    const current = readWorkspaceComposition(a.brainDir, plugin, a.projectRoot);
    const saved = await publishWorkspaceComposition(a.brainDir, plugin, [key], current.version, a.projectRoot);
    expect(readWorkspaceComposition(a.brainDir, plugin, a.projectRoot)).toMatchObject({ chunks: [{ key }], version: saved.version });
    expect(readWorkspaceComposition(b.brainDir, plugin, b.projectRoot)).toEqual({ chunks: [], version: null });
    expect(getUiChunk(plugin, id, b)).toBeNull();
    await expect(publishWorkspaceComposition(b.brainDir, plugin, [key], null, b.projectRoot)).rejects.toThrow(/changed/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

it('assembles ordered blocks and drops low-confidence secondary choices', async () => {
  const third = { key: 'example:guide', title: 'Guide', description: 'Reference', intents: ['read guidance'] };
  const picked = await chooseUiComposition([...candidates, third], 'review alerts', async (_state, questions) => {
    expect(Object.keys(questions)).toEqual(['selected_chunk', 'supporting_chunk', 'reference_chunk']);
    return { ok: true, answers: {
      selected_chunk: { act: true, confidence: 0.91, choice: 'example:alerts' },
      supporting_chunk: { act: true, confidence: 0.83, choice: 'example:overview' },
      reference_chunk: { act: true, confidence: 0.28, choice: 'example:guide' },
    } };
  });
  expect(picked.keys).toEqual(['example:alerts', 'example:overview']);
});
