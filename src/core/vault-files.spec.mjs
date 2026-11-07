// @vitest-environment node
import { it, expect } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { atomicWrite, isSafeVaultName } from './vault-files.mjs';
it('retains traversal rejection and legitimate dotted names', () => {
  expect(isSafeVaultName('example.com')).toBe(true);
  for (const value of ['../secret', '.hidden', 'a..b', 'x/y', 'x\\y', '-flag']) expect(isSafeVaultName(value)).toBe(false);
});
it('replaces a file atomically without a leftover temporary file', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vault-files-'));
  try { const file = path.join(dir, 'node.md'); atomicWrite(file, 'first'); atomicWrite(file, 'second');
    expect(fs.readFileSync(file, 'utf8')).toBe('second'); expect(fs.readdirSync(dir)).toEqual(['node.md']);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
it('removes its temporary file when the rename fails', () => {
  // A compiled CLAUDE.md left as CLAUDE.md.tmp.<pid> is untracked and unignored, so the next
  // commit of everything in a public repository would publish private instructions.
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vault-files-'));
  try {
    const target = path.join(dir, 'CLAUDE.md');
    fs.mkdirSync(path.join(target, 'occupied'), { recursive: true });
    expect(() => atomicWrite(target, 'private instructions')).toThrow();
    expect(fs.readdirSync(dir)).toEqual(['CLAUDE.md']);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
