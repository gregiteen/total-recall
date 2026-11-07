import { describe, it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

// The names this repository must never contain are private, so a check here cannot spell them.
// They live in the private projects repo. A public clone has no list, and the check shows as skipped.
const NAMES_FILE = path.join(ROOT, 'docs/projects/public-repo-forbidden-names.txt');
const forbiddenNames = existsSync(NAMES_FILE)
  ? readFileSync(NAMES_FILE, 'utf8').split('\n').map((line) => line.trim()).filter((line) => line && !line.startsWith('#'))
  : [];
const named = forbiddenNames.length
  ? new RegExp(forbiddenNames.map((name) => name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|'), 'i')
  : null;

function tracked() {
  try {
    return execFileSync('git', ['ls-files'], { cwd: ROOT, encoding: 'utf8' }).split('\n').filter(Boolean);
  } catch {
    return null; // not a git checkout (for example an installed package)
  }
}

describe('open-source repo hygiene', () => {
  it('commits no per-user memories or IDE projections', () => {
    const files = tracked();
    if (!files) return;
    // Per-user state leaks a person's machine, and skills live in a private
    // repository. The gate config is the only file allowed under these directories,
    // because the code-quality plugin reads it from this fixed path.
    const isGateConfig = (f) => /^\.agent\/skills\/code-quality\/(config\.json|\.gitignore)$/.test(f);
    const forbidden = files.filter((f) => {
      const perUserDir = /^(\.agent|\.agents|\.claude|\.codex|\.cursor|\.windsurf)\//.test(f);
      if (perUserDir && !isGateConfig(f)) return true;
      if (/(^|\/)memory-(vault|inbox|derived)\/.*\.md$/.test(f) && !f.startsWith('scaffold/')) return true;
      return false;
    });
    expect(forbidden).toEqual([]);
  });

  it('publishes no internal project records or one-off scripts', () => {
    const files = tracked();
    if (!files) return;
    const internal = files.filter((f) => /^docs\/projects\//.test(f)
      || /^(HANDOFF|MEMORY|AGENTS|CLAUDE|GEMINI)\.md$/.test(f)
      || /^(scratch|\.github\/disabled-workflows)\//.test(f)
      || /(^|\/)[^/]*(PROJECT_TRACKER|_AUDIT|DEVELOPMENT_PLAN)[^/]*\.md$/.test(f) && !f.startsWith('scaffold/'));
    expect(internal).toEqual([]);
    const rootScripts = files.filter((f) => !f.includes('/') && /^(fix|test|debug|patch|clean|run-|sim|tmp|temp)[-_.]?.*\.(c?js|mjs|sh|txt)$/.test(f));
    expect(rootScripts).toEqual([]);
    expect(files.filter((f) => !f.includes('/') && f.endsWith('.log'))).toEqual([]);
  });

  it.skipIf(!named)('names no private product or personal path in any tracked file', () => {
    const files = tracked();
    if (!files) return;
    const leaks = files.filter((f) => {
      if (f.includes('/vendor/') || f.startsWith('frontend/dist/')) return false;
      if (!existsSync(path.join(ROOT, f))) return false;
      return named.test(readFileSync(path.join(ROOT, f), 'utf8'));
    });
    expect(leaks).toEqual([]);
  });

  it('ships only the generic bootstrap in scaffold/ (fixed allowlist, no personal markers)', () => {
    const files = tracked();
    if (!files) return;
    const scaffold = files.filter((f) => f.startsWith('scaffold/'));
    const skills = new Set(
      scaffold.map((f) => f.match(/^scaffold\/\.agent\/skills\/([^/]+)\//)?.[1]).filter(Boolean),
    );
    // The authoring skill directory is `plugin` (singular), matching the live
    // `.agents/skills/plugin` tree. The former `plugins` directory was removed
    // in aee2ad0; this allowlist was not updated with it.
    // Plugin-owned skills ship from their owners, never from a second scaffold copy.
    expect([...skills].sort()).toEqual([
      'plugin',
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
    // Bundled third-party vendor artifacts (e.g. openwiki/vendor) are exempt from
    // the generic personal filter to prevent false positives on third-party author
    // license notices and REST endpoint paths like /users/me/.
    const meshHost = /100\.64\.0\.\d+(?!\d|\/)/;
    const personal = /gmail\.com|\/Users\/[a-z]+\//i;
    const leaks = scaffold.filter((f) => {
      if (f.includes('/vendor/')) return false;
      // A tracked file deleted in the working tree has no content to scan.
      if (!existsSync(path.join(ROOT, f))) return false;
      const text = readFileSync(path.join(ROOT, f), 'utf8');
      if (personal.test(text)) return true;
      // A concrete mesh host leaks; `100.64.0.0/10` and bare range mentions do not.
      return text.split('\n').some((line) => meshHost.test(line) && !/100\.64\.0\.0\/\d+/.test(line));
    });
    expect(leaks).toEqual([]);
  });
});
