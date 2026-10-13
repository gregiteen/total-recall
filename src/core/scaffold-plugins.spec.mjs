import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { isReleaseFile, releaseFiles, syncScaffoldPlugins } from './scaffold-plugins.mjs';

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
  for (const [rel, body] of Object.entries({ 'cli.mjs': 'cli-v2', 'src/new.mjs': 'new', 'package.json': '{}', 'package-lock.json': '{}', '.gitignore': 'x', 'test/a.spec.mjs': 't' })) write(source, rel, body);
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
    for (const p of ['cli.mjs', 'src/routes/secrets.mjs', 'ui/card.js', 'README.md']) expect(isReleaseFile(p)).toBe(true);
  });
  it('uses the plugin package contents and adds the lockfile', () => {
    const files = releaseFiles(source, packed(['cli.mjs', 'src/new.mjs', 'package.json', 'test/a.spec.mjs']));
    expect(files).toEqual(['cli.mjs', 'package-lock.json', 'package.json', 'src/new.mjs']);
  });
  it('fails loudly when npm pack fails', () => {
    expect(() => releaseFiles(source, () => ({ status: 1, stderr: 'boom' }))).toThrow(/npm pack --dry-run failed.*boom/);
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
});
