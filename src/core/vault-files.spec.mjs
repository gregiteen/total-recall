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
