// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import path from 'path';
import os from 'os';
import fs from 'fs';

vi.mock('./logger.mjs', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

vi.mock('./vault.mjs', () => ({
  atomicWrite: vi.fn((filePath, content) => {
    // Delegate to real fs for temp-dir tests
    fs.writeFileSync(filePath, content);
  }),
}));

describe('AppendLog', () => {
  let AppendLog, compactAppendLogs;
  let tempDir;

  beforeEach(async () => {
    vi.resetModules();
    const mod = await import('./append-log.mjs');
    AppendLog = mod.AppendLog;
    compactAppendLogs = mod.compactAppendLogs;
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'append-log-test-'));
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  it('starts empty when file does not exist', () => {
    const log = new AppendLog(path.join(tempDir, 'nonexistent.jsonl'));
    expect(log.size).toBe(0);
    expect(log.toObject()).toEqual({});
  });

  it('append stores an entry and retrieves it by key', () => {
    const log = new AppendLog(path.join(tempDir, 'test.jsonl'));
    log.append('key1', { value: 'hello', score: 42 });
    expect(log.size).toBe(1);
    expect(log.get('key1')).toMatchObject({ value: 'hello', score: 42 });
  });

  it('last-write-wins: later append for same key shadows earlier', () => {
    const log = new AppendLog(path.join(tempDir, 'lww.jsonl'));
    log.append('k', { v: 1 });
    log.append('k', { v: 2 });
    expect(log.size).toBe(1);
    expect(log.get('k').v).toBe(2);
  });

  it('remove writes a tombstone and removes from cache', () => {
    const log = new AppendLog(path.join(tempDir, 'tomb.jsonl'));
    log.append('k', { v: 1 });
    log.remove('k');
    expect(log.size).toBe(0);
    expect(log.get('k')).toBeNull();
  });

  it('persists to disk (new instance reads same file)', () => {
    const filePath = path.join(tempDir, 'persist.jsonl');
    const log1 = new AppendLog(filePath);
    log1.append('foo', { data: 'bar' });

    const log2 = new AppendLog(filePath);
    expect(log2.get('foo')).toMatchObject({ data: 'bar' });
  });

  it('invalidate clears in-memory cache (next call reloads from disk)', () => {
    const filePath = path.join(tempDir, 'invalidate.jsonl');
    const log = new AppendLog(filePath);
    log.append('k', { v: 'original' });

    // Externally append a new line
    const rawLine = JSON.stringify({ _key: 'k', v: 'updated' });
    fs.appendFileSync(filePath, rawLine + '\n');

    // Before invalidate, still sees original (cache hit)
    expect(log.get('k').v).toBe('original');

    log.invalidate();
    // After invalidate, re-reads disk
    expect(log.get('k').v).toBe('updated');
  });

  it('toObject returns plain key→value pairs without _key field', () => {
    const log = new AppendLog(path.join(tempDir, 'obj.jsonl'));
    log.append('a', { x: 1 });
    log.append('b', { x: 2 });
    const obj = log.toObject();
    expect(obj.a).toEqual({ x: 1 });
    expect(obj.b).toEqual({ x: 2 });
    expect(obj.a._key).toBeUndefined();
  });

  it('compact rewrites file with only latest entries', () => {
    const filePath = path.join(tempDir, 'compact.jsonl');
    const log = new AppendLog(filePath, { compactThreshold: 99999 });
    log.append('k1', { v: 1 });
    log.append('k1', { v: 2 }); // duplicate
    log.append('k2', { v: 3 });
    log.compact();

    const lines = fs.readFileSync(filePath, 'utf8').split('\n').filter(Boolean);
    expect(lines).toHaveLength(2);
    const parsed = lines.map(l => JSON.parse(l));
    expect(parsed.find(p => p._key === 'k1').v).toBe(2);
    expect(parsed.find(p => p._key === 'k2').v).toBe(3);
  });

  it('entries() returns a Map', () => {
    const log = new AppendLog(path.join(tempDir, 'entries.jsonl'));
    log.append('x', { n: 1 });
    const m = log.entries();
    expect(m instanceof Map).toBe(true);
    expect(m.has('x')).toBe(true);
  });

  it('skips corrupt JSON lines gracefully', () => {
    const filePath = path.join(tempDir, 'corrupt.jsonl');
    fs.writeFileSync(filePath, 'not-json\n{"_key":"good","v":1}\n');
    const log = new AppendLog(filePath);
    expect(log.size).toBe(1);
    expect(log.get('good').v).toBe(1);
  });
});

describe('compactAppendLogs', () => {
  let AppendLog, compactAppendLogs;
  let tempDir;

  beforeEach(async () => {
    vi.resetModules();
    const mod = await import('./append-log.mjs');
    AppendLog = mod.AppendLog;
    compactAppendLogs = mod.compactAppendLogs;
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'compact-all-test-'));
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('returns { logs_compacted, total_entries } with counts >= 0', () => {
    const filePath = path.join(tempDir, 'global.jsonl');
    const log = new AppendLog(filePath, { compactThreshold: 99999 });
    log.append('a', { v: 1 });
    const result = compactAppendLogs();
    expect(typeof result.logs_compacted).toBe('number');
    expect(typeof result.total_entries).toBe('number');
    expect(result.logs_compacted).toBeGreaterThanOrEqual(1);
    expect(result.total_entries).toBeGreaterThanOrEqual(1);
  });
});
