// @vitest-environment node
import { it, expect, vi, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawnSync } from 'node:child_process';
import { runPlatformRefresh } from './skill-platform.mjs';
import * as platform from './skill-platform.mjs';
import skillCli from './skill.mjs';
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
  runPlatformRefresh(['total-recall', '--global'], { refresh, home: '/disposable/home' });
  expect(refresh).toHaveBeenLastCalledWith({ skillId: 'total-recall', repo: '/disposable/home', apply: false, expectedSourceHash: undefined });
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
    expect(fs.readdirSync(target).sort()).toEqual(['.platform-distribution.json', 'SKILL.md', 'core']);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});
