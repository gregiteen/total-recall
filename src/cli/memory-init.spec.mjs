import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import init from './memory-init.mjs';

/**
 * `init --project` creates a brain and compiles its first surface. It derived
 * `instructionsFile` from the agent dir, which put it at
 * `<root>/.agent/INSTRUCTIONS.md` -- a directory no harness reads -- while the
 * repository root's `INSTRUCTIONS.md`, the file agents actually load, was never
 * written. This spec is the only coverage `memory-init.mjs` has.
 */
describe('memory-init writes a project surface at the repo root', () => {
  let root, cwd, previous;

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'tr-meminit-'));
    cwd = process.cwd();
    previous = process.env.AGENT_DIR;
    fs.writeFileSync(path.join(root, 'package.json'), '{"name":"fixture"}\n');
    process.chdir(root);
  });

  afterEach(() => {
    process.chdir(cwd);
    if (previous === undefined) delete process.env.AGENT_DIR;
    else process.env.AGENT_DIR = previous;
    fs.rmSync(root, { recursive: true, force: true });
  });

  it('places INSTRUCTIONS.md at the repo root, not inside .agent/', async () => {
    await init(['--project', '--yes']);

    const atRoot = path.join(root, 'INSTRUCTIONS.md');
    expect(fs.existsSync(atRoot), 'project surface belongs at the repo root').toBe(true);
    expect(fs.readFileSync(atRoot, 'utf8')).toContain('TOTAL RECALL');

    // The bug wrote the surface here instead; it must never return.
    expect(
      fs.existsSync(path.join(root, '.agent', 'INSTRUCTIONS.md')),
      'surface must not be buried in .agent/',
    ).toBe(false);

    // The brain itself still lives under .agent/, which is correct and distinct.
    expect(fs.existsSync(path.join(root, '.agent', 'skills', 'total-recall', 'memory-vault'))).toBe(true);
  });
});
