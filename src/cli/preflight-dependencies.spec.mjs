// @vitest-environment node
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { SKILLS, noteCaller } from '../core/preflight-receipt.mjs';

const BIN = fileURLToPath(new URL('../../bin/total-recall.mjs', import.meta.url));
describe('preflight dependency restoration through the real CLI', () => {
  let fixture, home, repo, env;
  const write = (name, value) => fs.writeFileSync(path.join(repo, name), value);
  const calls = () => {
    try { return fs.readFileSync(path.join(repo, 'install-calls.jsonl'), 'utf8').trim().split('\n').map(JSON.parse); }
    catch { return []; }
  };
  const ack = (actions = 'edit', { json = true, cwd = repo, extra = [] } = {}) => spawnSync(process.execPath, [BIN, 'tr-preflight', '--ack', '--task', 'dependency fixture', '--action', actions, ...(json ? ['--json'] : []), ...extra], { cwd, env, encoding: 'utf8', timeout: 15000 });
  const parsed = result => {
    expect(result.error).toBeUndefined();
    return JSON.parse(result.stdout.trim().split('\n').pop());
  };
  beforeEach(() => {
    fixture = fs.mkdtempSync(path.join(os.tmpdir(), 'tr-pf-dependencies-'));
    home = path.join(fixture, 'home');
    repo = path.join(fixture, 'repo');
    const bin = path.join(fixture, 'bin');
    for (const dir of [home, repo, bin, path.join(fixture, 'tmp')]) fs.mkdirSync(dir);
    for (const rel of SKILLS) {
      const target = path.join(repo, rel);
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.writeFileSync(target, '# Fixture skill\n');
    }
    write('package.json', JSON.stringify({ name: 'dependency-fixture', version: '1.0.0' }));
    write('package-lock.json', '{"lockfileVersion":3}');
    fs.symlinkSync(process.execPath, path.join(bin, 'node'));
    fs.writeFileSync(path.join(bin, 'npm'), `#!/usr/bin/env node
import fs from 'node:fs';
fs.appendFileSync('install-calls.jsonl', JSON.stringify({ cwd: process.cwd(), args: process.argv.slice(2) }) + '\\n');
console.log('fixture installer output');
if (fs.existsSync('fail-install')) process.exitCode = 6;
else fs.mkdirSync('node_modules', { recursive: true });
`, { mode: 0o700 });
    env = { ...process.env, HOME: home, AGENT_DIR: path.join(repo, '.agent'), _TR_TEST_AGENT_DIR: '', TR_META_HARNESS_RUN: '', TR_PREFLIGHT_MAX_AGE_MIN: '30', PATH: `${bin}${path.delimiter}${process.env.PATH}`, TMPDIR: path.join(fixture, 'tmp') };
  });
  afterEach(() => fs.rmSync(fixture, { recursive: true, force: true }));

  it.each(['edit', 'test', 'read, edit,test'])('restores dependencies for %s at the resolved project root', actions => {
    const nested = path.join(repo, 'nested');
    fs.mkdirSync(nested);
    const result = ack(actions, { cwd: nested });
    expect(result.status, result.stderr).toBe(0);
    expect(parsed(result)).toMatchObject({ ok: true, dependencies: { ok: true, status: 'installed', root: fs.realpathSync(repo) } });
    expect(calls()).toEqual([{ cwd: fs.realpathSync(repo), args: ['ci'] }]);
    expect(fs.existsSync(path.join(repo, 'node_modules/.total-recall-install.json'))).toBe(true);
  });
  it('does not install for read-only work or a similar action name', () => {
    for (const actions of ['read', 'build', 'editing']) {
      const result = ack(actions);
      expect(result.status, result.stderr).toBe(0);
      expect(parsed(result)).toMatchObject({ ok: true, dependencies: null });
    }
    expect(calls()).toEqual([]);
  });
  it('reports the no-lockfile skip in preflight output', () => {
    fs.rmSync(path.join(repo, 'package-lock.json'));
    expect(parsed(ack())).toMatchObject({ ok: true, dependencies: { status: 'skipped', trigger: 'no-lockfile' } });
    expect(calls()).toEqual([]);
  });
  it('rechecks dependencies even when the capsule is unchanged, then restores a removed install', () => {
    const root = fs.realpathSync(repo);
    const forSession = () => {
      noteCaller(root, 'dependency-session', 'ack', 'dependency fixture', { home });
      return parsed(ack());
    };
    expect(forSession()).toMatchObject({ ok: true, unchanged: false, dependencies: { status: 'installed' } });
    expect(forSession()).toMatchObject({ ok: true, unchanged: true, dependencies: { status: 'current' } });
    fs.rmSync(path.join(repo, 'node_modules'), { recursive: true });
    expect(forSession()).toMatchObject({ ok: true, unchanged: true, dependencies: { status: 'installed', trigger: 'missing' } });
    expect(calls()).toHaveLength(2);
  });
  it('reports failure and exits nonzero, but keeps the instruction receipt available for repair', () => {
    write('fail-install', '');
    const result = ack();
    expect(result.status).toBe(1);
    expect(parsed(result)).toMatchObject({ ok: false, receipt: expect.any(String), problems: [expect.stringContaining('dependencies:')], dependencies: { status: 'failed', exitCode: 6, output: expect.stringContaining('fixture installer output') } });
    const check = spawnSync(process.execPath, [BIN, 'tr-preflight', '--check', '--json'], { cwd: repo, env, encoding: 'utf8' });
    expect(check.status, check.stderr).toBe(0);
    fs.rmSync(path.join(repo, 'fail-install'));
    expect(parsed(ack())).toMatchObject({ ok: true, dependencies: { status: 'installed' } });
  });
  it('prints dependency status in text output without printing child output', () => {
    const result = ack('test', { json: false });
    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toContain('dependencies: installed — npm ci');
    expect(result.stdout).not.toContain('fixture installer output');
    write('fail-install', '');
    write('package-lock.json', 'changed');
    const failure = ack('edit', { json: false });
    expect(failure.status).toBe(1);
    expect(failure.stdout).toContain('dependencies: failed');
    expect(failure.stderr).toContain('Dependency install failed');
  });
  it('does not install when acknowledgement fails', () => {
    for (const rel of SKILLS) fs.rmSync(path.join(repo, rel));
    const result = ack();
    expect(result.status).toBe(1);
    expect(parsed(result)).toMatchObject({ ok: false, dependencies: null });
    expect(calls()).toEqual([]);
  });
  it('keeps ack --help free of acknowledgement and install side effects', () => {
    const result = ack('edit', { extra: ['--help'] });
    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toContain('Usage: total-recall preflight');
    expect(calls()).toEqual([]);
    expect(fs.existsSync(path.join(home, '.agent/tr-preflight'))).toBe(false);
  });
});
