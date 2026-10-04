import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { createPlugin } from './create.mjs';
import { generateUiElements } from '../../core/app-deploy/ui-elements.mjs';

describe('Plugin Creation CLI (cli/plugin/create.mjs)', () => {
  let tmpProject;
  let tmpSkillDir;
  let logSpy;

  beforeEach(() => {
    tmpProject = fs.mkdtempSync(path.join(os.tmpdir(), 'tr-create-proj-'));
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
    if (fs.existsSync(tmpProject)) fs.rmSync(tmpProject, { recursive: true, force: true });
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

    const pluginDir = path.join(
      tmpProject,
      '.agent',
      'skills',
      'total-recall',
      'plugins',
      'packaged-cap'
    );

    expect(fs.existsSync(pluginDir)).toBe(true);

    // 1. Manifest has deploy, skills, and cli blocks
    const manifest = JSON.parse(fs.readFileSync(path.join(pluginDir, 'plugin.json'), 'utf8'));
    expect(manifest.id).toBe('packaged-cap');
    expect(manifest.deploy).toBeDefined();
    expect(manifest.deploy.targets).toContain('ssss-app');
    expect(manifest.skills[0].path).toBe('./skills/packaged-cap/SKILL.md');
    expect(manifest.cli.command).toBe('packaged-cap');

    // 2. Skill files were copied
    const destSkillDir = path.join(pluginDir, 'skills', 'packaged-cap');
    expect(fs.existsSync(path.join(destSkillDir, 'SKILL.md'))).toBe(true);
    expect(fs.existsSync(path.join(destSkillDir, 'helper.sh'))).toBe(true);
    expect(fs.existsSync(path.join(pluginDir, 'cli.mjs'))).toBe(true);
  });

  it('creates a scheduled plugin with a valid token-driven UI panel', async () => {
    const cwdSpy = vi.spyOn(process, 'cwd').mockReturnValue(tmpProject);
    try {
      await createPlugin(['daily-review', '--name', 'Daily Review', '--with-task', '--task-command', 'refresh', '--task-schedule', '0 6 * * *', '--task-intent', 'Refresh the review', '--with-ui']);
    } finally { cwdSpy.mockRestore(); }
    const dir = path.join(tmpProject, '.agent', 'skills', 'total-recall', 'plugins', 'daily-review');
    const manifest = JSON.parse(fs.readFileSync(path.join(dir, 'plugin.json'), 'utf8'));
    expect(manifest.tasks).toEqual([{ intent: 'Refresh the review', schedule: '0 6 * * *', command: 'refresh', placement: 'selected-node' }]);
    expect(generateUiElements(manifest, { pluginDir: dir, target: 'web-components' }).files.some((file) => file.path === 'elements/panel.js')).toBe(true);
    expect(fs.readFileSync(path.join(dir, 'README.md'), 'utf8')).toContain('selected node');
  });

  it('--api-key scaffolds a paste-your-key UI, a token CLI and a declared secret', async () => {
    const cwdSpy = vi.spyOn(process, 'cwd').mockReturnValue(tmpProject);
    try {
      await createPlugin(['acme-sync', '--name', 'Acme Sync', '--api-key', 'ACME_API_KEY']);
    } finally { cwdSpy.mockRestore(); }
    const dir = path.join(tmpProject, '.agent', 'skills', 'total-recall', 'plugins', 'acme-sync');
    const manifest = JSON.parse(fs.readFileSync(path.join(dir, 'plugin.json'), 'utf8'));
    expect(manifest.secrets).toEqual([expect.objectContaining({ key: 'ACME_API_KEY', required: true })]);
    expect(manifest.ui.elements[0].events).toContain('save-token');
    const panel = fs.readFileSync(path.join(dir, 'ui', 'panel.js'), 'utf8');
    expect(panel).toContain("type = 'password'");
    expect(panel).toContain('save-token');
    const cli = fs.readFileSync(path.join(dir, 'cli.mjs'), 'utf8');
    expect(cli).toContain('"secret", "set", TOKEN_KEY, "--stdin"');
    expect(cli).toContain('IMPLEMENTED.token = tokenCommand');
    expect(cli).not.toMatch(/argv.*TOKEN/);
    expect(generateUiElements(manifest, { pluginDir: dir, target: 'web-components' }).files.some((file) => file.path === 'elements/panel.js')).toBe(true);
  });

  it('rejects incomplete task options before creating a directory', async () => {
    const cwdSpy = vi.spyOn(process, 'cwd').mockReturnValue(tmpProject);
    try {
      await expect(createPlugin(['daily-review', '--with-task', '--task-command', 'refresh'])).rejects.toThrow('--task-schedule');
    } finally { cwdSpy.mockRestore(); }
    expect(fs.existsSync(path.join(tmpProject, '.agent', 'skills', 'total-recall', 'plugins', 'daily-review'))).toBe(false);
  });
});
