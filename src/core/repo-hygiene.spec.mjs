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
  it('commits no per-user skills, commands, memories, IDE projections or handoffs', () => {
    const files = tracked();
    if (!files) return;
    const forbidden = files.filter((f) =>
      /^(\.agent|\.agents|\.claude|\.codex|\.cursor|\.windsurf)\//.test(f) ||
      /^HANDOFF\.md$/.test(f) ||
      /(^|\/)memory-(vault|inbox|derived)\/.*\.md$/.test(f) && !f.startsWith('scaffold/'),
    );
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
    const personal = /festech|hedgehog|ultrachat|dabber|gmail\.com|\/Users\/[a-z]+\/|100\.64\./i;
    const leaks = scaffold.filter((f) => personal.test(readFileSync(path.join(ROOT, f), 'utf8')));
    expect(leaks).toEqual([]);
  });
});
