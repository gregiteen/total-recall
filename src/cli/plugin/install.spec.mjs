import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { installPlugin } from './install.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));

describe('install.mjs', () => {
  it('exports installPlugin function', () => {
    expect(installPlugin).toBeDefined();
    expect(typeof installPlugin).toBe('function');
  });

  it('compiles the layer it installed into instead of assuming a project brain', () => {
    // A bare `plugin install` from a directory with no project brain writes to
    // the global brain (projectPluginsDir(cwd) === globalPluginsDir() when cwd is
    // home) but used to request `layer: 'project'`, which threw and printed
    // "Auto-compile failed: No project brain found" after a SUCCESSFUL install.
    // The layer must be derived from whether a project brain actually resolves.
    const src = fs.readFileSync(path.join(here, 'install.mjs'), 'utf8');
    expect(src).toMatch(/resolveBrainDir\('project'\)/);
    expect(src).toMatch(/targetLayer = 'global'/);
    expect(src).toMatch(/autoCompileSurfaces\(\{ layer: targetLayer/);
    expect(src).not.toMatch(/autoCompileSurfaces\(\{ layer: isGlobal \? 'global' : 'project'/);
  });
});
