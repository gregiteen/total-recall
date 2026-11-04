import { describe, it, expect, afterEach, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { syncChangedFiles } from './invoke-durability.mjs';

const roots = [];
afterEach(() => { vi.restoreAllMocks(); for (const dir of roots.splice(0)) fs.rmSync(dir, { recursive: true, force: true }); });
const tree = () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'invoke-durability-'));
  roots.push(dir);
  fs.mkdirSync(path.join(dir, 'facts'));
  return dir;
};

describe('syncChangedFiles', () => {
  it('flushes changed files and their directories, and skips old files', () => {
    const dir = tree();
    const old = path.join(dir, 'facts', 'old.md');
    fs.writeFileSync(old, 'old');
    const past = new Date(Date.now() - 3600000);
    fs.utimesSync(old, past, past);
    fs.writeFileSync(path.join(dir, 'facts', 'new.md'), 'new');
    const fsync = vi.spyOn(fs, 'fsyncSync');
    expect(syncChangedFiles([dir], Date.now())).toBe(1);
    // The new file, its directory and the root.
    expect(fsync).toHaveBeenCalledTimes(3);
  });
  it('tolerates a missing root and reports nothing changed', () => {
    expect(syncChangedFiles([path.join(os.tmpdir(), 'invoke-durability-missing')], Date.now())).toBe(0);
  });
  it('surfaces a failed flush instead of reporting success', () => {
    const dir = tree();
    fs.writeFileSync(path.join(dir, 'facts', 'new.md'), 'new');
    vi.spyOn(fs, 'fsyncSync').mockImplementation(() => { throw new Error('disk failed'); });
    expect(() => syncChangedFiles([dir], Date.now())).toThrow('disk failed');
  });
});
