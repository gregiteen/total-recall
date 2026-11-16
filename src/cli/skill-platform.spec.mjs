// @vitest-environment node
import { it, expect, vi, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawnSync } from 'node:child_process';
import { runPlatformRefresh } from './skill-platform.mjs';
import * as platform from './skill-platform.mjs';
import skillCli from './skill.mjs';
import { refreshPlatformSkill } from '../core/platform-skill-maintenance.mjs';
afterEach(() => vi.restoreAllMocks());
it('keeps explicit global scope through top-level skill dispatch', async () => {
  const run = vi.spyOn(platform, 'runPlatformRefresh').mockReturnValue({ success: true });
  await skillCli(['refresh-platform', 'total-recall', '--global', '--dry-run']);
  expect(run).toHaveBeenCalledWith(['total-recall', '--global', '--dry-run']);
});
it('requires explicit scope, defaults to dry run, and forwards reviewed hash only', () => {
  vi.spyOn(console, 'log').mockImplementation(() => {});
  const refresh = vi.fn().mockReturnValue({ success: true });
  expect(() => runPlatformRefresh(['total-recall'], { refresh })).toThrow('Usage');
  const configured = fs.mkdtempSync(path.join(os.tmpdir(), 'tr-platform-configured-'));
  try {
    fs.mkdirSync(path.join(configured, 'skills'));
    runPlatformRefresh(['total-recall', '--global'], { refresh, globalAgentDir: () => configured });
    expect(refresh).toHaveBeenLastCalledWith({ skillId: 'total-recall', globalSkillsDir: fs.realpathSync(path.join(configured, 'skills')), apply: false, expectedSourceHash: undefined });
  } finally { fs.rmSync(configured, { recursive: true, force: true }); }
  runPlatformRefresh(['total-recall', '--repo', '/existing/repo', '--apply', '--source-hash', 'abc'], { refresh });
  expect(refresh).toHaveBeenLastCalledWith({ skillId: 'total-recall', repo: '/existing/repo', apply: true, expectedSourceHash: 'abc' });
  for (const args of [['--force'], ['--source', '/foreign'], ['--apply', '--dry-run'], ['--repo']]) {
    expect(() => runPlatformRefresh(['total-recall', '--global', ...args], { refresh })).toThrow();
  }
});

it('runs the real source CLI against an existing disposable install without registry or brain initialization', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'tr-platform-cli-'));
  const target = path.join(root, '.agent/skills/total-recall');
  const wrapper = '---\nname: total-recall\nversion: 3.35.0\n---\nAuthored wrapper.\n';
  fs.mkdirSync(target, { recursive: true });
  fs.writeFileSync(path.join(target, 'SKILL.md'), wrapper);
  const run = args => {
    const child = spawnSync(process.execPath, ['bin/total-recall.mjs', 'skill', 'refresh-platform', 'total-recall', '--repo', root, ...args], { encoding: 'utf8', timeout: 10000 });
    expect(child.status, child.stderr).toBe(0);
    return JSON.parse(child.stdout);
  };
  try {
    const plan = run(['--dry-run', '--json']);
    expect(fs.readdirSync(target)).toEqual(['SKILL.md']);
    run(['--apply', '--source-hash', plan.source.hash]);
    expect(fs.readFileSync(path.join(target, 'SKILL.md'), 'utf8').startsWith(wrapper)).toBe(true);
    expect(run(['--json']).current).toBe(true);
    expect(fs.readdirSync(target).sort()).toEqual(['.platform-distribution.json', '.platform-refresh', 'SKILL.md', 'core']);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

function globalFixture() {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'tr-platform-global-')));
  const agentDir = path.join(root, 'operator-configured-agent');
  const physical = path.join(root, 'relocated/skills');
  const target = path.join(physical, 'total-recall');
  const wrapper = '---\nname: total-recall\nversion: 3.35.0\n---\nAuthored global guidance.\n';
  fs.mkdirSync(target, { recursive: true });
  fs.mkdirSync(agentDir);
  fs.symlinkSync(physical, path.join(agentDir, 'skills'), 'dir');
  fs.writeFileSync(path.join(target, 'SKILL.md'), wrapper);
  const invoke = args => runPlatformRefresh(['total-recall', '--global', ...args], { globalAgentDir: () => agentDir });
  return { root, agentDir, physical, target, wrapper, invoke };
}

it('uses the configured global resolver in the real CLI and permits an explicit shared skills alias without walking private state', () => {
  const fixture = globalFixture();
  const { root, agentDir, target, wrapper } = fixture;
  fs.mkdirSync(path.join(target, 'config'));
  fs.writeFileSync(path.join(target, 'config/keep.json'), 'keep private');
  const inode = fs.statSync(path.join(target, 'config/keep.json')).ino;
  const run = args => spawnSync(process.execPath, ['bin/total-recall.mjs', 'skill', 'refresh-platform', 'total-recall', '--global', ...args], {
    encoding: 'utf8', timeout: 10000, env: { ...process.env, AGENT_DIR: agentDir },
  });
  try {
    const inspected = run(['--dry-run']);
    expect(inspected.status, inspected.stderr).toBe(0);
    const plan = JSON.parse(inspected.stdout);
    expect(plan.target).toBe(target);
    expect(fs.readdirSync(target).sort()).toEqual(['SKILL.md', 'config']);
    const applied = run(['--apply', '--source-hash', plan.source.hash]);
    expect(applied.status, applied.stderr).toBe(0);
    expect(JSON.parse(run(['--dry-run']).stdout).current).toBe(true);
    expect(fs.readFileSync(path.join(target, 'SKILL.md'), 'utf8').startsWith(wrapper)).toBe(true);
    expect(fs.statSync(path.join(target, 'config/keep.json')).ino).toBe(inode);
    expect(fs.readFileSync(path.join(target, 'config/keep.json'), 'utf8')).toBe('keep private');
    // This configured alias is accepted only by explicit --global.
    const home = path.join(root, 'fake-home');
    fs.mkdirSync(home);
    fs.symlinkSync(agentDir, path.join(home, '.agent'), 'dir');
    const denied = spawnSync(process.execPath, ['bin/total-recall.mjs', 'skill', 'refresh-platform', 'total-recall', '--repo', home, '--dry-run'], { encoding: 'utf8', timeout: 10000 });
    expect(denied.status).toBe(1);
    expect(denied.stderr).toContain('Unsafe platform skill path');
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

it('pins the configured agent alias to its physical skills anchor before strict refresh and refuses source aliases', () => {
  vi.spyOn(console, 'log').mockImplementation(() => {});
  const { root, agentDir, target } = globalFixture();
  try {
    const alias = path.join(root, 'agent-alias');
    fs.symlinkSync(agentDir, alias, 'dir');
    const other = path.join(root, 'other/skills/total-recall');
    fs.mkdirSync(other, { recursive: true });
    fs.writeFileSync(path.join(other, 'SKILL.md'), 'other authored wrapper');
    const plan = runPlatformRefresh(['total-recall', '--global'], { globalAgentDir: () => alias });
    const readdir = fs.readdirSync;
    vi.spyOn(fs, 'readdirSync').mockImplementation((dir, ...args) => {
      if (path.resolve(String(dir)).startsWith(path.dirname(target))) throw new Error('private-state walk');
      return readdir(dir, ...args);
    });
    const done = runPlatformRefresh(['total-recall', '--global', '--apply', '--source-hash', plan.source.hash], {
      globalAgentDir: () => alias,
      refresh: options => {
        expect(options.globalSkillsDir).toBe(path.dirname(target));
        fs.unlinkSync(path.join(agentDir, 'skills'));
        fs.symlinkSync(path.dirname(other), path.join(agentDir, 'skills'), 'dir');
        return refreshPlatformSkill(options);
      },
    });
    expect(done.target).toBe(target);
    expect(fs.readFileSync(path.join(other, 'SKILL.md'), 'utf8')).toBe('other authored wrapper');
    vi.restoreAllMocks();
    // An authorized root alias still cannot alias the shipped source itself.
    fs.unlinkSync(path.join(agentDir, 'skills'));
    fs.symlinkSync(path.resolve('scaffold/.agent/skills'), path.join(agentDir, 'skills'), 'dir');
    for (const args of [[], ['--apply', '--source-hash', plan.source.hash]]) {
      expect(() => runPlatformRefresh(['total-recall', '--global', ...args], { globalAgentDir: () => alias })).toThrow('aliases distribution source');
    }
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

it.each(['skill', 'core', 'repo-skills'])('retains strict rejection of internal %s symlinks after allowing only the global anchor', kind => {
  vi.spyOn(console, 'log').mockImplementation(() => {});
  const { root, agentDir, target, physical, invoke } = globalFixture();
  try {
    const elsewhere = path.join(root, 'elsewhere');
    fs.mkdirSync(elsewhere);
    if (kind === 'skill') {
      fs.renameSync(target, path.join(elsewhere, 'total-recall'));
      fs.symlinkSync(path.join(elsewhere, 'total-recall'), target, 'dir');
      expect(() => invoke(['--dry-run'])).toThrow('Unsafe platform skill path');
    } else if (kind === 'core') {
      fs.symlinkSync(elsewhere, path.join(target, 'core'), 'dir');
      expect(() => invoke(['--dry-run'])).toThrow('Unsafe platform skill path');
    } else {
      const repo = path.join(root, 'repo');
      fs.mkdirSync(path.join(repo, '.agent'), { recursive: true });
      fs.symlinkSync(physical, path.join(repo, '.agent/skills'), 'dir');
      expect(() => runPlatformRefresh(['total-recall', '--repo', repo, '--dry-run'], { globalAgentDir: () => agentDir })).toThrow('Unsafe platform skill path');
    }
    expect(fs.readdirSync(elsewhere)).toEqual(kind === 'skill' ? ['total-recall'] : []);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

it('recovers interrupted global alias publication through the same configured scope', () => {
  vi.spyOn(console, 'log').mockImplementation(() => {});
  const { root, target, wrapper, invoke } = globalFixture();
  try {
    const plan = invoke(['--dry-run']);
    const rename = fs.renameSync;
    let count = 0;
    vi.spyOn(fs, 'renameSync').mockImplementation((from, to) => {
      if (++count === 3) throw new Error('stop final receipt');
      return rename(from, to);
    });
    expect(() => invoke(['--apply', '--source-hash', plan.source.hash])).toThrow('stop final receipt');
    vi.mocked(fs.renameSync).mockRestore();
    const receipt = fs.readFileSync(path.join(target, '.platform-distribution.json'));
    const pending = invoke(['--dry-run']);
    expect(pending.pending).toMatchObject({ recoverable: true, phase: 'after-wrapper' });
    expect(fs.readFileSync(path.join(target, '.platform-distribution.json'))).toEqual(receipt);
    expect(invoke(['--apply', '--source-hash', pending.source.hash])).toMatchObject({ current: true, recovered: true, pending: null });
    expect(fs.readFileSync(path.join(target, 'SKILL.md'), 'utf8').startsWith(wrapper)).toBe(true);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});
