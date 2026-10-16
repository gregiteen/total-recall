import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { autoCompileSurfaces } from './auto-compile.mjs';

/**
 * `autoCompileSurfaces` runs on every rule edit, plugin install and plugin
 * removal, so it is the highest-traffic surface writer. It previously built
 * `instructionsFile` from `resolveAgentDir()`, which is the brain's directory
 * (`<repo>/.agent`) rather than the workspace root, so a project's rules were
 * written to `<repo>/.agent/INSTRUCTIONS.md` while harnesses read
 * `<repo>/INSTRUCTIONS.md`. The call still reported success.
 */
describe('autoCompileSurfaces writes the surface where the harness reads it', () => {
  let root, previous;

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'tr-autocompile-'));
    previous = process.env._TR_TEST_AGENT_DIR;
    delete process.env._TR_TEST_AGENT_DIR;
    delete process.env.AGENT_DIR;
    const brainDir = path.join(root, '.agent', 'skills', 'total-recall');
    fs.mkdirSync(path.join(brainDir, 'memory-vault', 'invariants'), { recursive: true });
    fs.mkdirSync(path.join(brainDir, 'memory-derived'), { recursive: true });
    fs.writeFileSync(path.join(brainDir, 'SKILL.md'), '# Project brain\n');
    fs.writeFileSync(
      path.join(brainDir, 'memory-vault', 'invariants', 'rule-a.md'),
      [
        '---',
        'type: memory',
        'slug: rule-a',
        'category: invariants',
        'title: Always do the thing',
        'project: auto-compile-fixture',
        'status: active',
        'confidence: 1',
        'importance: 5',
        'modality: must',
        'subject: system',
        'predicate: remembers_fact',
        'object: brain',
        'schema_version: 2',
        '---',
        'Always do the thing, without exception.',
        '',
      ].join('\n'),
    );
  });

  afterEach(() => {
    if (previous === undefined) delete process.env._TR_TEST_AGENT_DIR;
    else process.env._TR_TEST_AGENT_DIR = previous;
    fs.rmSync(root, { recursive: true, force: true });
  });

  it('writes a project surface at the repo root, never inside .agent/', async () => {
    const cwd = process.cwd();
    process.chdir(root);
    try {
      const ok = await autoCompileSurfaces({ layer: 'project', semantic: false, force: true, silent: true });
      expect(ok).toBe(true);
    } finally {
      process.chdir(cwd);
    }

    // The contract this pins is PLACEMENT: the surface must be the file the
    // harness reads. What is rendered into it (rule selection, budget) is a
    // separate concern with its own tests.
    const atRoot = path.join(root, 'INSTRUCTIONS.md');
    expect(fs.existsSync(atRoot), 'project surface should be at the repo root').toBe(true);
    expect(fs.readFileSync(atRoot, 'utf8')).toContain('TOTAL RECALL');

    // The bug wrote it here instead. It must never return.
    expect(
      fs.existsSync(path.join(root, '.agent', 'INSTRUCTIONS.md')),
      'surface must not be buried in .agent/',
    ).toBe(false);
  });
});
