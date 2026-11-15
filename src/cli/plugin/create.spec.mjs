import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { createPlugin } from './create.mjs';
import { generateUiElements } from '../../core/app-deploy/ui-elements.mjs';
import { packPlugin, decodeBundle, writeEntriesAtomic } from '../../core/plugin-bundle.mjs';

describe('Plugin Creation CLI (cli/plugin/create.mjs)', () => {
  let tmpParent;
  let tmpProject;
  let tmpSkillDir;
  let logSpy;
  let previousAgentDir;
  // `plugin create` links the new plugin into the shared folder; keep that folder private to the test.
  const sharedPlugin = (id) => path.join(tmpParent, 'shared-agent', 'skills', 'total-recall', 'plugins', id);

  beforeEach(() => {
    // `plugin create` writes its standalone repo beside the project
    // (<parent>/tr-plugin-<id>), so the project gets a private parent; a shared
    // os.tmpdir() parent collides with repos left by earlier runs.
    tmpParent = fs.mkdtempSync(path.join(os.tmpdir(), 'tr-create-'));
    tmpProject = path.join(tmpParent, 'project');
    fs.mkdirSync(tmpProject);
    previousAgentDir = process.env._TR_TEST_AGENT_DIR;
    process.env._TR_TEST_AGENT_DIR = path.join(tmpParent, 'shared-agent');
    tmpSkillDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tr-source-skill-'));
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    // Create a mock source skill
    fs.writeFileSync(
      path.join(tmpSkillDir, 'SKILL.md'),
      `---
name: my-packaged-skill
description: "Packaged from existing skill"
version: 1.0.0
---

# Packaged Skill
Instructions here.
`
    );
    fs.writeFileSync(path.join(tmpSkillDir, 'helper.sh'), '#!/bin/bash\necho "hello"\n');
  });

  afterEach(() => {
    logSpy.mockRestore();
    if (previousAgentDir === undefined) delete process.env._TR_TEST_AGENT_DIR;
    else process.env._TR_TEST_AGENT_DIR = previousAgentDir;
    if (fs.existsSync(tmpParent)) fs.rmSync(tmpParent, { recursive: true, force: true });
    if (fs.existsSync(tmpSkillDir)) fs.rmSync(tmpSkillDir, { recursive: true, force: true });
  });

  it('exports createPlugin function', () => {
    expect(createPlugin).toBeDefined();
    expect(typeof createPlugin).toBe('function');
  });

  it('scaffolds capability plugin from existing skill via --from-skill', async () => {
    const cwdSpy = vi.spyOn(process, 'cwd').mockReturnValue(tmpProject);

    await createPlugin([
      'packaged-cap',
      '--from-skill',
      tmpSkillDir
    ]);

    cwdSpy.mockRestore();

    const pluginDir = sharedPlugin('packaged-cap');
    expect(fs.existsSync(path.join(tmpProject, '.agent', 'skills', 'total-recall', 'plugins'))).toBe(false);

    expect(fs.existsSync(pluginDir)).toBe(true);

    // 1. Manifest has deploy, skills, and cli blocks
    const manifest = JSON.parse(fs.readFileSync(path.join(pluginDir, 'plugin.json'), 'utf8'));
    expect(manifest.id).toBe('packaged-cap');
    expect(manifest.gate).toEqual({ tasks: [], owned_commands: [] });
    expect(fs.readFileSync(path.join(pluginDir, 'README.md'), 'utf8')).toContain('## Using this from an agent');
    expect(manifest.deploy).toBeDefined();
    expect(manifest.deploy.targets).toContain('ssss-app');
    expect(manifest.skills[0].path).toBe('./skills/packaged-cap/SKILL.md');
    expect(manifest.cli.command).toBe('packaged-cap');

    // The scaffold declares a real read status command for the native Home,
    // so a new plugin is contract-conformant and shows live state (no fixed metrics).
    const statusSub = manifest.cli.subcommands.find((s) => s.name === 'status');
    expect(statusSub.effect).toBe('read');
    expect(statusSub.output).toBe('json');
    expect(manifest.status).toEqual({ command: 'status', refresh_seconds: 60 });
    const { validatePluginManifest } = await import('../../core/plugin-loader.mjs');
    const contract = validatePluginManifest(manifest);
    expect(contract.errors).toEqual([]);
    expect(contract.valid).toBe(true);

    // 2. Skill files were copied
    const destSkillDir = path.join(pluginDir, 'skills', 'packaged-cap');
    expect(fs.existsSync(path.join(destSkillDir, 'SKILL.md'))).toBe(true);
    expect(fs.existsSync(path.join(destSkillDir, 'helper.sh'))).toBe(true);
    expect(fs.existsSync(path.join(pluginDir, 'cli.mjs'))).toBe(true);
  });

  it('creates a scheduled plugin without generating the owner Home', async () => {
    const cwdSpy = vi.spyOn(process, 'cwd').mockReturnValue(tmpProject);
    try {
      await createPlugin(['daily-review', '--name', 'Daily Review', '--with-task', '--task-command', 'refresh', '--task-schedule', '0 6 * * *', '--task-intent', 'Refresh the review', '--with-ui']);
    } finally { cwdSpy.mockRestore(); }
    const dir = sharedPlugin('daily-review');
    const manifest = JSON.parse(fs.readFileSync(path.join(dir, 'plugin.json'), 'utf8'));
    expect(manifest.tasks).toEqual([{ intent: 'Refresh the review', schedule: '0 6 * * *', command: 'refresh', placement: 'selected-node' }]);
    // The native Home is bespoke owner code, authored by hand. No generator may
    // emit one, so --with-ui produces no UI module of any kind.
    expect(fs.existsSync(path.join(dir, 'ui', 'panel.js'))).toBe(false);
    expect(fs.existsSync(path.join(dir, 'ui', 'home.js'))).toBe(false);
    expect(manifest.scaffold).toBe(true);
    expect(fs.readFileSync(path.join(dir, 'README.md'), 'utf8')).toContain('total-recall plugin chunks validate <file>');
  });

  it('converts only public skill bytes and preserves the original and symlink targets', async () => {
    const privateFiles = ['config/keys.json', 'research-queue.jsonl', 'references/config/nested.json', 'references/research-queue.jsonl', 'memory-vault/note.md', 'references/session.enc', 'references/output.log', '.env'];
    const publicFiles = ['references/guide.md', 'capability/run.mjs', 'cli/command.mjs', 'unknown/payload.dat'];
    const original = new Map();
    for (const rel of [...privateFiles, ...publicFiles, 'SKILL.md', 'helper.sh']) {
      const abs = path.join(tmpSkillDir, rel);
      fs.mkdirSync(path.dirname(abs), { recursive: true });
      if (!fs.existsSync(abs)) fs.writeFileSync(abs, `${rel}: original fixture bytes`);
      original.set(rel, fs.readFileSync(abs));
    }
    fs.chmodSync(path.join(tmpSkillDir, 'helper.sh'), 0o755);
    const outside = path.join(tmpParent, 'outside');
    fs.mkdirSync(outside);
    fs.writeFileSync(path.join(outside, 'private.md'), 'outside-private-canary');
    fs.symlinkSync(outside, path.join(tmpSkillDir, 'references', 'escape'));
    fs.symlinkSync(path.join(outside, 'private.md'), path.join(tmpSkillDir, 'leak.md'));
    fs.symlinkSync(path.join(tmpSkillDir, 'helper.sh'), path.join(tmpSkillDir, 'alias.sh'));
    const beforePaths = fs.readdirSync(tmpSkillDir, { recursive: true }).sort();
    const repo = path.join(tmpParent, 'converted');
    await createPlugin(['private-safe', '--from-skill', tmpSkillDir, '--repo-dir', repo, '--no-install']);
    const manifest = JSON.parse(fs.readFileSync(path.join(repo, 'plugin.json'), 'utf8'));
    const bundle = packPlugin(repo, manifest);
    const decoded = decodeBundle(JSON.parse(JSON.stringify(bundle)));
    const recipient = writeEntriesAtomic(path.join(tmpParent, 'received'), manifest.id, decoded.entries);
    const prefix = 'skills/private-safe/';
    const expected = ['SKILL.md', 'helper.sh', ...publicFiles].sort();
    expect(bundle.files.filter((f) => f.path.startsWith(prefix)).map((f) => f.path.slice(prefix.length))).toEqual(expected);
    for (const dest of [repo, recipient]) {
      const skill = path.join(dest, 'skills', 'private-safe');
      for (const rel of expected) expect(fs.readFileSync(path.join(skill, rel))).toEqual(original.get(rel));
      for (const rel of [...privateFiles, 'references/escape', 'leak.md', 'alias.sh']) {
        expect(fs.existsSync(path.join(skill, rel))).toBe(false);
      }
      expect(fs.statSync(path.join(skill, 'helper.sh')).mode & 0o777).toBe(0o755);
      expect(fs.existsSync(path.join(dest, 'cli.mjs'))).toBe(true);
    }
    expect(fs.readdirSync(tmpSkillDir, { recursive: true }).sort()).toEqual(beforePaths);
    for (const [rel, bytes] of original) expect(fs.readFileSync(path.join(tmpSkillDir, rel))).toEqual(bytes);
    expect(fs.readlinkSync(path.join(tmpSkillDir, 'leak.md'))).toBe(path.join(outside, 'private.md'));
    expect(fs.readFileSync(path.join(outside, 'private.md'), 'utf8')).toBe('outside-private-canary');
  });

  it.each(['root', 'root/SKILL.md', 'SKILL.md'])('rejects a linked %s before creating a repository', async (kind) => {
    const repo = path.join(tmpParent, 'converted');
    let source = tmpSkillDir;
    if (kind.startsWith('root')) {
      source = path.join(tmpParent, 'source-link');
      fs.symlinkSync(tmpSkillDir, source);
      if (kind === 'root/SKILL.md') source = path.join(source, 'SKILL.md');
    } else {
      const target = path.join(tmpParent, 'private.md');
      fs.renameSync(path.join(tmpSkillDir, 'SKILL.md'), target);
      fs.symlinkSync(target, path.join(tmpSkillDir, 'SKILL.md'));
    }
    await expect(createPlugin(['linked-skill', '--from-skill', source, '--repo-dir', repo, '--no-install'])).rejects.toThrow(/symlink|regular public SKILL/);
    expect(fs.existsSync(repo)).toBe(false);
    expect(fs.readdirSync(tmpParent).some((p) => p.startsWith('.tr-plugin-'))).toBe(false);
  });

  it('rejects a destination inside the source even through a parent alias', async () => {
    const alias = path.join(tmpParent, 'alias');
    fs.symlinkSync(tmpSkillDir, alias);
    await expect(createPlugin(['overlap', '--from-skill', tmpSkillDir, '--repo-dir', path.join(alias, 'new', 'repo'), '--no-install'])).rejects.toThrow(/outside the source/);
    expect(fs.existsSync(path.join(tmpSkillDir, 'new'))).toBe(false);
  });

  it('preflights all source reads before creating a repository', async () => {
    const repo = path.join(tmpParent, 'converted');
    const blockedFile = fs.realpathSync(path.join(tmpSkillDir, 'helper.sh'));
    const open = fs.openSync;
    const spy = vi.spyOn(fs, 'openSync').mockImplementation((file, ...args) => {
      if (file === blockedFile) throw new Error('source-read-failure');
      return open(file, ...args);
    });
    try {
      await expect(createPlugin(['read-failure', '--from-skill', tmpSkillDir, '--repo-dir', repo, '--no-install'])).rejects.toThrow('source-read-failure');
      expect(fs.existsSync(repo)).toBe(false);
      expect(fs.readdirSync(tmpParent).some((p) => p.startsWith('.tr-plugin-'))).toBe(false);
    } finally { spy.mockRestore(); }
  });

  it('removes an incomplete conversion without publishing or changing the source', async () => {
    const repo = path.join(tmpParent, 'converted');
    const before = fs.readFileSync(path.join(tmpSkillDir, 'helper.sh'));
    const write = fs.writeFileSync;
    const spy = vi.spyOn(fs, 'writeFileSync').mockImplementation((file, ...args) => {
      if (String(file).endsWith('/skills/write-failure/helper.sh')) throw new Error('recipient-write-failure');
      return write(file, ...args);
    });
    try {
      await expect(createPlugin(['write-failure', '--from-skill', tmpSkillDir, '--repo-dir', repo, '--no-install'])).rejects.toThrow('recipient-write-failure');
      expect(fs.existsSync(repo)).toBe(false);
      expect(fs.existsSync(sharedPlugin('write-failure'))).toBe(false);
      expect(fs.readdirSync(tmpParent).some((p) => p.startsWith('.tr-plugin-'))).toBe(false);
      expect(fs.readFileSync(path.join(tmpSkillDir, 'helper.sh'))).toEqual(before);
    } finally { spy.mockRestore(); }
  });

  it('--api-key scaffolds a token CLI and a declared secret, but no generated face', async () => {
    const cwdSpy = vi.spyOn(process, 'cwd').mockReturnValue(tmpProject);
    try {
      await createPlugin(['acme-sync', '--name', 'Acme Sync', '--api-key', 'ACME_API_KEY']);
    } finally { cwdSpy.mockRestore(); }
    const dir = sharedPlugin('acme-sync');
    const manifest = JSON.parse(fs.readFileSync(path.join(dir, 'plugin.json'), 'utf8'));
    expect(manifest.secrets).toEqual([expect.objectContaining({ key: 'ACME_API_KEY', required: true })]);
    // No credential-entry UI is generated: that pattern produced the shared
    // scaffold face this contract removed.
    expect(manifest.ui).toBeUndefined();
    expect(fs.existsSync(path.join(dir, 'ui'))).toBe(false);
    const cli = fs.readFileSync(path.join(dir, 'cli.mjs'), 'utf8');
    expect(cli).toContain('authRun(["set", TOKEN_KEY, "--stdin"]');
    expect(cli).toContain("'auth', 'secret'");
    expect(cli).not.toContain('process.env[TOKEN_KEY]');
    expect(cli).toContain('IMPLEMENTED.token = tokenCommand');
    expect(cli).not.toMatch(/argv.*TOKEN/);
    const handlerUrl = pathToFileURL(path.join(dir, 'cli.mjs')).href;
    const rejected = spawnSync(process.execPath, ['--input-type=module', '--eval', `const { run } = await import(${JSON.stringify(handlerUrl)}); await run(['node', 'total-recall', 'acme-sync', 'token', 'set', '--stdin']);`], {
      encoding: 'utf8', input: 'fixture-key-must-not-be-saved', env: { ...process.env, TOTAL_RECALL_BIN: '/nonexistent/fixture-tr' },
    });
    expect(rejected.status).toBe(1);
    expect(rejected.stderr).toContain('verification must be implemented');
    expect(rejected.stdout).not.toContain('saved');
    // The scaffold declares no face, so UI generation has nothing to emit.
    expect(() => generateUiElements(manifest, { pluginDir: dir, target: 'web-components' })).toThrow(/declares no ui/);
  });

  it('rejects incomplete task options before creating a directory', async () => {
    const cwdSpy = vi.spyOn(process, 'cwd').mockReturnValue(tmpProject);
    try {
      await expect(createPlugin(['daily-review', '--with-task', '--task-command', 'refresh'])).rejects.toThrow('--task-schedule');
    } finally { cwdSpy.mockRestore(); }
    expect(fs.existsSync(path.join(tmpProject, '.agent', 'skills', 'total-recall', 'plugins', 'daily-review'))).toBe(false);
  });
});
