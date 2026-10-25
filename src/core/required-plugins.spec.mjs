import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { ensureRequiredPlugins, inspectRequiredPlugins } from './required-plugins.mjs';
import { globalPluginsDir } from './plugin-loader.mjs';

const roots = [];
let previous;
afterEach(() => {
  if (previous === undefined) delete process.env._TR_TEST_AGENT_DIR; else process.env._TR_TEST_AGENT_DIR = previous;
  for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true });
});
function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'required-auth-'));
  roots.push(root);
  previous = process.env._TR_TEST_AGENT_DIR;
  process.env._TR_TEST_AGENT_DIR = path.join(root, 'global');
  return root;
}
/** The shared (global) brain is the only brain that owns installs. */
function sharedBrain(root) { return path.join(root, 'global', 'skills', 'total-recall'); }

describe('required native auth installation', () => {
  it('rejects an incomplete package instead of manufacturing auth', () => {
    const root = fixture();
    expect(() => ensureRequiredPlugins(sharedBrain(root), { sourceDir: path.join(root, 'missing-package') })).toThrow(/bundled auth/);
  });
  it('seeds a fresh shared brain from the packaged source and preserves an existing install', () => {
    const root = fixture();
    const brain = sharedBrain(root);
    expect(inspectRequiredPlugins(brain).status).toBe('failed');
    expect(ensureRequiredPlugins(brain).status).toBe('ready');
    const file = path.join(brain, 'plugins/auth/cli.mjs');
    fs.appendFileSync(file, '\n// retained owner customization\n');
    ensureRequiredPlugins(brain);
    expect(fs.readFileSync(file, 'utf8')).toContain('retained owner customization');
  });
  it('fails on invalid manifests and missing executable modules without replacing them', () => {
    const root = fixture();
    const brain = sharedBrain(root);
    ensureRequiredPlugins(brain);
    fs.rmSync(path.join(brain, 'plugins/auth/src/secrets-store.mjs'));
    expect(inspectRequiredPlugins(brain).status).toBe('failed');
    expect(() => ensureRequiredPlugins(brain)).toThrow(/auth file/);
    fs.writeFileSync(path.join(brain, 'plugins/auth/plugin.json'), '{}');
    expect(() => ensureRequiredPlugins(brain)).toThrow(/auth plugin/);
  });
  it('refreshes an install that predates the bundled release and keeps node_modules', () => {
    const root = fixture();
    const brain = sharedBrain(root);
    ensureRequiredPlugins(brain);
    const dir = path.join(brain, 'plugins/auth');
    const manifest = JSON.parse(fs.readFileSync(path.join(dir, 'plugin.json'), 'utf8'));
    fs.writeFileSync(path.join(dir, 'plugin.json'), JSON.stringify({ ...manifest, version: '1.0.1', card_layout: 'legacy' }));
    expect(inspectRequiredPlugins(brain).status).toBe('failed');
    expect(ensureRequiredPlugins(brain).status).toBe('ready');
    expect(JSON.parse(fs.readFileSync(path.join(dir, 'plugin.json'), 'utf8')).version).toBe(manifest.version);
  });
  it('never installs the defaults into a project brain', () => {
    const root = fixture();
    ensureRequiredPlugins(sharedBrain(root));
    const project = path.join(root, 'repo', '.agent', 'skills', 'total-recall');
    ensureRequiredPlugins(project);
    expect(fs.existsSync(path.join(project, 'plugins'))).toBe(false);
    expect(inspectRequiredPlugins(project)).toMatchObject({ status: 'ready', source: 'shared' });
  });
  it('keeps a project copy left by an earlier release usable and reported as local', () => {
    const root = fixture();
    const brain = sharedBrain(root);
    ensureRequiredPlugins(brain);
    const project = path.join(root, 'repo', '.agent', 'skills', 'total-recall');
    fs.mkdirSync(path.join(project, 'plugins'), { recursive: true });
    fs.cpSync(path.join(brain, 'plugins/auth'), path.join(project, 'plugins/auth'), { recursive: true });
    // It is validated as it stands; nothing is copied in and nothing is deleted.
    expect(ensureRequiredPlugins(project).status).toBe('ready');
    expect(inspectRequiredPlugins(project).source).toBe('local');
    expect(globalPluginsDir()).toBe(path.join(root, 'global', 'skills', 'total-recall', 'plugins'));
  });
});
