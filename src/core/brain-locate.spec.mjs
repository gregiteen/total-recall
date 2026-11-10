import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import os from 'node:os';
import { detectProjectBrain as located, isPackageScaffold } from './brain-locate.mjs';
import { detectProjectBrain as configured } from './local-config.mjs';

describe('brain-locate', () => {
  it('imports nothing but Node, because the gate runs it on tool calls', () => {
    const source = fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), 'brain-locate.mjs'), 'utf8');
    const imports = [...source.matchAll(/^import .* from '([^']+)';$/gm)].map((match) => match[1]);
    expect(imports.length).toBeGreaterThan(0);
    expect(imports.every((name) => name.startsWith('node:'))).toBe(true);
  });
  it('is the one implementation the config module also exports', () => {
    expect(configured).toBe(located);
  });
});

describe('the package scaffold is never a project', () => {
  const brainIn = (dir) => {
    fs.mkdirSync(path.join(dir, '.agent', 'skills', 'total-recall'), { recursive: true });
    fs.writeFileSync(path.join(dir, '.agent', 'skills', 'total-recall', 'SKILL.md'), '---\nname: total-recall\n---\n');
  };
  const withoutTestDirs = (fn) => {
    const saved = { a: process.env.AGENT_DIR, b: process.env._TR_TEST_AGENT_DIR };
    delete process.env.AGENT_DIR; delete process.env._TR_TEST_AGENT_DIR;
    try { return fn(); } finally {
      if (saved.a !== undefined) process.env.AGENT_DIR = saved.a;
      if (saved.b !== undefined) process.env._TR_TEST_AGENT_DIR = saved.b;
    }
  };

  it('stops at <package>/scaffold, in a checkout or in node_modules', () => {
    const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'tr-scaffold-')));
    const pkg = path.join(root, 'node_modules', 'total-recall-brain');
    fs.mkdirSync(pkg, { recursive: true });
    fs.writeFileSync(path.join(pkg, 'package.json'), JSON.stringify({ name: 'total-recall-brain' }));
    brainIn(path.join(pkg, 'scaffold'));
    const inside = path.join(pkg, 'scaffold', '.agent', 'skills', 'total-recall', 'plugins');
    fs.mkdirSync(inside, { recursive: true });
    expect(isPackageScaffold(path.join(pkg, 'scaffold'))).toBe(true);
    expect(withoutTestDirs(() => located(inside))).toBeNull();
    // The consuming project above it is still found.
    brainIn(root);
    expect(withoutTestDirs(() => located(inside))?.projectRoot).toBe(root);
    fs.rmSync(root, { recursive: true, force: true });
  });

  it('treats a folder named scaffold in another package as an ordinary folder', () => {
    const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'tr-scaffold-')));
    fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify({ name: 'some-app' }));
    brainIn(path.join(root, 'scaffold'));
    expect(isPackageScaffold(path.join(root, 'scaffold'))).toBe(false);
    expect(withoutTestDirs(() => located(path.join(root, 'scaffold')))?.projectRoot).toBe(path.join(root, 'scaffold'));
    fs.rmSync(root, { recursive: true, force: true });
  });
});
