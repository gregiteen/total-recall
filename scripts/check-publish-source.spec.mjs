import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { publishSourceProblem } from './check-publish-source.mjs';

const made = [];
afterEach(() => { for (const dir of made.splice(0)) fs.rmSync(dir, { recursive: true, force: true }); });
const root = () => { const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tr-publish-source-')); made.push(dir); return dir; };

describe('publishSourceProblem', () => {
  it('accepts a real checkout', () => {
    const dir = root();
    fs.mkdirSync(path.join(dir, '.git'));
    expect(publishSourceProblem(dir)).toBeNull();
  });
  it('refuses a linked worktree, where .git is a file and npm records no gitHead', () => {
    const dir = root();
    fs.writeFileSync(path.join(dir, '.git'), 'gitdir: /elsewhere/.git/worktrees/x\n');
    expect(publishSourceProblem(dir)).toMatch(/gitHead/);
  });
  it('refuses a folder that is not a checkout at all', () => {
    expect(publishSourceProblem(root())).toMatch(/no source commit/);
  });
});
