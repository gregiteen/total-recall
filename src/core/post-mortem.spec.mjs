import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

vi.mock('./logger.mjs', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));
import fs from 'fs';
import path from 'path';
import os from 'os';
import matter from 'gray-matter';
import { readSessionTranscript } from './post-mortem.mjs';

function tmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'tr-pm-'));
}

describe('readSessionTranscript', () => {
  let dir;
  beforeEach(() => { dir = tmpDir(); });
  afterEach(() => { fs.rmSync(dir, { recursive: true, force: true }); });

  it('converts JSONL entries to readable transcript', () => {
    const file = path.join(dir, 'session.jsonl');
    fs.writeFileSync(file, [
      JSON.stringify({ role: 'user', content: 'Fix the bug' }),
      JSON.stringify({ role: 'assistant', content: 'I will fix it now' }),
    ].join('\n'));

    const transcript = readSessionTranscript(file);
    expect(transcript).toContain('[USER]: Fix the bug');
    expect(transcript).toContain('[ASSISTANT]: I will fix it now');
  });

  it('returns empty string for nonexistent file', () => {
    expect(readSessionTranscript('/nonexistent/file.jsonl')).toBe('');
  });

  it('truncates very long transcripts', () => {
    const file = path.join(dir, 'long.jsonl');
    const lines = [];
    for (let i = 0; i < 200; i++) {
      lines.push(JSON.stringify({ role: 'user', content: 'A'.repeat(500) }));
    }
    fs.writeFileSync(file, lines.join('\n'));

    const transcript = readSessionTranscript(file);
    // Should be capped at MAX_TRANSCRIPT_CHARS (12000)
    expect(transcript.length).toBeLessThanOrEqual(12000);
  });

  it('limits to MAX_ENTRIES_PER_SESSION entries', () => {
    const file = path.join(dir, 'many.jsonl');
    const lines = [];
    for (let i = 0; i < 150; i++) {
      lines.push(JSON.stringify({ role: 'user', content: `Message ${i}` }));
    }
    fs.writeFileSync(file, lines.join('\n'));

    const transcript = readSessionTranscript(file);
    // Should contain message 0 but NOT message 100+ (max 100 entries)
    expect(transcript).toContain('Message 0');
    expect(transcript).not.toContain('Message 100');
  });

  it('skips empty content entries', () => {
    const file = path.join(dir, 'sparse.jsonl');
    fs.writeFileSync(file, [
      JSON.stringify({ role: 'user', content: 'Hello' }),
      JSON.stringify({ role: 'assistant', content: '' }),
      JSON.stringify({ role: 'user', content: 'Goodbye' }),
    ].join('\n'));

    const transcript = readSessionTranscript(file);
    expect(transcript).toContain('Hello');
    expect(transcript).toContain('Goodbye');
    // Should only have 2 entries (empty one skipped)
    const entryCount = (transcript.match(/\[/g) || []).length;
    expect(entryCount).toBe(2);
  });

  it('skips malformed JSON lines', () => {
    const file = path.join(dir, 'malformed.jsonl');
    fs.writeFileSync(file, [
      'not json',
      JSON.stringify({ role: 'user', content: 'Valid' }),
      '{broken',
    ].join('\n'));

    const transcript = readSessionTranscript(file);
    expect(transcript).toContain('Valid');
    const entryCount = (transcript.match(/\[/g) || []).length;
    expect(entryCount).toBe(1);
  });
});
