import { describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const REPO_ROOT = path.resolve(import.meta.dirname, '..', '..');

const PRIVATE_STATE_PATTERNS = [
  /browser-profile/,
  /secrets\.enc$/,
  /(^|\/)tr\.env$/,
  /(^|\/)sessions\//,
  /(^|\/)logs\//,
  /(^|\/)memory-derived\//,
  /(^|\/)\.snapshots\//,
  /(^|\/)\.events\//,
  /(^|\/)daemon\.pid$/,
  /^\.agent\/skills\/total-recall\/memory-vault\//,
];

describe('distribution pack hygiene (LR-4)', () => {
  it('keeps browser-profile out of the repository tree', () => {
    expect(fs.existsSync(path.join(REPO_ROOT, '.agent', 'skills', 'total-recall', 'browser-profile'))).toBe(false);
  });

  it('excludes all private-state paths from npm pack output', () => {
    const raw = execFileSync('npm', ['pack', '--dry-run', '--json'], { cwd: REPO_ROOT, encoding: 'utf8' });
    const parsed = JSON.parse(raw);
    const files = parsed[0]?.files || [];
    expect(files.length).toBeGreaterThan(0);
    const leaked = files
      .map(f => f.path)
      .filter(filePath => PRIVATE_STATE_PATTERNS.some(re => re.test(filePath)));
    expect(leaked).toEqual([]);
  });
});
