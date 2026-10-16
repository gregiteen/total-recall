import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { preparePluginDependencies } from './plugin-dependencies.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '..', '..');

function tempPlugin(deps) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tr-plugindeps-'));
  fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ name: 'tr-plugin-fixture', version: '1.0.0', dependencies: deps }));
  return dir;
}

describe('preparePluginDependencies', () => {
  it('links a host dependency into the plugin without downloading it', () => {
    const dir = tempPlugin({ express: '^5.2.1' });
    preparePluginDependencies(dir);
    const linked = path.join(dir, 'node_modules', 'express');
    expect(fs.existsSync(linked)).toBe(true);
    // A symlink to the host copy, not a fresh install.
    expect(fs.lstatSync(linked).isSymbolicLink()).toBe(true);
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('is idempotent when the dependency is already wired', () => {
    const dir = tempPlugin({ express: '^5.2.1' });
    preparePluginDependencies(dir);
    expect(() => preparePluginDependencies(dir)).not.toThrow();
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('rejects a dependency the host cannot satisfy', () => {
    const dir = tempPlugin({ 'definitely-not-a-real-package-xyz': '^1.0.0' });
    // A dependency absent from the host surfaces as a module-resolution failure,
    // which is the intended fail-closed behavior.
    expect(() => preparePluginDependencies(dir)).toThrow(/Cannot find module|unavailable/);
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('every scaffold plugin that declares deps gets them wired by init', () => {
    // init used to prepare only auth, so mesh shipped without express and every
    // plugin command in that scope died on an unrelated missing import.
    const src = fs.readFileSync(path.join(repoRoot, 'src', 'cli', 'init.mjs'), 'utf8');
    expect(src).toMatch(/installedPluginsDir/);
    expect(src).toMatch(/preparePluginDependencies\(target\)/);
    // The wiring must run after the skill tree is copied into the brain.
    const copyIdx = src.indexOf('copyDirMerge(skillSrc, skillDest');
    const wireIdx = src.indexOf('preparePluginDependencies(target)');
    expect(copyIdx).toBeGreaterThan(-1);
    expect(wireIdx).toBeGreaterThan(copyIdx);

    // Every dependency declared by a scaffold plugin must actually be wired by
    // preparePluginDependencies, or init would throw for every user. Verify by
    // running it against a throwaway copy rather than resolving by hand.
    const scaffoldPlugins = path.join(repoRoot, 'scaffold', '.agent', 'skills', 'total-recall', 'plugins');
    for (const id of fs.readdirSync(scaffoldPlugins)) {
      const source = path.join(scaffoldPlugins, id);
      const pkgPath = path.join(source, 'package.json');
      if (!fs.existsSync(pkgPath)) continue;
      const deps = JSON.parse(fs.readFileSync(pkgPath, 'utf8')).dependencies || {};
      if (Object.keys(deps).length === 0) continue;
      const dir = tempPlugin(deps);
      expect(() => preparePluginDependencies(dir), `${id} declares unwireable deps`).not.toThrow();
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});
