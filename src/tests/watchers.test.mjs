/**
 * watchers.test.mjs — Unit tests for IDE watcher adapters (Phase 12)
 *
 * Tests parsing logic for each watcher format without requiring
 * actual IDE installations. Uses mock data to verify turn extraction.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import path from 'path';
import os from 'os';

// ─── HELPERS ────────────────────────────────────────────────────────────────────

function tmpFile(name, content) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tr-watcher-'));
  const file = path.join(dir, name);
  fs.writeFileSync(file, content);
  return { file, dir, cleanup: () => fs.rmSync(dir, { recursive: true, force: true }) };
}

// ─── CLAUDE CODE WATCHER ────────────────────────────────────────────────────────

describe('claude-code watcher', () => {
  it('parses user and assistant turns from JSONL', async () => {
    const { parseNewTurns } = await import('../coprocessor/watchers/claude-code.mjs');

    const jsonl = [
      JSON.stringify({
        type: 'user',
        message: { role: 'user', content: 'Hello Claude' },
        timestamp: '2026-05-01T12:00:00Z',
        sessionId: 'test-123',
      }),
      JSON.stringify({
        type: 'assistant',
        message: {
          role: 'assistant',
          content: [
            { type: 'text', text: 'Hello! How can I help?' },
            { type: 'tool_use', id: 'tool_1', name: 'read_file' },
          ],
        },
        timestamp: '2026-05-01T12:00:01Z',
        sessionId: 'test-123',
      }),
    ].join('\n');

    const { file, cleanup } = tmpFile('session.jsonl', jsonl);

    try {
      const result = parseNewTurns(file, 0);
      assert.equal(result.turns.length, 2);
      assert.equal(result.turns[0].role, 'user');
      assert.equal(result.turns[0].text, 'Hello Claude');
      assert.equal(result.turns[1].role, 'model');
      assert.equal(result.turns[1].text, 'Hello! How can I help?');
      assert.ok(result.newOffset > 0);
    } finally {
      cleanup();
    }
  });

  it('skips already-read content via offset', async () => {
    const { parseNewTurns } = await import('../coprocessor/watchers/claude-code.mjs');

    const line1 = JSON.stringify({
      type: 'user',
      message: { role: 'user', content: 'First message' },
      timestamp: '2026-05-01T12:00:00Z',
    });
    const line2 = JSON.stringify({
      type: 'user',
      message: { role: 'user', content: 'Second message' },
      timestamp: '2026-05-01T12:01:00Z',
    });

    const { file, cleanup } = tmpFile('session.jsonl', line1 + '\n');

    try {
      const first = parseNewTurns(file, 0);
      assert.equal(first.turns.length, 1);
      assert.equal(first.turns[0].text, 'First message');

      // Append second line
      fs.appendFileSync(file, line2 + '\n');

      const second = parseNewTurns(file, first.newOffset);
      assert.equal(second.turns.length, 1);
      assert.equal(second.turns[0].text, 'Second message');
    } finally {
      cleanup();
    }
  });
});

// ─── AIDER WATCHER ──────────────────────────────────────────────────────────────

describe('aider watcher', () => {
  it('parses #### USER / #### ASSISTANT markdown headers', async () => {
    const { parseNewTurns } = await import('../coprocessor/watchers/aider.mjs');

    const markdown = `#### USER
Fix the login bug in auth.ts

#### ASSISTANT
I'll fix the login bug. Let me read the file first...

Here's the fix:
\`\`\`typescript
// fixed code
\`\`\`

#### USER
Thanks! Now add tests.
`;

    const { file, cleanup } = tmpFile('.aider.chat.history.md', markdown);

    try {
      const result = parseNewTurns(file, 0);
      assert.equal(result.turns.length, 3);
      assert.equal(result.turns[0].role, 'user');
      assert.ok(result.turns[0].text.includes('Fix the login bug'));
      assert.equal(result.turns[1].role, 'model');
      assert.ok(result.turns[1].text.includes('fixed code'));
      assert.equal(result.turns[2].role, 'user');
      assert.ok(result.turns[2].text.includes('add tests'));
    } finally {
      cleanup();
    }
  });
});

// ─── GENERIC WATCHER ────────────────────────────────────────────────────────────

describe('generic watcher', () => {
  it('parses JSONL format with various role field names', async () => {
    const { parseNewTurns } = await import('../coprocessor/watchers/generic.mjs');

    const jsonl = [
      JSON.stringify({ role: 'user', content: 'Hello' }),
      JSON.stringify({ type: 'assistant', message: 'World' }),
      JSON.stringify({ sender: 'human', text: 'Ping' }),
      JSON.stringify({ role: 'ai', content: 'Pong' }),
    ].join('\n');

    const { file, cleanup } = tmpFile('chat.jsonl', jsonl);

    try {
      const result = parseNewTurns(file, 0, 'jsonl');
      assert.equal(result.turns.length, 4);
      assert.equal(result.turns[0].role, 'user');
      assert.equal(result.turns[0].text, 'Hello');
      assert.equal(result.turns[1].role, 'model');
      assert.equal(result.turns[1].text, 'World');
      assert.equal(result.turns[2].role, 'user');
      assert.equal(result.turns[2].text, 'Ping');
      assert.equal(result.turns[3].role, 'model');
      assert.equal(result.turns[3].text, 'Pong');
    } finally {
      cleanup();
    }
  });

  it('parses markdown format with heading role markers', async () => {
    const { parseNewTurns } = await import('../coprocessor/watchers/generic.mjs');

    const md = `## User
What is the meaning of life?

## Assistant
42, according to Douglas Adams.
`;

    const { file, cleanup } = tmpFile('chat.md', md);

    try {
      const result = parseNewTurns(file, 0, 'markdown');
      assert.equal(result.turns.length, 2);
      assert.equal(result.turns[0].role, 'user');
      assert.ok(result.turns[0].text.includes('meaning of life'));
      assert.equal(result.turns[1].role, 'model');
      assert.ok(result.turns[1].text.includes('42'));
    } finally {
      cleanup();
    }
  });

  it('parses plaintext format with [ROLE] markers', async () => {
    const { parseNewTurns } = await import('../coprocessor/watchers/generic.mjs');

    const txt = `[USER] Help me debug this
The error is on line 42

[ASSISTANT] I see the issue.
You're missing a semicolon.
`;

    const { file, cleanup } = tmpFile('chat.txt', txt);

    try {
      const result = parseNewTurns(file, 0, 'plaintext');
      assert.equal(result.turns.length, 2);
      assert.equal(result.turns[0].role, 'user');
      assert.ok(result.turns[0].text.includes('line 42'));
      assert.equal(result.turns[1].role, 'model');
      assert.ok(result.turns[1].text.includes('semicolon'));
    } finally {
      cleanup();
    }
  });

  it('handles incremental reads via offset', async () => {
    const { parseNewTurns } = await import('../coprocessor/watchers/generic.mjs');

    const line1 = JSON.stringify({ role: 'user', content: 'First' }) + '\n';
    const line2 = JSON.stringify({ role: 'assistant', content: 'Second' }) + '\n';

    const { file, cleanup } = tmpFile('chat.jsonl', line1);

    try {
      const r1 = parseNewTurns(file, 0, 'jsonl');
      assert.equal(r1.turns.length, 1);

      fs.appendFileSync(file, line2);

      const r2 = parseNewTurns(file, r1.newOffset, 'jsonl');
      assert.equal(r2.turns.length, 1);
      assert.equal(r2.turns[0].text, 'Second');
    } finally {
      cleanup();
    }
  });
});

// ─── WATCHER LOADER ─────────────────────────────────────────────────────────────

describe('watcher loader', () => {
  it('lists all available watchers', async () => {
    const { listAvailable } = await import('../coprocessor/watchers/index.mjs');
    const available = listAvailable();
    assert.ok(available.includes('antigravity'));
    assert.ok(available.includes('claude-code'));
    assert.ok(available.includes('aider'));
    assert.ok(available.includes('cursor'));
    assert.ok(available.includes('generic'));
    assert.ok(available.length >= 5);
  });

  it('rejects unknown watcher names', async () => {
    const { loadWatcher } = await import('../coprocessor/watchers/index.mjs');
    await assert.rejects(
      () => loadWatcher('nonexistent', {}),
      /Unknown watcher/
    );
  });
});

// ─── NOTIFICATION QUEUE ─────────────────────────────────────────────────────────

describe('notification queue', () => {
  it('enqueue + drain round-trip', async () => {
    const { enqueue, drain, purgeStale } = await import('../coprocessor/notify.mjs');

    // Enqueue without desktop notification to avoid osascript in CI
    const result = enqueue({ title: 'Test', message: 'Hello', type: 'tip', desktop: false });
    assert.ok(result.filePath);

    const items = drain();
    assert.ok(items.length >= 1);
    const testItem = items.find(i => i.label === 'Test');
    assert.ok(testItem);
    assert.equal(testItem.type, 'tip');
    assert.equal(testItem.text, 'Hello');
  });

  it('drain removes notifications', async () => {
    const { enqueue, drain } = await import('../coprocessor/notify.mjs');
    enqueue({ title: 'Temp', message: 'gone', desktop: false });
    drain(); // Should remove it
    const afterDrain = drain();
    const found = afterDrain.find(i => i.label === 'Temp');
    assert.equal(found, undefined);
  });
});
