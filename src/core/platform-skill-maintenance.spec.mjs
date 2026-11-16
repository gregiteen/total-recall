// @vitest-environment node
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { spawn, spawnSync } from 'node:child_process';
import { once } from 'node:events';
import { refreshPlatformSkill } from './platform-skill-maintenance.mjs';
// The reproduction can be pointed at another revision of the module to prove it fails there.
const MODULE_UNDER_TEST = process.env.TR_PLATFORM_MODULE_UNDER_TEST || new URL('./platform-skill-maintenance.mjs', import.meta.url).href;
import { deploySkill, registerSkill, skillPackageFiles, hashSkillContent, copySkillDir, skillPackageExcludedPath } from './skills-registry.mjs';
import { isBrainState, rsyncExcludes } from './brain-state.mjs';

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

  const failureCases = ['first adoption', 'update'].flatMap(stage => ['before', 'after', 'flush', 'write'].flatMap(kind =>
    [1, 2, 3].map(boundary => [stage, kind, boundary])));
  it.each(failureCases)('recovers %s after %s publication boundary %i without force or state loss', (stage, kind, boundary) => {
    if (stage === 'update') {
      apply();
      fs.appendFileSync(path.join(target, 'SKILL.md'), '\nLater authored text.\n');
      put(path.join(source, 'references/contract.md'), 'next version');
    }
    put(path.join(target, 'memory-vault/rules/preserve.md'), 'canonical state');
    put(path.join(target, 'config/local.json'), 'local config');
    const inodes = ['memory-vault/rules/preserve.md', 'config/local.json'].map(file => fs.statSync(path.join(target, file)).ino);
    const rename = fs.renameSync, sync = fs.fsyncSync, write = fs.writeFileSync;
    let count = 0, armed = false;
    vi.spyOn(fs, 'renameSync').mockImplementation((from, to) => {
      count++;
      if (count === boundary && kind === 'before') throw new Error('injected publication failure');
      const result = rename(from, to);
      if (count === boundary && kind === 'after') throw new Error('injected publication failure');
      if (count === boundary && kind === 'flush') armed = true;
      return result;
    });
    vi.spyOn(fs, 'fsyncSync').mockImplementation(fd => {
      if (armed && fs.fstatSync(fd).isDirectory()) { armed = false; throw new Error('injected publication failure'); }
      return sync(fd);
    });
    vi.spyOn(fs, 'writeFileSync').mockImplementation((file, data, ...args) => {
      if (kind === 'write' && typeof file === 'number' && count + 1 === boundary &&
          (String(data).includes('<!-- total-recall:platform-distribution:v1 -->') || /\n  "schema": [12],/.test(String(data)))) {
        throw new Error('injected publication failure');
      }
      return write(file, data, ...args);
    });
    expect(() => apply()).toThrow('injected publication failure');
    vi.restoreAllMocks();
    const before = tree(root), pending = plan();
    expect(tree(root)).toEqual(before); // read-only recovery inspection
    if (boundary !== 1 || !['before', 'write'].includes(kind)) {
      if (!(boundary === 3 && ['after', 'flush'].includes(kind))) expect(pending.pending?.recoverable).toBe(true);
    }
    apply();
    expect(plan()).toMatchObject({ current: true, pending: null });
    expect(get(path.join(target, 'SKILL.md')).startsWith(wrapper)).toBe(true);
    if (stage === 'update') expect(get(path.join(target, 'SKILL.md'))).toContain('Later authored text.');
    for (const [i, file] of ['memory-vault/rules/preserve.md', 'config/local.json'].entries()) {
      expect(fs.statSync(path.join(target, file)).ino).toBe(inodes[i]);
    }
    expect(get(path.join(target, 'memory-vault/rules/preserve.md'))).toBe('canonical state');
    expect(get(path.join(target, 'config/local.json'))).toBe('local config');
  });

  const crashes = ['first adoption', 'update'].flatMap(stage => ['before', 'after'].flatMap(kind => [1, 2, 3].map(boundary => [stage, kind, boundary])));
  it.each(crashes)('retries actual CLI after abrupt %s crash %s publication %i', (stage, kind, boundary) => {
    if (stage === 'update') apply();
    // Refresh the actual source distribution; the same real CLI can recover it.
    distributionRoot = process.cwd();
    put(path.join(target, 'config/preserve.json'), 'private state');
    const inode = fs.statSync(path.join(target, 'config/preserve.json')).ino;
    const runner = `import fs from 'node:fs';
      const api = await import(process.argv[1]); const options = JSON.parse(process.argv[2]);
      const rename = fs.renameSync; let count = 0;
      fs.renameSync = (from,to) => { count++; if (count === ${boundary} && ${JSON.stringify(kind)} === 'before') process.exit(71);
        const result = rename(from,to); if (count === ${boundary} && ${JSON.stringify(kind)} === 'after') process.exit(71); return result; };
      api.refreshPlatformSkill({...options, apply:true, expectedSourceHash:api.refreshPlatformSkill(options).source.hash});`;
    const child = spawnSync(process.execPath, ['--input-type=module', '-e', runner,
      new URL('./platform-skill-maintenance.mjs', import.meta.url).href, JSON.stringify(options())], { encoding: 'utf8', timeout: 10000 });
    expect(child.status, child.stderr).toBe(71);
    const cli = args => spawnSync(process.execPath, ['bin/total-recall.mjs', 'skill', 'refresh-platform', 'total-recall', '--repo', repo, ...args], { encoding: 'utf8', timeout: 10000 });
    const before = tree(root), inspected = cli(['--dry-run']);
    expect(inspected.status, inspected.stderr).toBe(0);
    expect(tree(root)).toEqual(before);
    const report = JSON.parse(inspected.stdout);
    expect(report.lock).toBe('abandoned');
    const retry = cli(['--apply', '--source-hash', report.source.hash]);
    expect(retry.status, retry.stderr).toBe(0);
    expect(plan()).toMatchObject({ current: true, pending: null, lock: 'absent' });
    expect(get(path.join(target, 'SKILL.md')).startsWith(wrapper)).toBe(true);
    expect(get(path.join(target, 'config/preserve.json'))).toBe('private state');
    expect(fs.statSync(path.join(target, 'config/preserve.json')).ino).toBe(inode);
  });

  it.each(['checksum', 'private-path', 'wrapper', 'symlink', 'layer'])('fails closed for tampered pending %s state and leaves authored/private bytes intact', kind => {
    const rename = fs.renameSync;
    let count = 0;
    vi.spyOn(fs, 'renameSync').mockImplementation((from, to) => {
      if (++count === 2) throw new Error('stop before wrapper');
      return rename(from, to);
    });
    expect(() => apply()).toThrow('stop before wrapper');
    vi.restoreAllMocks();
    const file = path.join(target, '.platform-distribution.json');
    const pending = JSON.parse(get(file));
    if (kind === 'checksum') { pending.checksum = '0'.repeat(64); put(file, JSON.stringify(pending)); }
    if (kind === 'private-path') {
      pending.next.files['config/leak.json'] = '0'.repeat(64);
      const { checksum, ...intent } = pending;
      pending.checksum = crypto.createHash('sha256').update(JSON.stringify(intent)).digest('hex');
      put(file, JSON.stringify(pending));
    }
    if (kind === 'wrapper') fs.appendFileSync(path.join(target, 'SKILL.md'), 'unrecognized authored edit');
    if (kind === 'symlink') { fs.renameSync(file, `${file}.saved`); fs.symlinkSync(`${file}.saved`, file); }
    if (kind === 'layer') put(path.join(target, `core/distributions/${pending.next.hash}/references/contract.md`), 'authored core edit');
    put(path.join(target, 'config/live.json'), 'keep');
    const before = tree(root);
    expect(() => apply()).toThrow(/pending|Unsafe|drift/);
    expect(tree(root)).toEqual(before);
  });

  it('finishes a pinned pending transition when the available distribution changes', () => {
    const rename = fs.renameSync;
    let count = 0;
    vi.spyOn(fs, 'renameSync').mockImplementation((from, to) => {
      if (++count === 3) throw new Error('stop before final receipt');
      return rename(from, to);
    });
    expect(() => apply()).toThrow('stop before final receipt');
    vi.restoreAllMocks();
    const pinned = plan().source.hash;
    put(path.join(source, 'references/contract.md'), 'new available version');
    expect(plan()).toMatchObject({ source: { hash: pinned }, pending: { recoverable: true } });
    expect(plan().availableSourceHash).not.toBe(pinned);
    apply();
    expect(plan().pending).toBeNull();
    expect(plan().current).toBe(false);
    apply();
    expect(plan().current).toBe(true);
  });

  describe('lock ownership', () => {
    const deadOwner = () => {
      const exited = spawnSync(process.execPath, ['-e', '']);
      return exited.pid;
    };
    const lockOwner = (pid, command) => JSON.stringify({ schema: 1, pid, command, token: crypto.randomUUID() });
    const lockFiles = () => {
      const dir = path.join(target, '.platform-refresh');
      return [fs.existsSync(path.join(target, '.platform-refresh.lock')) ? '.platform-refresh.lock' : null,
        ...(fs.existsSync(dir) ? fs.readdirSync(dir).filter(name => /^lock-\d+$/.test(name)) : [])].filter(Boolean);
    };

    it('reclaims a lock whose pid now belongs to an unrelated live process, but never a live owner', () => {
      // The recorded pid is alive, yet its command line is not the refresher that wrote the lock.
      put(path.join(target, '.platform-refresh.lock'), lockOwner(process.pid, 'a program that is not this process'));
      expect(plan().lock).toBe('abandoned');
      expect(apply().success).toBe(true);
      expect(lockFiles()).toEqual([]);
      // A live owner whose command matches is honored, and its lock is left byte for byte.
      const live = lockOwner(process.pid, spawnSync('ps', ['-o', 'command=', '-p', String(process.pid)], { encoding: 'utf8' }).stdout.trim());
      put(path.join(target, '.platform-refresh.lock'), live);
      expect(plan().lock).toBe('active');
      put(path.join(source, 'references/contract.md'), 'next version');
      expect(() => apply()).toThrow(/EEXIST/);
      expect(get(path.join(target, '.platform-refresh.lock'))).toBe(live);
    });

    it('lets exactly one of two reclaimers of the same dead lock proceed', async () => {
      // Reproduces the stale-lock race with real processes. Reclaimer B reads the dead lock and
      // stops just before it would take over. Holder A then takes over and enters its critical
      // section. B resumes. A takeover that removes whatever sits at the lock path deletes A's
      // live lock and lets B in beside A.
      put(path.join(target, '.platform-refresh.lock'), lockOwner(deadOwner(), 'node dead-refresher'));
      const barrier = path.join(root, 'barrier');
      fs.mkdirSync(barrier);
      const script = `import fs from 'node:fs';
        const [moduleUrl, role, optionsJson, dir] = process.argv.slice(1);
        const nap = new Int32Array(new SharedArrayBuffer(4));
        const wait = file => { const end = Date.now() + 15000; while (!fs.existsSync(file)) { if (Date.now() > end) process.exit(3); Atomics.wait(nap, 0, 0, 10); } };
        const lockPath = file => /\\.platform-refresh\\.lock$|\\.platform-refresh\\/lock-\\d+$/.test(String(file));
        const unlink = fs.unlinkSync, link = fs.linkSync, write = fs.writeFileSync;
        let stopped = false;
        if (role === 'reclaimer') {
          const stop = () => { if (!stopped) { stopped = true; write(dir + '/reclaimer-ready', '1'); wait(dir + '/reclaimer-go'); } };
          fs.unlinkSync = (file, ...rest) => { if (lockPath(file)) stop(); return unlink(file, ...rest); };
          fs.linkSync = (from, to, ...rest) => { if (lockPath(to)) stop(); return link(from, to, ...rest); };
        } else {
          fs.writeFileSync = (file, ...rest) => {
            if (!stopped && String(file).includes('/core/distributions/')) { stopped = true; write(dir + '/holder-inside', '1'); wait(dir + '/reclaimer-result.json'); }
            return write(file, ...rest);
          };
        }
        const api = await import(moduleUrl);
        const options = JSON.parse(optionsJson);
        let outcome;
        try { api.refreshPlatformSkill({ ...options, apply: true, expectedSourceHash: api.refreshPlatformSkill(options).source.hash }); outcome = { ok: true }; }
        catch (error) { outcome = { ok: false, message: error.message }; }
        write(dir + '/' + role + '-result.json', JSON.stringify(outcome));`;
      const start = role => spawn(process.execPath, ['--input-type=module', '-e', script, MODULE_UNDER_TEST, role, JSON.stringify(options()), barrier],
        { stdio: ['ignore', 'ignore', 'pipe'] });
      const until = async file => { for (let i = 0; i < 1500 && !fs.existsSync(path.join(barrier, file)); i++) await new Promise(resolve => setTimeout(resolve, 10)); expect(fs.existsSync(path.join(barrier, file)), file).toBe(true); };
      const reclaimer = start('reclaimer');
      await until('reclaimer-ready');
      const holder = start('holder');
      await until('holder-inside');
      const lockBefore = lockFiles().map(name => [name, get(name === '.platform-refresh.lock' ? path.join(target, name) : path.join(target, '.platform-refresh', name))]);
      fs.writeFileSync(path.join(barrier, 'reclaimer-go'), '1');
      await Promise.all([once(reclaimer, 'exit'), once(holder, 'exit')]);
      const result = role => JSON.parse(get(path.join(barrier, `${role}-result.json`)));
      expect(result('reclaimer')).toMatchObject({ ok: false });
      expect(result('reclaimer').message).toMatch(/EEXIST/);
      expect(result('holder')).toEqual({ ok: true });
      expect(lockBefore.length).toBeGreaterThan(0);
      expect(lockFiles()).toEqual([]);
      expect(plan()).toMatchObject({ current: true, pending: null, lock: 'absent' });
    }, 60000);

    it('never leaves a second live lock when a reclaimer loses, and releases only its own file', () => {
      put(path.join(target, '.platform-refresh.lock'), lockOwner(deadOwner(), 'node dead-refresher'));
      const write = fs.writeFileSync;
      let intruded = false;
      vi.spyOn(fs, 'writeFileSync').mockImplementation((file, ...rest) => {
        if (!intruded && String(file).includes('/core/distributions/')) {
          intruded = true;
          // Another process replaces our lock file while we work: release must not delete it.
          const mine = path.join(target, '.platform-refresh', fs.readdirSync(path.join(target, '.platform-refresh')).find(name => /^lock-\d+$/.test(name)));
          fs.rmSync(mine);
          put(mine, lockOwner(process.pid, 'someone else entirely'));
        }
        return write(file, ...rest);
      });
      apply();
      vi.restoreAllMocks();
      expect(lockFiles().map(name => get(path.join(target, '.platform-refresh', name)))).toEqual([expect.stringContaining('someone else entirely')]);
    });
  });

  it('excludes host-local receipts, pending state, lock and temporary authored bytes at every depth while exporting the immutable portable core', () => {
    const result = apply();
    const hash = hashSkillContent(target);
    const names = ['.platform-distribution.json', '.platform-refresh.lock', '.platform-refresh/transient-wrapper'];
    for (const prefix of ['', 'nested/']) for (const name of names) {
      const relative = prefix + name;
      // Keep the root's real final receipt: metadata mutation cannot change a
      // package hash, and nested pending documents must not be exported either.
      if (relative !== '.platform-distribution.json') put(path.join(target, relative), '/host/local/source-path PRIVATE-CANARY');
      expect(isBrainState(relative)).toBe(true);
      expect(skillPackageExcludedPath(relative)).toBe(true);
      expect(skillPackageFiles(target)).not.toContain(relative);
    }
    expect(hashSkillContent(target)).toBe(hash);
    expect(rsyncExcludes()).toEqual(expect.arrayContaining(['.platform-distribution.json', '.platform-refresh.lock', '.platform-refresh/']));
    const exported = path.join(root, 'exported');
    copySkillDir(target, exported);
    expect(fs.existsSync(path.join(exported, `core/distributions/${result.source.hash}/references/contract.md`))).toBe(true);
    expect(skillPackageFiles(exported).some(relative => names.some(name => relative.endsWith(name)))).toBe(false);
    expect(fs.existsSync(path.join(exported, '.platform-distribution.json'))).toBe(false);
    expect(fs.existsSync(path.join(exported, 'nested/.platform-refresh'))).toBe(false);
  });
});
