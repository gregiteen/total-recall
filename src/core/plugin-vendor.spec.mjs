import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { vendorPlugin, listBricks, PROVENANCE_FILE, BRICKS_FILE } from './plugin-vendor.mjs';

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
});
