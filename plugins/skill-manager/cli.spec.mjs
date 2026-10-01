import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { validateConfig, inspect } from './cli.mjs';

describe('daemon skill manager', () => {
  it('requires explicit roots, scope, node and apply policy', () => {
    expect(() => validateConfig({})).toThrow('node');
    expect(() => validateConfig({ node: 'build-box', maxTokens: 900, roots: [] })).toThrow('autoApply');
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'tr-manager-'));
    try {
      expect(() => validateConfig({ node: 'build-box', autoApply: false, maxTokens: 900, roots: [{ path: root, scope: 'repository', repoRoot: os.tmpdir() + '/different' }] })).toThrow();
      expect(validateConfig({ node: 'build-box', autoApply: false, maxTokens: 900, roots: [{ path: root, scope: 'global' }] }).roots[0].path).toBe(fs.realpathSync(root));
    } finally { fs.rmSync(root, { recursive: true }); }
  });

  it('invalidates cache for support changes and changed apply policy', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'tr-manager-'));
    const dir = path.join(root, 'sample');
    fs.mkdirSync(dir);
    fs.writeFileSync(path.join(dir, 'SKILL.md'), 'sample');
    fs.writeFileSync(path.join(dir, 'reference.md'), 'Always preserve ownership');
    let calls = 0;
    const api = { skillDirectories: () => [dir], optimizeSkills: (_, options) => { calls++; return [{ path: dir, status: options.apply ? 'applied' : 'candidate' }]; } };
    const config = { node: 'box', roots: [{ path: root, scope: 'global' }], maxTokens: 900, autoApply: true };
    try {
      const first = await inspect(config, null, api);
      const second = await inspect(config, first, api);
      expect(calls).toBe(1);
      expect(second.results[0].cached).toBe(true);
      fs.writeFileSync(path.join(dir, 'reference.md'), 'Never edit foreign repositories');
      const third = await inspect(config, second, api);
      expect(calls).toBe(2);
      await inspect(config, third, api, { apply: true });
      expect(calls).toBe(3);
      fs.symlinkSync(path.join(dir, 'reference.md'), path.join(dir, 'escaped.md'));
      expect((await inspect(config, third, api)).counts.error).toBe(1);
    } finally { fs.rmSync(root, { recursive: true }); }
  });
});
