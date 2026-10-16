import { describe, it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

function tracked() {
  try {
    return execFileSync('git', ['ls-files'], { cwd: ROOT, encoding: 'utf8' }).split('\n').filter(Boolean);
  } catch {
    return null; // not a git checkout (for example an installed package)
  }
}

describe('open-source repo hygiene', () => {
  it('commits no per-user memories, IDE projections or handoffs', () => {
    const files = tracked();
    if (!files) return;
    // Skills ARE repo content and belong in git: git does not descend into an
    // ignored directory, so a blanket `.agent/` rule left 11 skill directories
    // (~317 files) existing in no repository anywhere -- one disk failure from
    // being lost (commit 9e83665). What must stay out of an open-source package
    // is per-USER STATE, which is what actually leaks a person's machine:
    // memories, handoffs, and IDE projections. `.agent/skills/` is allowed;
    // everything else under those directories is not.
    const isSkillContent = (f) => /^\.agent\/skills\/[^/]+\//.test(f.replace(/^\.agents\//, '.agent/'));
    const forbidden = files.filter((f) => {
      const perUserDir = /^(\.agent|\.agents|\.claude|\.codex|\.cursor|\.windsurf)\//.test(f);
      if (perUserDir && !isSkillContent(f)) return true;
      if (/^HANDOFF\.md$/.test(f)) return true;
      if (/(^|\/)memory-(vault|inbox|derived)\/.*\.md$/.test(f) && !f.startsWith('scaffold/')) return true;
      return false;
    });
    expect(forbidden).toEqual([]);
  });

  it('ships only the generic bootstrap in scaffold/ (fixed allowlist, no personal markers)', () => {
    const files = tracked();
    if (!files) return;
    const scaffold = files.filter((f) => f.startsWith('scaffold/'));
    const skills = new Set(
      scaffold.map((f) => f.match(/^scaffold\/\.agent\/skills\/([^/]+)\//)?.[1]).filter(Boolean),
    );
    expect([...skills].sort()).toEqual([
      'decision',
      'meta-harness',
      'plugins',
      'project-management',
      'start',
      'total-recall',
    ]);
    const vault = scaffold
      .filter((f) => f.includes('/memory-vault/'))
      .map((f) => f.split('/memory-vault/')[1])
      .sort();
    expect(vault).toEqual([
      'concepts/cli-help-reference.md',
      'invariants/operating-instructions.md',
      'preferences/always-websearch-gap.md',
      'preferences/topic-research-sop.md',
    ]);
    // Personal/deployment leaks. The mesh rule targets a CONCRETE address
    // (for example 100.64.0.1 or 100.64.0.10) but NOT the documentation CIDR
    // `100.64.0.0/10` (RFC 6598), which legitimately appears in mesh
    // networking docs and validators, nor the `100.64.0.0/10` prefix comment.
    const meshHost = /100\.64\.0\.\d+(?!\d|\/)/;
    const personal = /festech|hedgehog|ultrachat|dabber|gmail\.com|\/Users\/[a-z]+\//i;
    const leaks = scaffold.filter((f) => {
      const text = readFileSync(path.join(ROOT, f), 'utf8');
      if (personal.test(text)) return true;
      // A concrete mesh host leaks; `100.64.0.0/10` and bare range mentions do not.
      return text.split('\n').some((line) => meshHost.test(line) && !/100\.64\.0\.0\/\d+/.test(line));
    });
    expect(leaks).toEqual([]);
  });
});
