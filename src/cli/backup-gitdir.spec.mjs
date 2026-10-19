import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { adoptExternalGitDir, brainGitDir } from './backup.mjs';

const run = (cwd, env, ...args) => execFileSync('git', args, { cwd, env: { ...process.env, ...env }, encoding: 'utf8' }).trim();

describe('backup git dir lives outside the project tree', () => {
  let tmp, home, project, brain, oldHome;
  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'tr-gitdir-'));
    home = path.join(tmp, 'home');
    project = path.join(tmp, 'project');
    brain = path.join(project, '.agent', 'skills', 'total-recall');
    fs.mkdirSync(home, { recursive: true });
    fs.mkdirSync(brain, { recursive: true });
    oldHome = process.env.HOME;
    process.env.HOME = home;
    run(project, {}, 'init', '-q', '-b', 'main');
    fs.writeFileSync(path.join(project, 'README.md'), 'x');
    // a legacy nested backup repo with history
    run(brain, {}, 'init', '-q', '-b', 'main');
    fs.writeFileSync(path.join(brain, 'note.md'), 'memory');
    run(brain, {}, 'add', '-A');
    run(brain, {}, '-c', 'user.email=a@b', '-c', 'user.name=t', 'commit', '-q', '-m', 'backup: old');
  });
  afterEach(() => {
    process.env.HOME = oldHome;
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  it('moves a nested .git out, keeps history, and hides the brain from the project repo', () => {
    expect(adoptExternalGitDir(brain)).toBe(true);
    const external = brainGitDir(brain);
    expect(external.startsWith(path.join(home, '.agent', 'brain-backups'))).toBe(true);
    expect(fs.existsSync(path.join(brain, '.git'))).toBe(false);
    const env = { GIT_DIR: external, GIT_WORK_TREE: brain };
    expect(run(brain, env, 'log', '--format=%s')).toBe('backup: old');
    expect(run(brain, env, 'status', '--porcelain')).toBe('');
    // the project repo no longer sees an embedded repository
    run(project, {}, 'add', '-A');
    expect(run(project, {}, 'ls-files', '-s')).not.toMatch(/^160000/m);
    expect(run(project, {}, 'ls-files')).toBe('README.md');
  });

  it('is idempotent', () => {
    expect(adoptExternalGitDir(brain)).toBe(true);
    expect(adoptExternalGitDir(brain)).toBe(false);
    const exclude = fs.readFileSync(path.join(project, '.git', 'info', 'exclude'), 'utf8');
    expect(exclude.split('\n').filter(l => l === '/.agent/skills/total-recall/')).toHaveLength(1);
  });

  it('leaves a brain the project repo already tracks alone', () => {
    fs.rmSync(path.join(brain, '.git'), { recursive: true, force: true });
    run(project, {}, 'add', '-A');
    run(brain, {}, 'init', '-q', '-b', 'main'); // recreate to exercise the move
    adoptExternalGitDir(brain);
    const exclude = fs.existsSync(path.join(project, '.git', 'info', 'exclude'))
      ? fs.readFileSync(path.join(project, '.git', 'info', 'exclude'), 'utf8') : '';
    expect(exclude).not.toContain('/.agent/skills/total-recall/');
  });

  it('unstages a stale gitlink the project repo recorded for the nested repo', () => {
    run(project, {}, '-c', 'user.email=a@b', '-c', 'user.name=t', 'add', '-A');
    expect(run(project, {}, 'ls-files', '-s')).toMatch(/^160000 /m);
    adoptExternalGitDir(brain);
    expect(run(project, {}, 'ls-files', '-s')).not.toMatch(/^160000/m);
    expect(fs.readFileSync(path.join(project, '.git', 'info', 'exclude'), 'utf8')).toContain('/.agent/skills/total-recall/');
  });
});
