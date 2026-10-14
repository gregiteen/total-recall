import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { buildPluginCatalog, refreshPluginCatalog } from './plugin-catalog.mjs';
import { compileSurface } from './surface.mjs';
import { installPlugin, uninstallPlugin, describePlugin } from './plugin-distribution.mjs';
import { getPlugin } from './plugin-loader.mjs';
import { spawnSync } from 'node:child_process';
import { PACKAGE_ROOT } from './plugin-loader.mjs';

describe('plugin inventory and CLI library lifecycle', () => {
  let root, previous;
  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'tr-catalog-'));
    previous = { agent: process.env._TR_TEST_AGENT_DIR, bundled: process.env._TR_TEST_BUNDLED_PLUGINS_DIR };
    process.env._TR_TEST_AGENT_DIR = path.join(root, 'global-agent');
    process.env._TR_TEST_BUNDLED_PLUGINS_DIR = path.join(root, 'bundled');
    fs.mkdirSync(path.join(root, '.agent'), { recursive: true });
    const config = path.join(root, '.agent/skills/total-recall/config'); fs.mkdirSync(config, { recursive: true });
    fs.writeFileSync(path.join(config, 'clients.json'), JSON.stringify(['codex', 'claude-code', 'antigravity']));
  });
  afterEach(() => {
    for (const [key, value] of [['_TR_TEST_AGENT_DIR', previous.agent], ['_TR_TEST_BUNDLED_PLUGINS_DIR', previous.bundled]]) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
    fs.rmSync(root, { recursive: true, force: true });
  });
  function source() {
    const dir = path.join(root, 'source'); fs.mkdirSync(dir);
    const manifest = { id: 'catalog-example', name: 'Example', version: '1.0.0', description: 'Inspect example records',
      cli: { command: 'example', handler: 'cli.mjs', subcommands: [{ name: 'list', effect: 'read', output: 'json', args: [] }] } };
    fs.writeFileSync(path.join(dir, 'plugin.json'), JSON.stringify(manifest));
    fs.writeFileSync(path.join(dir, 'cli.mjs'), "throw new Error('Catalog must never execute this handler');");
    return dir;
  }
  const derived = () => path.join(root, '.agent/skills/total-recall/memory-derived');

  it('actual install and removal refresh both derived catalogs and compiled instructions', async () => {
    const result = await installPlugin(source(), { projectRoot: root });
    expect(result.compilation.ok).toBe(true);
    // The installed-grid response must retain the same command contract as detail.
    expect(describePlugin(getPlugin('catalog-example', root)).manifest.cli.subcommands[0]).toMatchObject({ name: 'list', effect: 'read', output: 'json', args: [] });
    const inventory = JSON.parse(fs.readFileSync(path.join(derived(), 'plugin-inventory.json')));
    const library = JSON.parse(fs.readFileSync(path.join(derived(), 'cli-library.json')));
    expect(inventory.plugins.map(p => p.id)).toContain('catalog-example');
    expect(library.commands.find(c => c.name === 'list')).toMatchObject({ command: 'total-recall example list', declarationComplete: true });
    const cli = spawnSync(process.execPath, [path.join(PACKAGE_ROOT, 'bin/total-recall.mjs'), 'plugin', 'library', '--plugin', 'catalog-example', '--json'], { cwd: root, env: process.env, encoding: 'utf8', timeout: 30000 });
    expect(cli.status, cli.stderr).toBe(0);
    expect(JSON.parse(cli.stdout).commands[0].command).toBe('total-recall example list');
    expect(fs.readFileSync(path.join(root, 'AGENTS.md'), 'utf8')).toContain('plugin library --json');
    expect(fs.readFileSync(path.join(root, 'AGENTS.md'), 'utf8')).toContain('catalog-example');
    for (const file of ['INSTRUCTIONS.md', 'CLAUDE.md', '.agents/rules/AGENTS.md']) {
      expect(fs.readFileSync(path.join(root, file), 'utf8')).toContain('plugin library --json');
    }
    const removed = await uninstallPlugin('catalog-example', { projectRoot: root });
    expect(removed.compilation.ok).toBe(true);
    expect(JSON.parse(fs.readFileSync(path.join(derived(), 'cli-library.json'))).commands.some(c => c.plugin === 'catalog-example')).toBe(false);
  });

  it('manifest edits invalidate compilation even when vault content is unchanged', async () => {
    const installed = await installPlugin(source(), { projectRoot: root });
    const file = path.join(installed.plugin.dir, 'plugin.json');
    const manifest = JSON.parse(fs.readFileSync(file));
    manifest.cli.subcommands.push({ name: 'inspect', effect: 'read' }); fs.writeFileSync(file, JSON.stringify(manifest));
    const result = await compileSurface({ vaultDir: path.join(root, '.agent/skills/total-recall/memory-vault'), skillsDir: path.join(root, '.agent/skills'),
      derivedDir: derived(), instructionsFile: path.join(root, '.agent/INSTRUCTIONS.md'), semantic: false });
    expect(result.skipped).not.toBe(true);
    const library = JSON.parse(fs.readFileSync(path.join(derived(), 'cli-library.json')));
    expect(library.commands.find(c => c.name === 'inspect')).toMatchObject({ declarationComplete: false, args: null, output: null });
  });

  it('invalid manifests stay in the inventory but never expose callable operations', () => {
    const dir = source();
    const fake = [{ id: 'invalid-example', dir, scope: 'project', valid: false, errors: ['invalid manifest'], manifest: { cli: { command: 'invalid', handler: 'cli.mjs', subcommands: [{ name: 'send', effect: 'send' }] } } }];
    const library = buildPluginCatalog(root, { discover: () => fake });
    expect(library.plugins[0].valid).toBe(false); expect(library.commands).toEqual([]);
  });

  it('empty catalogs overwrite stale derived entries without importing code', () => {
    fs.mkdirSync(derived(), { recursive: true });
    fs.writeFileSync(path.join(derived(), 'cli-library.json'), '{"stale":true}');
    const catalog = refreshPluginCatalog(derived(), root, { discover: () => [] });
    expect(catalog.commands).toEqual([]);
    expect(JSON.parse(fs.readFileSync(path.join(derived(), 'cli-library.json'))).fingerprint).toBe(catalog.fingerprint);
  });

  it('installed files and record remain accounted for when an instruction surface cannot be written', async () => {
    fs.mkdirSync(path.join(root, 'INSTRUCTIONS.md'));
    const result = await installPlugin(source(), { projectRoot: root });
    expect(result.compilation.ok).toBe(false);
    expect(result.compilation.error).toContain('instruction surface');
    expect(fs.existsSync(path.join(result.plugin.dir, 'plugin.json'))).toBe(true);
    expect(fs.existsSync(path.join(root, '.agent/skills/total-recall/memory-vault/system/plugins/catalog-example.md'))).toBe(true);
  });

  it('compiles a linked instruction target without replacing the link or authored wording', async () => {
    const target = path.join(root, 'AGENTS.md');
    fs.writeFileSync(target, '# Authored operating rules\nKeep this wording.\n');
    fs.symlinkSync('AGENTS.md', path.join(root, 'CLAUDE.md'));
    const result = await installPlugin(source(), { projectRoot: root });
    expect(result.compilation.ok).toBe(true);
    expect(fs.lstatSync(path.join(root, 'CLAUDE.md')).isSymbolicLink()).toBe(true);
    expect(fs.readFileSync(target, 'utf8')).toContain('Keep this wording.');
    expect(fs.readFileSync(target, 'utf8')).toContain('catalog-example');
  });

  it('reports an out-of-project linked instruction target without touching it', async () => {
    const target = `${root}-external.md`;
    fs.writeFileSync(target, '# Separate project instructions\n');
    try {
      fs.symlinkSync(target, path.join(root, 'CLAUDE.md'));
      const result = await installPlugin(source(), { projectRoot: root });
      expect(result.compilation.ok).toBe(false);
      expect(result.compilation.error).toContain('outside the selected project');
      expect(fs.readFileSync(target, 'utf8')).toBe('# Separate project instructions\n');
      expect(fs.lstatSync(path.join(root, 'CLAUDE.md')).isSymbolicLink()).toBe(true);
    } finally { fs.rmSync(target, { force: true }); }
  });
});
