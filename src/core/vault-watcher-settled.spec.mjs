import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { snapshotSignatures, isSettledEvent } from './vault-watcher.mjs';

describe('vault-watcher settled events', () => {
  let dir;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tr-vault-watch-'));
  });

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('ignores an event for a file unchanged since the recompile finished', () => {
    fs.writeFileSync(path.join(dir, 'a.md'), 'one');
    const snapshot = snapshotSignatures(dir);
    expect(isSettledEvent(dir, 'a.md', snapshot)).toBe(true);
  });

  it('reacts when the file was edited after the snapshot', () => {
    const file = path.join(dir, 'a.md');
    fs.writeFileSync(file, 'one');
    const snapshot = snapshotSignatures(dir);
    fs.writeFileSync(file, 'one and more');
    expect(isSettledEvent(dir, 'a.md', snapshot)).toBe(false);
  });

  it('reacts to a file the snapshot has never seen and to a deleted one', () => {
    fs.writeFileSync(path.join(dir, 'a.md'), 'one');
    const snapshot = snapshotSignatures(dir);
    fs.writeFileSync(path.join(dir, 'b.md'), 'new');
    expect(isSettledEvent(dir, 'b.md', snapshot)).toBe(false);
    fs.rmSync(path.join(dir, 'a.md'));
    expect(isSettledEvent(dir, 'a.md', snapshot)).toBe(false);
  });

  it('ignores non-markdown files in the snapshot', () => {
    fs.writeFileSync(path.join(dir, 'x.json'), '{}');
    expect(snapshotSignatures(dir).size).toBe(0);
  });
});
