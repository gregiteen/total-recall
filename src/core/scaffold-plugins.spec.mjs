import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { findOwnerRepos, isReleaseFile, releaseFiles, syncScaffoldPlugins } from './scaffold-plugins.mjs';

let root;
let source;
const packed = (files) => () => ({ status: 0, stdout: `npm notice\n${JSON.stringify([{ files: files.map((p) => ({ path: p })) }])}` });
function write(base, rel, body) {
  fs.mkdirSync(path.dirname(path.join(base, rel)), { recursive: true });
  fs.writeFileSync(path.join(base, rel), body);
}
beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'scaffold-plugins-'));
  source = fs.mkdtempSync(path.join(os.tmpdir(), 'scaffold-plugin-src-'));
  for (const [rel, body] of Object.entries({ 'plugin.json': '{"id":"auth"}', 'cli.mjs': 'cli-v2', 'src/new.mjs': 'new', 'package.json': '{}', 'package-lock.json': '{}', '.gitignore': 'x', 'test/a.spec.mjs': 't' })) write(source, rel, body);
  fs.mkdirSync(path.join(root, '.agent/skills/total-recall/plugins'), { recursive: true });
  fs.symlinkSync(source, path.join(root, '.agent/skills/total-recall/plugins/auth'));
  fs.mkdirSync(path.join(root, 'scripts'), { recursive: true });
  write(root, 'scaffold/.agent/skills/total-recall/plugins/auth/cli.mjs', 'cli-v1');
  write(root, 'scaffold/.agent/skills/total-recall/plugins/auth/old.mjs', 'gone');
  write(root, 'scaffold/.agent/skills/total-recall/plugins/auth/.gitignore', 'x');
});
afterEach(() => { fs.rmSync(root, { recursive: true, force: true }); fs.rmSync(source, { recursive: true, force: true }); });

describe('scaffold plugin release set', () => {
  it('excludes tests, node_modules and .gitignore (npm never ships it)', () => {
    for (const p of ['test/a.mjs', 'src/x.spec.mjs', 'src/y.test.js', 'vitest.config.mjs', '.gitignore', 'ui/.gitignore', 'node_modules/a/i.js']) expect(isReleaseFile(p)).toBe(false);
    for (const p of ['cli.mjs', 'src/routes/secrets.mjs', 'ui/home.js', 'README.md']) expect(isReleaseFile(p)).toBe(true);
  });
  it('uses the plugin package contents and adds the lockfile', () => {
    const files = releaseFiles(source, packed(['cli.mjs', 'src/new.mjs', 'package.json', 'test/a.spec.mjs']));
    expect(files).toEqual(['cli.mjs', 'package-lock.json', 'package.json', 'src/new.mjs']);
  });
  it('fails loudly when npm pack fails', () => {
    expect(() => releaseFiles(source, () => ({ status: 1, stderr: 'boom' }))).toThrow(/npm pack --dry-run failed.*boom/);
  });
  it('rejects packaged brain state, credentials and unsafe paths before copying', () => {
    for (const file of ['.agent/skills/total-recall/config/brain.json', 'config/secrets.enc', 'memory-vault/private.md', '.ssss/auth/state.md', '../sibling.mjs']) {
      expect(() => syncScaffoldPlugins({ root, ids: ['auth'], write: true, run: packed(['cli.mjs', file]) })).toThrow(/private brain state|unsafe path/);
      expect(fs.readFileSync(path.join(root, 'scaffold/.agent/skills/total-recall/plugins/auth/cli.mjs'), 'utf8')).toBe('cli-v1');
      expect(fs.existsSync(path.join(root, 'scripts/scaffold-plugins.json'))).toBe(false);
    }
  });
});

describe('syncScaffoldPlugins', () => {
  const run = packed(['cli.mjs', 'src/new.mjs', 'package.json', 'test/a.spec.mjs']);
  it('reports drift without writing in check mode', () => {
    const r = syncScaffoldPlugins({ root, ids: ['auth'], write: false, run });
    expect(r.changes).toEqual(expect.arrayContaining([
      { file: 'auth/cli.mjs', change: 'updated' },
      { file: 'auth/src/new.mjs', change: 'added' },
      { file: 'auth/old.mjs', change: 'removed' },
      { file: 'auth/.gitignore', change: 'removed' },
    ]));
    expect(fs.readFileSync(path.join(root, 'scaffold/.agent/skills/total-recall/plugins/auth/cli.mjs'), 'utf8')).toBe('cli-v1');
    expect(fs.existsSync(path.join(root, 'scripts/scaffold-plugins.json'))).toBe(false);
  });
  it('writes the copy and a pin that exactly matches it, then reports no drift', () => {
    syncScaffoldPlugins({ root, ids: ['auth'], write: true, run });
    const target = path.join(root, 'scaffold/.agent/skills/total-recall/plugins/auth');
    expect(fs.readFileSync(path.join(target, 'cli.mjs'), 'utf8')).toBe('cli-v2');
    expect(fs.existsSync(path.join(target, 'old.mjs'))).toBe(false);
    expect(fs.existsSync(path.join(target, '.gitignore'))).toBe(false);
    expect(fs.existsSync(path.join(target, 'test'))).toBe(false);
    const lock = JSON.parse(fs.readFileSync(path.join(root, 'scripts/scaffold-plugins.json'), 'utf8'));
    expect(Object.keys(lock)).toEqual(['auth/cli.mjs', 'auth/package-lock.json', 'auth/package.json', 'auth/src/new.mjs']);
    expect(syncScaffoldPlugins({ root, ids: ['auth'], write: false, run }).changes).toEqual([]);
  });

  it('reports a stale pin in check mode even when every copied file matches its source', () => {
    const ids = ['auth'];
    const stalePinRun = packed(['cli.mjs', 'src/new.mjs', 'package.json']);
    syncScaffoldPlugins({ root, ids, write: true, run: stalePinRun });
    expect(syncScaffoldPlugins({ root, ids, run: stalePinRun }).changes).toEqual([]);
    const lockFile = path.join(root, 'scripts/scaffold-plugins.json');
    const lock = JSON.parse(fs.readFileSync(lockFile, 'utf8'));
    lock[Object.keys(lock)[0]] = 'stale';
    fs.writeFileSync(lockFile, JSON.stringify(lock));
    expect(syncScaffoldPlugins({ root, ids, run: stalePinRun }).changes).toEqual([{ file: 'scripts/scaffold-plugins.json', change: 'stale pin' }]);
  });
});

describe('findOwnerRepos', () => {
  let parent;
  beforeEach(() => {
    parent = fs.mkdtempSync(path.join(os.tmpdir(), 'scaffold-owners-'));
    write(parent, 'tr-plugin-auth/plugin.json', '{"id":"auth"}');
    write(parent, 'tr-plugin-cli-agents/plugin.json', '{"id":"meta-harness"}');
    write(parent, 'not-a-plugin/README.md', 'x');
    write(parent, 'broken/plugin.json', '{ not json');
    write(parent, 'this-repo/plugin.json', '{"id":"this-repo"}');
  });
  afterEach(() => fs.rmSync(parent, { recursive: true, force: true }));

  it('finds a plugin by its manifest id, whatever its folder is called', () => {
    const owners = findOwnerRepos(path.join(parent, 'this-repo'));
    expect(owners.get('auth')).toBe(path.join(parent, 'tr-plugin-auth'));
    expect(owners.get('meta-harness')).toBe(path.join(parent, 'tr-plugin-cli-agents'));
  });
  it('skips the repository itself, folders without a plugin and unreadable manifests', () => {
    expect([...findOwnerRepos(path.join(parent, 'this-repo')).keys()].sort()).toEqual(['auth', 'meta-harness']);
  });
  it('finds nothing when no plugin repositories sit beside it', () => {
    const lonely = fs.mkdtempSync(path.join(os.tmpdir(), 'scaffold-lonely-'));
    fs.mkdirSync(path.join(lonely, 'only'));
    expect(findOwnerRepos(path.join(lonely, 'only')).size).toBe(0);
    fs.rmSync(lonely, { recursive: true, force: true });
  });
});

