import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { discoverPlugins, globalPluginsDir } from './plugin-loader.mjs';
import { patchPluginRecord } from './plugin-store.mjs';
import { patchProjectActivationRecord } from './plugin-store.mjs';
import { pluginActivation } from './plugin-state.mjs';
import { setPluginActive } from './plugin-activation.mjs';
import { ensureRequiredPlugins, inspectRequiredPlugins, auditProjectPluginCopies } from './required-plugins.mjs';
import { writeFixturePlugin } from './testing/plugin-fixture.mjs';

describe('the shared plugin folder is never a project', () => {
  let root, previous;
  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'tr-plugin-cwd-'));
    previous = process.env._TR_TEST_AGENT_DIR;
    delete process.env._TR_TEST_AGENT_DIR;
    delete process.env.AGENT_DIR;
  });
  afterEach(() => {
    delete process.env.AGENT_DIR;
    if (previous === undefined) delete process.env._TR_TEST_AGENT_DIR; else process.env._TR_TEST_AGENT_DIR = previous;
    fs.rmSync(root, { recursive: true, force: true });
  });

  it('refuses to treat a plugin install, or anything inside it, as a repository', async () => {
    const { detectProjectBrain } = await import('./config.mjs');
    const { globalPluginsDir } = await import('./plugin-loader.mjs');
    // Detection is exercised through the real walk, so the override that
    // short-circuits it is removed for this case only.
    const pluginDir = path.join(globalPluginsDir(), 'shared-demo');
    // A plugin carries its owner repository's brain. Detection used to walk up
    // from wherever the CLI ran, so a plugin invoking the CLI with its own
    // directory as cwd provisioned a whole nested brain inside itself.
    fs.mkdirSync(path.join(pluginDir, '.agent', 'skills', 'total-recall', 'memory-vault'), { recursive: true });
    try {
      expect(detectProjectBrain(pluginDir)).toBeNull();
      expect(detectProjectBrain(path.join(pluginDir, '.agent', 'skills', 'total-recall'))).toBeNull();
      expect(detectProjectBrain(globalPluginsDir())).toBeNull();
    } finally {
      fs.rmSync(pluginDir, { recursive: true, force: true });
    }
    // A real repository still detects normally.
    const repo = path.join(root, 'repo');
    fs.mkdirSync(path.join(repo, 'pkg'), { recursive: true });
    fs.mkdirSync(path.join(repo, '.agent', 'skills', 'total-recall', 'memory-vault'), { recursive: true });
    expect(detectProjectBrain(path.join(repo, 'pkg'))?.projectRoot).toBe(repo);
  });

  it('refuses a shared plugin reached through its symlink, and lets the registry decide its repo', async () => {
    const { detectProjectBrain } = await import('./config.mjs');
    const { globalPluginsDir } = await import('./plugin-loader.mjs');
    // The production shape: the shared folder holds symlinks to the owner
    // checkouts, so a plugin that resolves its own directory calls detection
    // with the link target. Guarding only the literal path just moves the
    // recursion to the resolved one.
    const owner = fs.realpathSync(root);
    fs.mkdirSync(path.join(owner, '.agent', 'skills', 'total-recall', 'memory-vault'), { recursive: true });
    fs.mkdirSync(path.join(owner, 'src'), { recursive: true });
    const link = path.join(globalPluginsDir(), 'linked-demo');
    fs.mkdirSync(globalPluginsDir(), { recursive: true });
    try {
      fs.symlinkSync(owner, link);
      // While the shared folder links this checkout it is a plugin: the link,
      // anything inside it, and the checkout at its own top level. It is not a
      // registered project, so provisioning there is refused — the safe
      // direction, and the one that stops the nested brain.
      expect(detectProjectBrain(link)).toBeNull();
      expect(detectProjectBrain(path.join(owner, 'src'))).toBeNull();
      expect(detectProjectBrain(owner)).toBeNull();
    } finally {
      fs.rmSync(link, { force: true });
    }
    // Unlinked from the shared folder it is an ordinary repository again.
    expect(detectProjectBrain(path.join(owner, 'src'))?.projectRoot).toBe(owner);
  });
});

/** A shared-folder plugin installed by hand, with no compilation side effects. */
function writeSharedPlugin(dir, id, { version = '1.0.0' } = {}) {
  fs.mkdirSync(dir, { recursive: true });
  writeFixturePlugin(dir, {
    id, name: id, version, description: `${id} fixture`,
    cli: { command: id, handler: 'cli.mjs', subcommands: [{ name: 'tick', effect: 'read', output: 'text', args: [] }] }
  });
  fs.writeFileSync(path.join(dir, 'cli.mjs'), 'export async function run(){}\n');
}

describe('per-repository activation of a shared plugin', () => {
  let root, sharedAgent, previous, repoA, repoB;
  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'tr-repo-activation-'));
    previous = process.env._TR_TEST_AGENT_DIR;
    sharedAgent = path.join(root, 'shared');
    process.env._TR_TEST_AGENT_DIR = sharedAgent;
    repoA = path.join(root, 'repo-a'); fs.mkdirSync(repoA, { recursive: true });
    repoB = path.join(root, 'repo-b'); fs.mkdirSync(repoB, { recursive: true });
    writeSharedPlugin(path.join(globalPluginsDir(), 'shared-demo'), 'shared-demo');
  });
  afterEach(() => {
    if (previous === undefined) delete process.env._TR_TEST_AGENT_DIR; else process.env._TR_TEST_AGENT_DIR = previous;
    fs.rmSync(root, { recursive: true, force: true });
  });

  const activationFor = (repo) => {
    const plugin = discoverPlugins(repo).find(p => p.id === 'shared-demo');
    return pluginActivation(plugin, { projectRoot: repo });
  };

  it('reports the shared setting when a repository has no override', () => {
    const state = activationFor(repoA);
    expect(state.enabled).toBe(true);
    expect(state.source).toBe('shared');
    expect(state.overridden).toBe(false);
  });

  it('overrides the shared setting for one repository only', async () => {
    await patchProjectActivationRecord('shared-demo', repoA, false, { manifest: { name: 'Shared Demo' } });
    expect(activationFor(repoA)).toMatchObject({ enabled: false, state: 'inactive', source: 'project', overridden: true });
    // The other repository is untouched, and the shared record was not changed.
    expect(activationFor(repoB)).toMatchObject({ enabled: true, source: 'shared' });
  });

  it('re-enables one repository over a shared setting that is off', async () => {
    const plugin = discoverPlugins(repoA).find(p => p.id === 'shared-demo');
    await patchPluginRecord(plugin, { runtime_enabled: false });
    expect(activationFor(repoA)).toMatchObject({ enabled: false, source: 'shared' });
    await patchProjectActivationRecord('shared-demo', repoA, true, { manifest: { name: 'Shared Demo' } });
    expect(activationFor(repoA)).toMatchObject({ enabled: true, source: 'project', overridden: true });
    expect(activationFor(repoB)).toMatchObject({ enabled: false, source: 'shared' });
  });

  it('clears the override so the repository follows the shared setting again', async () => {
    await patchProjectActivationRecord('shared-demo', repoA, false, { manifest: { name: 'Shared Demo' } });
    expect(activationFor(repoA).enabled).toBe(false);
    await patchProjectActivationRecord('shared-demo', repoA, null);
    const state = activationFor(repoA);
    expect(state.enabled).toBe(true);
    expect(state.source).toBe('shared');
  });

  it('writes the override as an SSSS plugin_record that never installs a copy', async () => {
    await patchProjectActivationRecord('shared-demo', repoA, false, { manifest: { name: 'Shared Demo' } });
    const record = path.join(repoA, '.agent', 'skills', 'total-recall', 'memory-vault', 'system', 'plugins', 'shared-demo.md');
    expect(fs.readFileSync(record, 'utf8')).toMatch(/type:\s*plugin_record/);
    expect(fs.readFileSync(record, 'utf8')).toMatch(/runtime_enabled:\s*false/);
    // No plugin directory was created in the repository.
    expect(fs.existsSync(path.join(repoA, '.agent', 'skills', 'total-recall', 'plugins', 'shared-demo'))).toBe(false);
  });

  it('switches through the CLI-facing command, refusing a shared switch on a repository copy', async () => {
    const result = await setPluginActive('shared-demo', false, { projectRoot: repoA });
    expect(result.scope).toBe('project');
    expect(result.activation.enabled).toBe(false);
    // scope 'shared' is only meaningful for a plugin installed in the shared folder.
    const local = path.join(repoA, '.agent', 'skills', 'total-recall', 'plugins', 'local-demo');
    writeSharedPlugin(local, 'local-demo');
    await expect(setPluginActive('local-demo', false, { projectRoot: repoA, scope: 'shared' })).rejects.toThrow(/shared setting/);
  });
});

describe('the defaults live in one shared folder', () => {
  let root, previous;
  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'tr-shared-defaults-'));
    previous = process.env._TR_TEST_AGENT_DIR;
    process.env._TR_TEST_AGENT_DIR = path.join(root, 'global');
  });
  afterEach(() => {
    if (previous === undefined) delete process.env._TR_TEST_AGENT_DIR; else process.env._TR_TEST_AGENT_DIR = previous;
    fs.rmSync(root, { recursive: true, force: true });
  });

  it('installs the bundled defaults into the shared brain and copies nothing into a project', () => {
    const sharedBrain = path.join(root, 'global', 'skills', 'total-recall');
    const projectBrain = path.join(root, 'repo', '.agent', 'skills', 'total-recall');
    ensureRequiredPlugins(sharedBrain);
    expect(fs.existsSync(path.join(sharedBrain, 'plugins', 'auth', 'plugin.json'))).toBe(true);
    // A project brain gets no copy at all; the shared folder serves it.
    ensureRequiredPlugins(projectBrain);
    expect(fs.existsSync(path.join(projectBrain, 'plugins'))).toBe(false);
    expect(inspectRequiredPlugins(projectBrain).status).toBe('ready');
    expect(inspectRequiredPlugins(projectBrain).source).toBe('shared');
  });

  it('keeps an existing repository copy working instead of deleting it behind the operator', () => {
    const sharedBrain = path.join(root, 'global', 'skills', 'total-recall');
    const projectBrain = path.join(root, 'repo', '.agent', 'skills', 'total-recall');
    ensureRequiredPlugins(sharedBrain);
    // A copy left by an earlier release is refreshed in place, never created anew.
    fs.mkdirSync(path.join(projectBrain, 'plugins'), { recursive: true });
    fs.cpSync(path.join(sharedBrain, 'plugins', 'auth'), path.join(projectBrain, 'plugins', 'auth'), { recursive: true });
    ensureRequiredPlugins(projectBrain);
    expect(fs.existsSync(path.join(projectBrain, 'plugins', 'auth', 'plugin.json'))).toBe(true);
    expect(inspectRequiredPlugins(projectBrain).source).toBe('local');
  });

  it('audits repository copies and marks an identical copy removable but an edited one not', () => {
    const sharedBrain = path.join(root, 'global', 'skills', 'total-recall');
    ensureRequiredPlugins(sharedBrain);
    const repo = path.join(root, 'repo');
    const pluginsDir = path.join(repo, '.agent', 'skills', 'total-recall', 'plugins');
    fs.mkdirSync(pluginsDir, { recursive: true });
    fs.cpSync(path.join(sharedBrain, 'plugins', 'auth'), path.join(pluginsDir, 'auth'), { recursive: true });
    fs.cpSync(path.join(sharedBrain, 'plugins', 'mesh'), path.join(pluginsDir, 'mesh'), { recursive: true });
    fs.appendFileSync(path.join(pluginsDir, 'mesh', 'cli.mjs'), '\n// local edit\n');
    const audit = auditProjectPluginCopies(repo, { sharedDir: path.join(sharedBrain, 'plugins') });
    const byId = Object.fromEntries(audit.copies.map(copy => [copy.id, copy]));
    expect(byId.auth.edited).toBe(false);
    expect(byId.mesh.edited).toBe(true);
  });
});
