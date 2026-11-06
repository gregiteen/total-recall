// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { relocateGlobalSkills, resolveRelocatedGlobalBrainDir } from './global-brain-relocation.mjs';
import { ensureRequiredPlugins, inspectRequiredPlugins } from './required-plugins.mjs';

let home;
let skills;
let destination;

beforeEach(() => {
  home = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'tr-shared-skills-')));
  skills = path.join(home, '.agent', 'skills');
  destination = path.join(home, 'workspace', '.shared');
  fs.mkdirSync(path.join(skills, 'total-recall'), { recursive: true });
  fs.mkdirSync(path.dirname(destination));
  fs.writeFileSync(path.join(skills, 'total-recall', 'SKILL.md'), 'global');
});

afterEach(() => {
  vi.restoreAllMocks();
  fs.rmSync(home, { recursive: true, force: true });
});

describe('shared skills relocation', () => {
  it('previews without writes, then moves one tree and preserves links, inodes and separate project skills', () => {
    const projectSkills = path.join(path.dirname(destination), 'repo', '.agent', 'skills');
    fs.mkdirSync(path.join(projectSkills, 'total-recall'), { recursive: true });
    const projectSkill = path.join(projectSkills, 'total-recall', 'SKILL.md');
    fs.writeFileSync(projectSkill, 'project');
    fs.mkdirSync(path.join(skills, 'ssss'));
    fs.writeFileSync(path.join(skills, 'ssss', 'SKILL.md'), 'shared skill');
    fs.symlinkSync('../ssss/SKILL.md', path.join(skills, 'total-recall', 'shared.md'));
    fs.symlinkSync(projectSkill, path.join(skills, 'total-recall', 'external.md'));
    const original = fs.statSync(skills);

    expect(relocateGlobalSkills(destination, { home }).status).toBe('planned');
    expect(fs.existsSync(destination)).toBe(false);

    const result = relocateGlobalSkills(destination, { home, apply: true });
    expect(result.status).toBe('relocated');
    expect(fs.lstatSync(skills).isSymbolicLink()).toBe(true);
    expect(fs.realpathSync(skills)).toBe(result.target);
    expect(fs.statSync(result.target).ino).toBe(original.ino);
    expect(fs.statSync(destination).mode & 0o777).toBe(0o700);
    expect(fs.readFileSync(path.join(skills, 'total-recall', 'shared.md'), 'utf8')).toBe('shared skill');
    expect(fs.readFileSync(path.join(skills, 'total-recall', 'external.md'), 'utf8')).toBe('project');
    expect(fs.readFileSync(projectSkill, 'utf8')).toBe('project');
    expect(relocateGlobalSkills(destination, { home, apply: true }).status).toBe('already-relocated');
  });

  it('refuses a preexisting destination, a Git worktree or another relocation', () => {
    fs.mkdirSync(destination);
    expect(() => relocateGlobalSkills(destination, { home, apply: true })).toThrow('Destination already exists');
    const workspace = path.dirname(destination);
    fs.writeFileSync(path.join(workspace, '.git'), 'gitdir: elsewhere');
    expect(() => relocateGlobalSkills(path.join(workspace, 'other'), { home })).toThrow('outside Git worktrees');
    fs.mkdirSync(`${skills}.relocate-lock`);
    expect(() => relocateGlobalSkills(destination, { home, apply: true })).toThrow('relocation is locked');
    expect(fs.lstatSync(skills).isDirectory()).toBe(true);
  });

  it('provisions required assets after relocation and validates a project skill link', () => {
    vi.spyOn(os, 'homedir').mockReturnValue(home);
    const shared = path.join(skills, 'total-recall');
    ensureRequiredPlugins(shared, { sharedBrainDir: shared });
    const { target } = relocateGlobalSkills(destination, { home, apply: true });
    expect(resolveRelocatedGlobalBrainDir(shared)).toBe(path.join(target, 'total-recall'));

    const projectSkills = path.join(home, 'project', '.agent', 'skills');
    const project = path.join(projectSkills, 'total-recall');
    fs.mkdirSync(project, { recursive: true });
    fs.symlinkSync(path.join(skills, 'ssss'), path.join(projectSkills, 'ssss'));
    expect(ensureRequiredPlugins(project, { sharedBrainDir: shared })).toMatchObject({ status: 'ready', source: 'shared' });
    expect(fs.lstatSync(path.join(projectSkills, 'ssss')).isSymbolicLink()).toBe(true);
    expect(fs.existsSync(path.join(project, 'plugins'))).toBe(false);
  });

  it.runIf(typeof process.getuid === 'function')('refuses a relocated destination writable by others', () => {
    vi.spyOn(os, 'homedir').mockReturnValue(home);
    const shared = path.join(skills, 'total-recall');
    relocateGlobalSkills(destination, { home, apply: true });
    fs.chmodSync(destination, 0o777);
    expect(() => ensureRequiredPlugins(shared, { sharedBrainDir: shared })).toThrow(/Unsafe shared skills relocation/);
    expect(inspectRequiredPlugins(shared, { sharedBrainDir: shared }).status).toBe('failed');
    expect(fs.existsSync(path.join(shared, 'plugins'))).toBe(false);
  });

  it('refuses a relative link whose target would change', () => {
    fs.symlinkSync('../../outside', path.join(skills, 'total-recall', 'escaping'));
    expect(() => relocateGlobalSkills(destination, { home, apply: true })).toThrow('Relative link leaves');
    expect(fs.existsSync(destination)).toBe(false);
  });

  it('restores the original home directory if it cannot link the moved tree', () => {
    const original = fs.statSync(skills);
    vi.spyOn(fs, 'symlinkSync').mockImplementation(() => { throw new Error('link unavailable'); });
    expect(() => relocateGlobalSkills(destination, { home, apply: true })).toThrow('link unavailable');
    expect(fs.lstatSync(skills).isDirectory()).toBe(true);
    expect(fs.statSync(skills).ino).toBe(original.ino);
    expect(fs.existsSync(destination)).toBe(false);
    expect(fs.existsSync(`${skills}.relocate-lock`)).toBe(false);
  });
});
