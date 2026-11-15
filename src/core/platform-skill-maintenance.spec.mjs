// @vitest-environment node
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawnSync } from 'node:child_process';
import { refreshPlatformSkill } from './platform-skill-maintenance.mjs';
import { deploySkill, registerSkill } from './skills-registry.mjs';

let root, repo, distributionRoot, target, source;
const put = (file, data) => { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, data); };
const get = file => fs.readFileSync(file, 'utf8');
const wrapper = '---\nname: total-recall\nversion: 3.35.0\n---\n\n# Authored wrapper\nKeep this local instruction, trailing spaces too.  \n';
const options = () => ({ repo, skillId: 'total-recall', distributionRoot });
const plan = () => refreshPlatformSkill(options());
const apply = () => refreshPlatformSkill({ ...options(), apply: true, expectedSourceHash: plan().source.hash });
function tree(dir) {
  if (!fs.existsSync(dir)) return null;
  return fs.readdirSync(dir).sort().map(name => {
    const file = path.join(dir, name), stat = fs.lstatSync(file);
    return [name, stat.ino, stat.mode, stat.mtimeMs, stat.isSymbolicLink() ? fs.readlinkSync(file)
      : stat.isDirectory() ? tree(file) : fs.readFileSync(file).toString('base64')];
  });
}

beforeEach(() => {
  root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'tr-platform-')));
  repo = path.join(root, 'repo');
  distributionRoot = path.join(root, 'package');
  source = path.join(distributionRoot, 'scaffold/.agent/skills/total-recall');
  target = path.join(repo, '.agent/skills/total-recall');
  put(path.join(distributionRoot, 'package.json'), JSON.stringify({ name: 'total-recall-brain', version: '4.0.0' }));
  put(path.join(source, 'SKILL.md'), '---\nname: total-recall\nmetadata:\n  version: "4.0.1"\n  source: total-recall-brain\n---\n\nRead [contract](references/contract.md).\n');
  put(path.join(source, 'references/contract.md'), 'current contract\n');
  put(path.join(target, 'SKILL.md'), wrapper);
});
afterEach(() => { vi.restoreAllMocks(); fs.rmSync(root, { recursive: true, force: true }); });

describe('distribution platform refresh', () => {
  it('plans with no writes anywhere and requires the reviewed immutable source hash', () => {
    const before = tree(root), result = plan();
    expect(result).toMatchObject({ dryRun: true, source: { package: 'total-recall-brain', skill_version: '4.0.1' } });
    expect(tree(root)).toEqual(before);
    expect(() => refreshPlatformSkill({ ...options(), apply: true })).toThrow('source-hash');
    expect(tree(root)).toEqual(before);
    put(path.join(source, 'references/contract.md'), 'changed after review');
    expect(() => refreshPlatformSkill({ ...options(), apply: true, expectedSourceHash: result.source.hash })).toThrow('source-hash');
  });

  it('preserves an old authored wrapper, routes valid relative links, and is idempotent', () => {
    const result = apply();
    expect(get(path.join(target, 'SKILL.md')).startsWith(wrapper)).toBe(true);
    const layer = path.join(target, 'core/distributions', result.source.hash);
    expect(get(path.join(layer, 'SKILL.md'))).toContain('references/contract.md');
    expect(get(path.join(layer, 'references/contract.md'))).toBe('current contract\n');
    const receipt = JSON.parse(get(path.join(target, '.platform-distribution.json')));
    expect(receipt).toMatchObject({ hash: result.source.hash, package_version: '4.0.0', skill_version: '4.0.1', source_path: source });
    expect(receipt.files['references/contract.md']).toMatch(/^[a-f0-9]{64}$/);
    const before = tree(root);
    expect(apply().current).toBe(true);
    expect(tree(root)).toEqual(before);
  });

  it('upgrades only the route, retains previous layers and preserves later authored edits', () => {
    const first = apply();
    fs.appendFileSync(path.join(target, 'SKILL.md'), '\nMore local guidance.\n');
    put(path.join(source, 'references/contract.md'), 'new release');
    const second = apply();
    expect(second.source.hash).not.toBe(first.source.hash);
    expect(get(path.join(target, 'SKILL.md'))).toContain('More local guidance.');
    expect(get(path.join(target, 'core/distributions', first.source.hash, 'references/contract.md'))).toBe('current contract\n');
    expect(get(path.join(target, 'SKILL.md'))).not.toContain(first.source.hash);
  });

  it.each(['core', 'route'])('fails honestly on authored %s drift without a force path', kind => {
    const first = apply();
    const file = kind === 'core' ? path.join(target, 'core/distributions', first.source.hash, 'references/contract.md') : path.join(target, 'SKILL.md');
    put(file, get(file).replace('current', 'authored'));
    const before = tree(root);
    expect(() => apply()).toThrow(/drift/);
    expect(tree(root)).toEqual(before);
  });

  it('preserves private state and process writes interleaved with installation without copying it', () => {
    const privateFiles = ['memory-vault/rules/live.md', 'config/preferences.json', 'config/secrets.enc',
      'skills-registry/index.yaml', 'nested/scheduler/jobs.json', 'plugins/owner/config.json'];
    for (const file of privateFiles) put(path.join(target, file), 'original');
    const inodes = privateFiles.map(file => fs.statSync(path.join(target, file)).ino);
    const targetInode = fs.statSync(target).ino;
    const write = fs.writeFileSync;
    let wrote = false;
    vi.spyOn(fs, 'writeFileSync').mockImplementation((file, ...args) => {
      if (!wrote && String(file).includes('/core/distributions/')) {
        wrote = true;
        const child = spawnSync(process.execPath, ['--input-type=module', '-e',
          'import fs from "node:fs"; for (const file of process.argv.slice(1)) fs.appendFileSync(file,"\\nconcurrent canonical write");',
          ...privateFiles.map(file => path.join(target, file))], { encoding: 'utf8' });
        expect(child.status).toBe(0);
      }
      return write(file, ...args);
    });
    apply();
    expect(wrote).toBe(true);
    expect(fs.statSync(target).ino).toBe(targetInode);
    for (const [i, file] of privateFiles.entries()) {
      expect(get(path.join(target, file))).toBe('original\nconcurrent canonical write');
      expect(fs.statSync(path.join(target, file)).ino).toBe(inodes[i]);
    }
  });

  it('filters nested private distribution state and leaves unknown authored content untouched', () => {
    const privatePaths = ['config/settings.json', 'nested/config/state.json', 'nested/scheduler/jobs.json',
      'references/secrets.enc', 'references/.env.local', 'nested/memory-vault/rule.md'];
    for (const file of privatePaths) put(path.join(source, file), 'private source');
    put(path.join(target, 'core/authored.md'), 'unknown authored core');
    put(path.join(target, 'references/local.md'), 'unknown local');
    const result = apply();
    for (const file of privatePaths) expect(result.source.files).not.toHaveProperty(file);
    expect(get(path.join(target, 'core/authored.md'))).toBe('unknown authored core');
    expect(get(path.join(target, 'references/local.md'))).toBe('unknown local');
  });

  it.each(['source-file', 'source-parent', 'target-file', 'target-parent', 'receipt'])('rejects %s symlinks before mutation', kind => {
    if (kind === 'source-file') fs.symlinkSync(path.join(target, 'SKILL.md'), path.join(source, 'references/link.md'));
    if (kind === 'source-parent') {
      fs.renameSync(path.join(source, 'references'), path.join(source, 'real'));
      fs.symlinkSync('real', path.join(source, 'references'));
    }
    if (kind === 'target-file') {
      fs.renameSync(path.join(target, 'SKILL.md'), path.join(target, 'old.md'));
      fs.symlinkSync('old.md', path.join(target, 'SKILL.md'));
    }
    if (kind === 'target-parent') fs.symlinkSync(source, path.join(target, 'core'));
    if (kind === 'receipt') fs.symlinkSync(path.join(source, 'SKILL.md'), path.join(target, '.platform-distribution.json'));
    const before = tree(root);
    expect(() => apply()).toThrow(/symlink|Unsafe/);
    expect(tree(root)).toEqual(before);
  });

  it('never recreates missing or retired repositories or skill installs', () => {
    for (const missing of [path.join(root, 'retired'), path.join(root, 'existing')]) {
      if (missing.endsWith('existing')) fs.mkdirSync(missing);
      const before = tree(root);
      expect(() => refreshPlatformSkill({ ...options(), repo: missing, apply: true })).toThrow(/existing/);
      expect(tree(root)).toEqual(before);
    }
  });

  it('rejects repo-scoped or foreign-owner sources and retains generic cross-repo deploy protection', () => {
    registerSkill(path.join(root, 'registry'), source);
    expect(() => deploySkill(path.join(root, 'registry'), 'total-recall', { repo })).toThrow('repo-owned');
    for (const suffix of ['repo_scoped: true\n', 'metadata:\n  source: foreign-package\n']) {
      put(path.join(source, 'SKILL.md'), `---\nname: total-recall\n${suffix}---\n`);
      expect(() => plan()).toThrow('distribution owner');
    }
  });

  it('does not discard a same-hash layer collision or another refresh lock', () => {
    const result = plan();
    put(path.join(target, `core/distributions/${result.source.hash}/references/contract.md`), 'authored collision');
    expect(() => apply()).toThrow('collision');
    fs.rmSync(path.join(target, 'core'), { recursive: true });
    put(path.join(target, '.platform-refresh.lock'), 'another owner');
    expect(() => apply()).toThrow(/EEXIST/);
    expect(get(path.join(target, '.platform-refresh.lock'))).toBe('another owner');
  });

  it('proves actual shipped distribution refresh on disposable roots and records precise provenance', () => {
    // Optional installed package proof uses the exact caller-selected installed
    // distribution, not its live brain. The default exercises this source package.
    const actual = process.env.TR_PLATFORM_PROOF_DISTRIBUTION;
    const result = refreshPlatformSkill({ repo, skillId: 'total-recall', ...(actual ? { distributionRoot: actual } : {}) });
    expect(result.source.skill_version).toBe('3.39.1');
    const done = refreshPlatformSkill({ repo, skillId: 'total-recall', apply: true,
      expectedSourceHash: result.source.hash, ...(actual ? { distributionRoot: actual } : {}) });
    expect(done.source).toEqual(result.source);
    expect(get(path.join(target, 'SKILL.md')).startsWith(wrapper)).toBe(true);
    expect(fs.existsSync(path.join(target, `core/distributions/${result.source.hash}/references/operations.md`))).toBe(true);
    expect(refreshPlatformSkill({ repo, skillId: 'total-recall', ...(actual ? { distributionRoot: actual } : {}) }).current).toBe(true);
  });

  it('preserves the current shipped wrapper verbatim and keeps its permissions', () => {
    const shippedRoot = process.env.TR_PLATFORM_PROOF_DISTRIBUTION || process.cwd();
    const shipped = fs.readFileSync(path.join(shippedRoot, 'scaffold/.agent/skills/total-recall/SKILL.md'));
    put(path.join(target, 'SKILL.md'), shipped);
    fs.chmodSync(path.join(target, 'SKILL.md'), 0o640);
    const result = refreshPlatformSkill({ repo, skillId: 'total-recall', distributionRoot: shippedRoot });
    refreshPlatformSkill({ repo, skillId: 'total-recall', distributionRoot: shippedRoot,
      apply: true, expectedSourceHash: result.source.hash });
    expect(fs.readFileSync(path.join(target, 'SKILL.md')).subarray(0, shipped.length)).toEqual(shipped);
    expect(fs.statSync(path.join(target, 'SKILL.md')).mode & 0o777).toBe(0o640);
  });

  it('rejects tampered receipts naming private paths without inspecting or deleting private state', () => {
    apply();
    put(path.join(target, 'config/state.json'), 'live state');
    const file = path.join(target, '.platform-distribution.json');
    const receipt = JSON.parse(get(file));
    receipt.files['config/state.json'] = 'a'.repeat(64);
    put(file, JSON.stringify(receipt));
    const before = tree(root);
    expect(() => apply()).toThrow('Unsafe platform skill file');
    expect(tree(root)).toEqual(before);
  });

  it('refuses concurrent authored wrapper changes and retains the new authored bytes', () => {
    const write = fs.writeFileSync;
    let changed = false;
    vi.spyOn(fs, 'writeFileSync').mockImplementation((file, ...args) => {
      if (!changed && String(file).includes('/core/distributions/')) {
        changed = true;
        fs.appendFileSync(path.join(target, 'SKILL.md'), '\nConcurrent authored change.\n');
      }
      return write(file, ...args);
    });
    expect(() => apply()).toThrow('wrapper changed');
    expect(get(path.join(target, 'SKILL.md'))).toBe(wrapper + '\nConcurrent authored change.\n');
    expect(fs.existsSync(path.join(target, '.platform-distribution.json'))).toBe(false);
    expect(fs.existsSync(path.join(target, '.platform-refresh.lock'))).toBe(false);
    // Immutable files left by an interrupted attempt are verified on retry.
    vi.restoreAllMocks();
    expect(apply().success).toBe(true);
  });
});
