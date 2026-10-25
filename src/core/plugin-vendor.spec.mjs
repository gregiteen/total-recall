import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { vendorPlugin, listBricks, satisfiesRange, PROVENANCE_FILE, BRICKS_FILE } from './plugin-vendor.mjs';

let root;
beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'vendor-spec-'));
  const src = path.join(root, 'tr-plugin-demo');
  fs.mkdirSync(path.join(src, 'src'), { recursive: true });
  fs.mkdirSync(path.join(src, 'node_modules', 'x'), { recursive: true });
  fs.writeFileSync(path.join(src, 'plugin.json'), JSON.stringify({ id: 'demo', version: '1.2.3' }));
  fs.writeFileSync(path.join(src, 'src', 'a.mjs'), 'export const a = 1;\n');
  fs.writeFileSync(path.join(src, 'node_modules', 'x', 'i.js'), 'x');
  fs.writeFileSync(path.join(src, '.secret'), 'nope');
});
afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

describe('vendorPlugin', () => {
  it('copies source files and records provenance', async () => {
    const result = await vendorPlugin('tr-plugin-demo', 'vendor/demo', { projectRoot: root });
    const dest = path.join(root, 'vendor', 'demo');
    expect(result.id).toBe('demo');
    expect(fs.readFileSync(path.join(dest, 'src', 'a.mjs'), 'utf8')).toBe('export const a = 1;\n');
    expect(fs.existsSync(path.join(dest, 'node_modules'))).toBe(false);
    expect(fs.existsSync(path.join(dest, '.secret'))).toBe(false);
    const prov = JSON.parse(fs.readFileSync(path.join(dest, PROVENANCE_FILE), 'utf8'));
    expect(prov).toMatchObject({ vendored_from: 'demo', version: '1.2.3', source: { kind: 'local' } });
    expect(prov.sha256).toMatch(/^[0-9a-f]{64}$/);
  });

  it('refuses a non-empty destination', async () => {
    const dest = path.join(root, 'out');
    fs.mkdirSync(dest);
    fs.writeFileSync(path.join(dest, 'keep.txt'), 'x');
    await expect(vendorPlugin('tr-plugin-demo', 'out', { projectRoot: root })).rejects.toThrow(/not empty/);
    expect(fs.readFileSync(path.join(dest, 'keep.txt'), 'utf8')).toBe('x');
  });

  it('fails on a missing source or manifest', async () => {
    await expect(vendorPlugin('nope-dir', 'o', { projectRoot: root })).rejects.toThrow(/No bundled plugin/);
    fs.mkdirSync(path.join(root, 'empty'));
    await expect(vendorPlugin('empty', 'o2', { projectRoot: root })).rejects.toThrow(/plugin.json/);
  });

  it('adds bricks to an existing project, tracks them and detects local edits', async () => {
    const second = path.join(root, 'tr-plugin-other');
    fs.mkdirSync(second);
    fs.writeFileSync(path.join(second, 'plugin.json'), JSON.stringify({ id: 'other', version: '0.1.0' }));
    fs.writeFileSync(path.join(second, 'package.json'), JSON.stringify({ dependencies: { zod: '^3.0.0' } }));
    await vendorPlugin('tr-plugin-demo', undefined, { projectRoot: root });
    const r2 = await vendorPlugin('tr-plugin-other', undefined, { projectRoot: root });
    expect(r2.dependencies).toEqual({ zod: '^3.0.0' });
    expect(fs.existsSync(path.join(root, 'bricks', 'demo', 'src', 'a.mjs'))).toBe(true);
    expect(JSON.parse(fs.readFileSync(path.join(root, BRICKS_FILE), 'utf8')).bricks.map((b) => b.id)).toEqual(['demo', 'other']);
    expect(listBricks(root).map((b) => b.status)).toEqual(['unchanged', 'unchanged']);
    fs.appendFileSync(path.join(root, 'bricks', 'demo', 'src', 'a.mjs'), '// mine\n');
    expect(listBricks(root).find((b) => b.id === 'demo').status).toBe('modified');
    await expect(vendorPlugin('tr-plugin-demo', undefined, { projectRoot: root })).rejects.toThrow(/already in this project/);
  });

  it('rejects a destination outside the project', async () => {
    await expect(vendorPlugin('tr-plugin-demo', '../escape', { projectRoot: root })).rejects.toThrow(/inside the project/);
  });
  it('rejects an in-project symlink that would write outside the project', async () => {
    const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'vendor-outside-'));
    try {
      fs.symlinkSync(outside, path.join(root, 'linked'), 'junction');
      await expect(vendorPlugin('tr-plugin-demo', 'linked/demo', { projectRoot: root })).rejects.toThrow(/symlink parent/);
      expect(fs.readdirSync(outside)).toEqual([]);
      expect(fs.existsSync(path.join(root, BRICKS_FILE))).toBe(false);
    } finally {
      fs.rmSync(outside, { recursive: true, force: true });
    }
  });

  describe('requires', () => {
    function mk(name, manifest) {
      const dir = path.join(root, `tr-plugin-${name}`);
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(path.join(dir, 'plugin.json'), JSON.stringify({ id: name, ...manifest }));
    }
    const opts = (extra = {}) => ({ projectRoot: root, ...extra });

    it('matches version ranges', () => {
      expect(satisfiesRange('1.2.3', '*')).toBe(true);
      expect(satisfiesRange('1.4.0', '^1.2.0')).toBe(true);
      expect(satisfiesRange('2.0.0', '^1.2.0')).toBe(false);
      expect(satisfiesRange('1.1.0', '>=1.2.0')).toBe(false);
      expect(satisfiesRange('1.2.3', '1.2.3')).toBe(true);
      expect(satisfiesRange('1.2.3', 'garbage')).toBe(false);
    });

    it('fails with the missing list and writes nothing', async () => {
      mk('base', { version: '1.0.0' });
      mk('top', { version: '1.0.0', requires: ['base', { id: 'extra', version: '^2.0.0' }] });
      await expect(vendorPlugin('tr-plugin-top', undefined, opts())).rejects.toThrow(/Missing required bricks: base@\*, extra@\^2\.0\.0/);
      expect(fs.existsSync(path.join(root, BRICKS_FILE))).toBe(false);
      expect(fs.existsSync(path.join(root, 'bricks'))).toBe(false);
    });

    it('accepts requirements that are already installed', async () => {
      mk('base', { version: '1.3.0' });
      mk('top', { version: '1.0.0', requires: [{ id: 'base', version: '^1.2.0' }] });
      await vendorPlugin('tr-plugin-base', undefined, opts());
      const r = await vendorPlugin('tr-plugin-top', undefined, opts());
      expect(r.requires).toEqual([{ id: 'base', range: '^1.2.0' }]);
      expect(listBricks(root).map((b) => b.id)).toEqual(['base', 'top']);
    });

    it('reports a version conflict with an installed brick', async () => {
      mk('base', { version: '2.0.0' });
      mk('top', { version: '1.0.0', requires: [{ id: 'base', version: '^1.0.0' }] });
      await vendorPlugin('tr-plugin-base', undefined, opts());
      await expect(vendorPlugin('tr-plugin-top', undefined, opts())).rejects.toThrow(/base needs \^1\.0\.0 but 2\.0\.0 is installed/);
      expect(listBricks(root).map((b) => b.id)).toEqual(['base']);
    });

    it('fails when automatic resolution cannot find a required brick and writes nothing', async () => {
      mk('top', { version: '1.0.0', requires: ['nowhere-to-be-found'] });
      await expect(vendorPlugin('tr-plugin-top', undefined, opts({ resolveRequires: true }))).rejects.toThrow(/No bundled plugin/);
      expect(fs.existsSync(path.join(root, BRICKS_FILE))).toBe(false);
    });

    it('rejects a malformed requires declaration', async () => {
      mk('top', { version: '1.0.0', requires: 'base' });
      await expect(vendorPlugin('tr-plugin-top', undefined, opts())).rejects.toThrow(/must be an array/);
    });
  });
});

describe('vendoring a capability as a brick', () => {
  it('copies capability code only and runs without Total Recall', async () => {
    const src = path.join(root, 'tr-plugin-pay');
    fs.mkdirSync(path.join(src, 'capability'), { recursive: true });
    fs.mkdirSync(path.join(src, 'ui'));
    fs.writeFileSync(path.join(src, 'plugin.json'), JSON.stringify({
      id: 'pay', name: 'Pay', version: '1.0.0', description: 'd',
      capability: { entry: 'capability/index.mjs', exports: ['charge'] },
      ui: { elements: [{ id: 'card', kind: 'card', tag: 'pay-card', module: 'ui/card.js' }] },
      cli: { command: 'pay', handler: './cli.mjs' }
    }));
    fs.writeFileSync(path.join(src, 'capability', 'index.mjs'), 'export const charge = (n) => n * 2;\n');
    fs.writeFileSync(path.join(src, 'ui', 'card.js'), 'spawn("total-recall status")');
    fs.writeFileSync(path.join(src, 'cli.mjs'), 'process.env.TOTAL_RECALL_BIN');
    fs.writeFileSync(path.join(src, 'package.json'), '{"name":"pay","version":"1.0.0","devDependencies":{"total-recall-brain":"^3"}}');
    fs.writeFileSync(path.join(src, 'README.md'), 'Run total-recall pay');

    const result = await vendorPlugin('tr-plugin-pay', undefined, { projectRoot: root });
    const dest = path.join(root, 'bricks', 'pay');
    expect(fs.existsSync(path.join(dest, 'ui'))).toBe(false);
    expect(fs.existsSync(path.join(dest, 'cli.mjs'))).toBe(false);
    const manifest = JSON.parse(fs.readFileSync(path.join(dest, 'plugin.json'), 'utf8'));
    expect(manifest).toMatchObject({ id: 'pay', brick: true });
    expect(manifest.ui).toBeUndefined();
    expect(manifest.cli).toBeUndefined();
    expect(result.files).toBe(3);
    expect(fs.existsSync(path.join(dest, 'README.md'))).toBe(false);

    // No file in the brick can reach Total Recall, and it works with the binary absent.
    for (const f of ['plugin.json', 'package.json', 'capability/index.mjs']) {
      expect(fs.readFileSync(path.join(dest, f), 'utf8')).not.toMatch(/total-recall|TOTAL_RECALL/i);
    }
    const run = execFileSync(process.execPath, ['--input-type=module', '-e',
      `import { charge } from ${JSON.stringify(pathToFileURL(path.join(dest, 'capability', 'index.mjs')).href)}; console.log(charge(2));`],
    { env: { PATH: '/nonexistent', TOTAL_RECALL_BIN: '/nonexistent' }, encoding: 'utf8' });
    expect(run.trim()).toBe('4');
    expect(listBricks(root)[0].status).toBe('unchanged');
  });
});
