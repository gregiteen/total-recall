import { describe, it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
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
});
