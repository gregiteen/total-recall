import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { isBrainState, rsyncExcludes, findBrainState, BRAIN_STATE } from './brain-state.mjs';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

describe('isBrainState', () => {
  // Each of these actually shipped or clobbered something. They are the
  // regression set, not illustrative examples.
  it('classifies the files that caused real incidents', () => {
    expect(isBrainState('skills-registry/index.yaml')).toBe(true); // 3.25.0: shipped 562 personal paths
    expect(isBrainState('research-queue.jsonl')).toBe(true); // 3.25.2: shipped queued topics
    expect(isBrainState('config/secrets.enc')).toBe(true);
    expect(isBrainState('memory-vault/facts/x.md')).toBe(true);
    expect(isBrainState('derived/embeddings.db')).toBe(true); // legacy scaffold state
    expect(isBrainState('embeddings.db')).toBe(true);
  });

  it('treats real templates as templates', () => {
    expect(isBrainState('SKILL.md')).toBe(false);
    expect(isBrainState('references/cli-reference.md')).toBe(false);
    expect(isBrainState('scripts/sync-repo.mjs')).toBe(false);
    expect(isBrainState('subagents/total-recall-diagnostician.md')).toBe(false);
  });

  it('matches a state directory at ANY depth, not just the first segment', () => {
    // Checking only the leading segment is how nested state slipped through.
    expect(isBrainState('a/b/skills-registry/index.yaml')).toBe(true);
    expect(isBrainState('modules/agents/logs/run.txt')).toBe(true);
  });

  it('matches by extension so new secret/backup files are covered on arrival', () => {
    expect(isBrainState('anything.enc')).toBe(true);
    expect(isBrainState('deep/dir/whatever.backup')).toBe(true);
    expect(isBrainState('x.log')).toBe(true);
  });

  it('handles empty and odd input without throwing', () => {
    expect(isBrainState('')).toBe(false);
    expect(isBrainState(undefined)).toBe(false);
  });
});

describe('rsyncExcludes', () => {
  it('emits directory, file and glob forms for every manifest entry', () => {
    const ex = rsyncExcludes();
    expect(ex).toContain('memory-vault/');
    expect(ex).toContain('skills-registry/');
    expect(ex).toContain('research-queue.jsonl');
    expect(ex).toContain('*.enc');
    expect(ex.length).toBe(
      BRAIN_STATE.dirs.size + BRAIN_STATE.files.size + BRAIN_STATE.extensions.size,
    );
  });
});

describe('findBrainState', () => {
  let dir;
  beforeEach(() => { dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tr-state-')); });
  afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

  it('reports state hiding in a template tree and ignores real templates', () => {
    fs.mkdirSync(path.join(dir, 'references'), { recursive: true });
    fs.mkdirSync(path.join(dir, 'skills-registry'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'SKILL.md'), '#');
    fs.writeFileSync(path.join(dir, 'references/cli.md'), '#');
    fs.writeFileSync(path.join(dir, 'skills-registry/index.yaml'), 'skills: {}');
    fs.writeFileSync(path.join(dir, 'research-queue.jsonl'), '{}');

    const found = findBrainState(dir);
    expect(found).toContain('skills-registry');
    expect(found).toContain('research-queue.jsonl');
    expect(found).not.toContain('SKILL.md');
  });

  it('returns empty for a missing root rather than throwing', () => {
    expect(findBrainState(path.join(dir, 'nope'))).toEqual([]);
  });
});

describe('the shipped scaffold', () => {
  it('carries no per-brain state (the release gate, asserted in-suite)', () => {
    // The gate checks curated seeds and hash-pinned bundled owner source.
    // Installed plugins remain per-brain state and must never be overwritten.
    expect(isBrainState('plugins/installed/config/secrets.enc')).toBe(true);
    const output = execFileSync(process.execPath, [path.join(REPO, 'scripts/check-scaffold-state.mjs')], { cwd: REPO, encoding: 'utf8' });
    expect(output).toContain('carries no per-brain state');
  });

  it('ships a brain-state manifest identical to the canonical one', () => {
    // sync-repo REFUSES to run without it, so a drifted copy is as dangerous
    // as a missing one.
    const canonical = fs.readFileSync(path.join(REPO, 'src/core/brain-state.json'), 'utf8');
    const shipped = fs.readFileSync(
      path.join(REPO, 'scaffold/.agent/skills/total-recall/scripts/brain-state.json'),
      'utf8',
    );
    expect(shipped).toBe(canonical);
  });

  it('the gate script exits non-zero when state is present', () => {
    const fake = fs.mkdtempSync(path.join(os.tmpdir(), 'tr-gate-'));
    try {
      for (const relative of ['scripts/check-scaffold-state.mjs', 'scripts/scaffold-plugins.json', 'src/core/brain-state.mjs', 'src/core/brain-state.json', 'package.json']) {
        const destination = path.join(fake, relative);
        fs.mkdirSync(path.dirname(destination), { recursive: true });
        fs.copyFileSync(path.join(REPO, relative), destination);
      }
      const brain = path.join(fake, 'scaffold/.agent/skills/total-recall');
      fs.mkdirSync(path.join(brain, 'scripts'), { recursive: true });
      fs.copyFileSync(path.join(REPO, 'src/core/brain-state.json'), path.join(brain, 'scripts/brain-state.json'));
      fs.cpSync(path.join(REPO, 'scaffold/.agent/skills/total-recall/plugins'), path.join(brain, 'plugins'), { recursive: true });
      const run = () => execFileSync(process.execPath, [path.join(fake, 'scripts/check-scaffold-state.mjs')], { cwd: fake, encoding: 'utf8', stdio: 'pipe' });
      expect(run()).toContain('carries no per-brain state');
      fs.mkdirSync(path.join(brain, 'derived'));
      fs.writeFileSync(path.join(brain, 'derived/embeddings.db'), 'fixture');
      expect(run).toThrow();
      fs.rmSync(path.join(brain, 'derived'), { recursive: true });
      const source = path.join(brain, 'plugins/auth/plugin.json');
      const original = fs.readFileSync(source);
      fs.appendFileSync(source, '\n');
      expect(run).toThrow();
      fs.writeFileSync(source, original);
      fs.writeFileSync(path.join(brain, 'plugins/auth/leaked.enc'), 'fixture');
      expect(run).toThrow();
    } finally {
      fs.rmSync(fake, { recursive: true, force: true });
    }
  });
});
