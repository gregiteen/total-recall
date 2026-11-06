import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { auditProjectPluginCopies, ensureRequiredPlugins, inspectRequiredPlugins, resolveRequiredInstallationPaths } from './required-plugins.mjs';
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
  it('resolves a project-local skills alias and rejects a shared tree in its place', () => {
    const root = fixture();
    const project = fs.realpathSync(root);
    const link = path.join(project, '.agent', 'skills');
    const own = path.join(project, '.agents', 'skills');
    fs.mkdirSync(own, { recursive: true });
    fs.mkdirSync(path.dirname(link));
    fs.symlinkSync('../.agents/skills', link);
    const selected = path.join(link, 'total-recall');
    const shared = sharedBrain(root);
    expect(resolveRequiredInstallationPaths(selected, shared).brainDir).toBe(path.join(own, 'total-recall'));

    fs.unlinkSync(link);
    fs.mkdirSync(shared, { recursive: true });
    fs.symlinkSync(path.dirname(shared), link);
    expect(() => resolveRequiredInstallationPaths(selected, shared)).toThrow('Unsafe project skills link');
  });

  it('excludes shared installs even if a project path aliases them', () => {
    const root = fixture();
    const plugins = path.join(sharedBrain(root), 'plugins');
    const project = path.join(root, 'project');
    fs.mkdirSync(path.join(plugins, 'auth'), { recursive: true });
    fs.mkdirSync(path.join(project, '.agent'), { recursive: true });
    fs.symlinkSync(path.join(root, 'global', 'skills'), path.join(project, '.agent', 'skills'));
    expect(auditProjectPluginCopies(project, { sharedDir: plugins }).count).toBe(0);
  });

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
  it('never deletes through a link into the checkout that owns the plugin', () => {
    const root = fixture();
    const brain = sharedBrain(root);
    ensureRequiredPlugins(brain);
    const dir = path.join(brain, 'plugins/mesh');
    const checkout = path.join(root, 'tr-plugin-mesh');
    fs.cpSync(dir, checkout, { recursive: true });
    const manifest = JSON.parse(fs.readFileSync(path.join(checkout, 'plugin.json'), 'utf8'));
    fs.writeFileSync(path.join(checkout, 'plugin.json'), JSON.stringify({ ...manifest, version: '0.0.1' }));
    fs.mkdirSync(path.join(checkout, '.git'));
    fs.writeFileSync(path.join(checkout, '.git', 'HEAD'), 'ref: refs/heads/main\n');
    fs.writeFileSync(path.join(checkout, 'work-in-progress.mjs'), 'uncommitted\n');
    fs.rmSync(dir, { recursive: true, force: true });
    fs.symlinkSync(checkout, dir);

    ensureRequiredPlugins(brain);

    expect(fs.lstatSync(dir).isSymbolicLink()).toBe(true);
    expect(fs.readFileSync(path.join(checkout, '.git', 'HEAD'), 'utf8')).toContain('main');
    expect(fs.readFileSync(path.join(checkout, 'work-in-progress.mjs'), 'utf8')).toBe('uncommitted\n');
    expect(JSON.parse(fs.readFileSync(path.join(checkout, 'plugin.json'), 'utf8')).version).toBe('0.0.1');
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
