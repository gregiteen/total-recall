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

  it('installs only into the shared folder and compiles the shared layer', () => {
    // Nothing is installed per repository: --project is refused and the shared
    // (global) layer is the one compiled after an install.
    const src = fs.readFileSync(path.join(here, 'install.mjs'), 'utf8');
    expect(src).toMatch(/args\.includes\('--project'\)/);
    expect(src).toMatch(/autoCompileSurfaces\(\{ layer: 'global'/);
    expect(src).not.toMatch(/layer: 'project'/);
  });
});
