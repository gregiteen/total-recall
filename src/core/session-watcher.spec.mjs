import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import {
  createSessionEntry,
  parseClaudeCode,
  parseCodex,
  parseGeminiCli,
  parseAntigravity,
  parseCursor,
  writeSession,
  scanAndIngest,
  contentFingerprint,
  deduplicateByContent,
  loadSeenHashes,
} from './session-watcher.mjs';

function tmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'tr-session-'));
}

describe('createSessionEntry', () => {
  it('creates a valid session entry with defaults', () => {
    const entry = createSessionEntry({ content: 'test' });
    expect(entry.id).toBeTruthy();
    expect(entry.parentId).toBeNull();
    expect(entry.type).toBe('observation');
    expect(entry.content).toBe('test');
    expect(entry.role).toBe('assistant');
    expect(entry.source).toBe('unknown');
    expect(entry.ts).toBeTruthy();
  });

  it('respects all provided fields', () => {
    const entry = createSessionEntry({
      id: 'custom-id',
      parentId: 'parent-1',
      type: 'task',
      ts: '2026-05-17T10:00:00Z',
      content: 'do the thing',
      role: 'user',
      source: 'claude-code',
    });
    expect(entry.id).toBe('custom-id');
    expect(entry.parentId).toBe('parent-1');
    expect(entry.type).toBe('task');
    expect(entry.role).toBe('user');
    expect(entry.source).toBe('claude-code');
  });
});

describe('Claude Code Adapter', () => {
  let dir;
  beforeEach(() => { dir = tmpDir(); });
  afterEach(() => { fs.rmSync(dir, { recursive: true, force: true }); });

  it('parses JSONL with string content', () => {
    const file = path.join(dir, 'session.jsonl');
    const lines = [
      JSON.stringify({ role: 'user', content: 'Fix the bug', timestamp: '2026-05-17T10:00:00Z' }),
      JSON.stringify({ role: 'assistant', content: 'I will fix it', timestamp: '2026-05-17T10:01:00Z' }),
    ];
    fs.writeFileSync(file, lines.join('\n'));

    const entries = parseClaudeCode(file);
    expect(entries).toHaveLength(2);
    expect(entries[0].type).toBe('task');
    expect(entries[0].role).toBe('user');
    expect(entries[0].content).toBe('Fix the bug');
    expect(entries[0].source).toBe('claude-code');
    expect(entries[1].type).toBe('observation');
    expect(entries[1].role).toBe('assistant');
    expect(entries[1].parentId).toBe(entries[0].id);
  });

  it('parses content blocks (array format)', () => {
    const file = path.join(dir, 'session.jsonl');
    const lines = [
      JSON.stringify({
        role: 'assistant',
        content: [
          { type: 'text', text: 'Here is the code' },
          { type: 'image', data: 'base64...' },
          { type: 'text', text: 'and here is more' },
        ],
      }),
    ];
    fs.writeFileSync(file, lines.join('\n'));

    const entries = parseClaudeCode(file);
    expect(entries).toHaveLength(1);
    expect(entries[0].content).toBe('Here is the code\nand here is more');
  });

  it('handles tool_use messages', () => {
    const file = path.join(dir, 'session.jsonl');
    const lines = [
      JSON.stringify({
        role: 'assistant',
        content: 'Reading file',
        tool_use: { name: 'read_file', input: { path: '/foo.js' } },
      }),
    ];
    fs.writeFileSync(file, lines.join('\n'));

    const entries = parseClaudeCode(file);
    expect(entries[0].type).toBe('tool_call');
    expect(entries[0].content).toContain('[tool: read_file]');
  });

  it('skips malformed lines gracefully', () => {
    const file = path.join(dir, 'session.jsonl');
    fs.writeFileSync(file, 'not json\n{"role":"user","content":"ok"}\n{broken\n');

    const entries = parseClaudeCode(file);
    expect(entries).toHaveLength(1);
    expect(entries[0].content).toBe('ok');
  });
});

describe('Codex Adapter', () => {
  let dir;
  beforeEach(() => { dir = tmpDir(); });
  afterEach(() => { fs.rmSync(dir, { recursive: true, force: true }); });

  it('parses Codex JSONL with tool_calls', () => {
    const file = path.join(dir, 'rollout-abc.jsonl');
    const lines = [
      JSON.stringify({ role: 'user', content: 'Deploy v2', ts: '2026-05-17T10:00:00Z' }),
      JSON.stringify({
        role: 'assistant',
        content: 'Deploying...',
        tool_calls: [{ function: { name: 'run_command' } }],
        ts: '2026-05-17T10:01:00Z',
      }),
    ];
    fs.writeFileSync(file, lines.join('\n'));

    const entries = parseCodex(file);
    expect(entries).toHaveLength(2);
    expect(entries[0].type).toBe('task');
    expect(entries[1].type).toBe('tool_call');
    expect(entries[1].content).toContain('[tools: run_command]');
    expect(entries[1].source).toBe('codex');
  });

  it('handles message field fallback', () => {
    const file = path.join(dir, 'rollout-def.jsonl');
    fs.writeFileSync(file, JSON.stringify({ role: 'assistant', message: 'Done.' }) + '\n');

    const entries = parseCodex(file);
    expect(entries[0].content).toBe('Done.');
  });
});

describe('Gemini CLI Adapter', () => {
  let dir;
  beforeEach(() => { dir = tmpDir(); });
  afterEach(() => { fs.rmSync(dir, { recursive: true, force: true }); });

  it('parses JSON with messages[] array', () => {
    const file = path.join(dir, 'chat.json');
    fs.writeFileSync(file, JSON.stringify({
      messages: [
        { role: 'user', parts: [{ text: 'Hello' }], timestamp: '2026-05-17T10:00:00Z' },
        { role: 'model', parts: [{ text: 'Hi there' }], timestamp: '2026-05-17T10:01:00Z' },
      ],
    }));

    const entries = parseGeminiCli(file);
    expect(entries).toHaveLength(2);
    expect(entries[0].type).toBe('task');
    expect(entries[0].role).toBe('user');
    expect(entries[0].content).toBe('Hello');
    expect(entries[1].role).toBe('assistant'); // model → assistant
    expect(entries[1].source).toBe('gemini-cli');
  });

  it('handles history[] fallback', () => {
    const file = path.join(dir, 'chat.json');
    fs.writeFileSync(file, JSON.stringify({
      history: [
        { role: 'user', content: 'Test', parts: 'inline text' },
      ],
    }));

    const entries = parseGeminiCli(file);
    expect(entries).toHaveLength(1);
    expect(entries[0].content).toBe('inline text');
  });

  it('returns empty array for invalid JSON', () => {
    const file = path.join(dir, 'bad.json');
    fs.writeFileSync(file, 'not json');
    expect(parseGeminiCli(file)).toEqual([]);
  });
});

describe('Antigravity Adapter', () => {
  let dir;
  beforeEach(() => { dir = tmpDir(); });
  afterEach(() => { fs.rmSync(dir, { recursive: true, force: true }); });

  it('parses overview.txt with role heuristics', () => {
    const file = path.join(dir, 'overview.txt');
    fs.writeFileSync(file, [
      'USER: Fix the deployment script',
      'Model called view_file on deploy.mjs',
      'TOOL: ran npm test',
      'Model fixed the issue',
    ].join('\n'));

    const entries = parseAntigravity(file);
    expect(entries).toHaveLength(4);
    expect(entries[0].type).toBe('task');
    expect(entries[0].role).toBe('user');
    expect(entries[2].type).toBe('tool_call');
    expect(entries[2].role).toBe('tool');
    expect(entries[3].type).toBe('observation');
    expect(entries[3].source).toBe('antigravity');
  });

  it('parses transcript.jsonl with real-time turns and tag stripping', () => {
    const file = path.join(dir, 'transcript.jsonl');
    fs.writeFileSync(file, [
      JSON.stringify({
        type: 'USER_INPUT',
        content: '<USER_REQUEST>\nWhy is nothing synced?\n</USER_REQUEST>',
        timestamp: '2026-05-17T10:00:00Z',
      }),
      JSON.stringify({
        source: 'MODEL',
        type: 'RESPONSE',
        content: 'Let me look into it.',
        timestamp: '2026-05-17T10:01:00Z',
      }),
      JSON.stringify({
        source: 'SYSTEM',
        type: 'TOOL_RESULT',
        content: 'ignored step',
      }),
    ].join('\n'));

    const entries = parseAntigravity(file);
    expect(entries).toHaveLength(2);
    expect(entries[0].type).toBe('task');
    expect(entries[0].role).toBe('user');
    expect(entries[0].content).toBe('Why is nothing synced?');
    expect(entries[0].ts).toBe('2026-05-17T10:00:00Z');
    expect(entries[1].type).toBe('observation');
    expect(entries[1].role).toBe('assistant');
    expect(entries[1].content).toBe('Let me look into it.');
  });
});

describe('Cursor Adapter', () => {
  let dir;
  beforeEach(() => { dir = tmpDir(); });
  afterEach(() => { fs.rmSync(dir, { recursive: true, force: true }); });

  it('parses Cursor JSONL', () => {
    const file = path.join(dir, 'transcript.jsonl');
    fs.writeFileSync(file, [
      JSON.stringify({ role: 'user', content: 'Add tests', ts: '2026-05-17T10:00:00Z' }),
      JSON.stringify({ role: 'assistant', content: 'Adding tests now', ts: '2026-05-17T10:01:00Z' }),
    ].join('\n'));

    const entries = parseCursor(file);
    expect(entries).toHaveLength(2);
    expect(entries[0].type).toBe('task');
    expect(entries[1].source).toBe('cursor');
  });
});

describe('writeSession', () => {
  let dir;
  beforeEach(() => { dir = tmpDir(); });
  afterEach(() => { fs.rmSync(dir, { recursive: true, force: true }); });

  it('writes entries as JSONL', () => {
    const sessionsDir = path.join(dir, 'sessions');
    const entries = [
      createSessionEntry({ content: 'Hello', role: 'user', type: 'task' }),
      createSessionEntry({ content: 'Hi', role: 'assistant' }),
    ];

    const result = writeSession(entries, sessionsDir, '/fake/source/file.jsonl');
    expect(result).toBeTruthy();
    expect(fs.existsSync(result)).toBe(true);

    const lines = fs.readFileSync(result, 'utf8').trim().split('\n');
    expect(lines).toHaveLength(2);
    const parsed = JSON.parse(lines[0]);
    expect(parsed.content).toBe('Hello');
  });

  it('deduplicates: same source file is not ingested twice', () => {
    const sessionsDir = path.join(dir, 'sessions');
    const entries = [createSessionEntry({ content: 'test' })];

    const first = writeSession(entries, sessionsDir, '/fake/source.jsonl');
    const second = writeSession(entries, sessionsDir, '/fake/source.jsonl');

    expect(first).toBeTruthy();
    expect(second).toBeNull(); // already ingested
  });

  it('overwrites session file if entries grow/change', () => {
    const sessionsDir = path.join(dir, 'sessions');
    const sourceFile = '/fake/source.jsonl';
    const entries1 = [createSessionEntry({ content: 'Hello', role: 'user', type: 'task' })];
    const first = writeSession(entries1, sessionsDir, sourceFile);
    expect(first).toBeTruthy();

    // Now write again with an additional entry (growing session)
    const entries2 = [
      entries1[0],
      createSessionEntry({ content: 'Hi there', role: 'assistant' }),
    ];
    const second = writeSession(entries2, sessionsDir, sourceFile);
    expect(second).toBeTruthy(); // should NOT be null, since content has changed!

    const lines = fs.readFileSync(second, 'utf8').trim().split('\n');
    expect(lines).toHaveLength(2);
  });

  it('returns null for empty entries', () => {
    const sessionsDir = path.join(dir, 'sessions');
    expect(writeSession([], sessionsDir, '/fake/source.jsonl')).toBeNull();
  });
});

describe('scanAndIngest', () => {
  let dir;
  beforeEach(() => { dir = tmpDir(); });
  afterEach(() => { fs.rmSync(dir, { recursive: true, force: true }); });

  it('reports not-found for missing source directories', () => {
    const sessionsDir = path.join(dir, 'sessions');
    const result = scanAndIngest(sessionsDir, { enabledSources: ['nonexistent-ide'] });
    expect(result.ingested).toBe(0);
    expect(result.sources).toEqual([]);
  });
});

// ─── Content-hash deduplication ──────────────────────────────────────────────────

describe('contentFingerprint', () => {
  it('returns a 64-char hex string', () => {
    const fp = contentFingerprint({ content: 'hello world' });
    expect(fp).toMatch(/^[0-9a-f]{64}$/);
  });

  it('is identical for entries with the same content regardless of other fields', () => {
    const a = contentFingerprint({ content: 'same text', source: 'claude-code', id: '1' });
    const b = contentFingerprint({ content: 'same text', source: 'codex', id: '2' });
    expect(a).toBe(b);
  });

  it('differs for entries with different content', () => {
    const a = contentFingerprint({ content: 'hello' });
    const b = contentFingerprint({ content: 'world' });
    expect(a).not.toBe(b);
  });
});

describe('deduplicateByContent', () => {
  let dir;
  beforeEach(() => { dir = tmpDir(); });
  afterEach(() => { fs.rmSync(dir, { recursive: true, force: true }); });

  it('passes through all entries when the index is empty', () => {
    const entries = [
      { content: 'alpha', source: 'claude-code' },
      { content: 'beta',  source: 'claude-code' },
    ];
    const { unique, duplicates } = deduplicateByContent(entries, dir, 'claude-code');
    expect(unique).toHaveLength(2);
    expect(duplicates).toBe(0);
  });

  it('removes entries whose content was already indexed — same fact from two sources', () => {
    const entry = { content: 'identical fact', source: 'claude-code' };
    // First ingest — writes to index
    const { unique: u1 } = deduplicateByContent([entry], dir, 'claude-code');
    expect(u1).toHaveLength(1);

    // Second ingest from a different source with the same content
    const duplicate = { content: 'identical fact', source: 'codex', id: 'different-id' };
    const { unique: u2, duplicates } = deduplicateByContent([duplicate], dir, 'codex');
    expect(u2).toHaveLength(0);
    expect(duplicates).toBe(1);
  });

  it('persists new hashes to content-hashes.jsonl', () => {
    deduplicateByContent([{ content: 'persist me' }], dir, 'test');
    const indexFile = path.join(dir, 'content-hashes.jsonl');
    expect(fs.existsSync(indexFile)).toBe(true);
    const seen = loadSeenHashes(dir);
    const expected = contentFingerprint({ content: 'persist me' });
    expect(seen.has(expected)).toBe(true);
  });

  it('returns original entries when derivedDir is null (dedup disabled)', () => {
    const entries = [{ content: 'a' }, { content: 'b' }];
    const { unique, duplicates } = deduplicateByContent(entries, null, 'test');
    expect(unique).toHaveLength(2);
    expect(duplicates).toBe(0);
  });
});
