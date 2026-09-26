// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import path from 'path';
import os from 'os';
import fs from 'fs';

import { writeFileSecure, appendFileSecure, chmodSecure, SECRET_FILE_MODE } from './secure-file.mjs';

const modeOf = (p) => fs.statSync(p).mode & 0o777;

describe('secure-file', () => {
  let tempDir;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'secure-file-test-'));
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('demonstrates the fs.writeFileSync bug this module exists to fix', () => {
    // Baseline: prove `mode` really is ignored when the file already exists,
    // so this suite fails loudly if Node ever changes that behavior.
    const p = path.join(tempDir, 'baseline.yml');
    fs.writeFileSync(p, 'a', { mode: 0o644 });
    expect(modeOf(p)).toBe(0o644);

    fs.writeFileSync(p, 'b', { mode: 0o600 });
    expect(modeOf(p)).toBe(0o644); // <- silently still world-readable
  });

  it('writeFileSecure creates a new file at 0600', () => {
    const p = path.join(tempDir, 'new.yml');
    writeFileSecure(p, 'password_hash: $2b$12$abc\n');
    expect(modeOf(p)).toBe(0o600);
    expect(fs.readFileSync(p, 'utf8')).toBe('password_hash: $2b$12$abc\n');
  });

  it('writeFileSecure tightens an existing world-readable file', () => {
    const p = path.join(tempDir, 'security.yml');
    fs.writeFileSync(p, 'old', { mode: 0o644 });
    expect(modeOf(p)).toBe(0o644);

    writeFileSecure(p, 'password_hash: $2b$12$abc\n', { encoding: 'utf8', mode: 0o600 });

    expect(modeOf(p)).toBe(0o600);
    expect(fs.readFileSync(p, 'utf8')).toBe('password_hash: $2b$12$abc\n');
  });

  it('tightens an existing file before writing new credential data', () => {
    const p = path.join(tempDir, 'security-before-write.yml');
    fs.writeFileSync(p, 'old', { mode: 0o644 });
    const originalWrite = fs.writeFileSync.bind(fs);
    let modeDuringWrite;
    const writeSpy = vi.spyOn(fs, 'writeFileSync').mockImplementation((target, ...args) => {
      if (target === p) modeDuringWrite = modeOf(p);
      return originalWrite(target, ...args);
    });

    try {
      writeFileSecure(p, 'new');
    } finally {
      writeSpy.mockRestore();
    }

    expect(modeDuringWrite).toBe(0o600);
    expect(modeOf(p)).toBe(0o600);
  });

  it('writeFileSecure defaults to 0600 when no mode is passed', () => {
    const p = path.join(tempDir, 'defaulted.yml');
    fs.writeFileSync(p, 'old', { mode: 0o666 });
    writeFileSecure(p, 'new');
    expect(modeOf(p)).toBe(SECRET_FILE_MODE);
  });

  it('writeFileSecure honors an explicit non-default mode', () => {
    const p = path.join(tempDir, 'readonly.yml');
    fs.writeFileSync(p, 'old', { mode: 0o644 });
    writeFileSecure(p, 'new', { mode: 0o400 });
    expect(modeOf(p)).toBe(0o400);
  });

  it('appendFileSecure tightens an existing world-readable log', () => {
    const p = path.join(tempDir, 'audit.jsonl');
    fs.writeFileSync(p, '{"a":1}\n', { mode: 0o644 });

    appendFileSecure(p, '{"a":2}\n', { mode: 0o600 });

    expect(modeOf(p)).toBe(0o600);
    expect(fs.readFileSync(p, 'utf8')).toBe('{"a":1}\n{"a":2}\n');
  });

  it('chmodSecure returns false instead of throwing on a missing path', () => {
    expect(chmodSecure(path.join(tempDir, 'does-not-exist'))).toBe(false);
  });
});
