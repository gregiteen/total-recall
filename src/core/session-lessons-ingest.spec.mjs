import { it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { parseCodex, parseClaudeCode, writeSession } from './session-watcher.mjs';
let dir;
beforeEach(() => { dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lesson-ingest-')); });
afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));
it('ingests native Codex response records with actual roles and tool results', () => {
  const file = path.join(dir, 'native.jsonl');
  fs.writeFileSync(file, [
    { type: 'response_item', payload: { type: 'message', role: 'user', content: [{ type: 'input_text', text: 'Use tabs.' }] } },
    { type: 'response_item', payload: { type: 'function_call_output', output: 'formatter ran' } },
    { type: 'response_item', payload: { type: 'message', role: 'assistant', content: [{ type: 'output_text', text: 'Done.' }] } },
  ].map(row => JSON.stringify(row)).join('\n'));
  const entries = parseCodex(file);
  expect(entries.map(row => row.role)).toEqual(['user', 'tool', 'assistant']);
  expect(entries[1].content).toContain('formatter ran');
});
it('does not rewrite an unchanged transcript because an adapter minted fresh ids and timestamps', () => {
  const file = path.join(dir, 'native.jsonl');
  fs.writeFileSync(file, JSON.stringify({ message: { role: 'user', content: 'Use tabs.' } }));
  const sessions = path.join(dir, 'sessions');
  const first = writeSession(parseClaudeCode(file), sessions, file);
  const before = fs.readFileSync(first, 'utf8');
  expect(writeSession(parseClaudeCode(file), sessions, file)).toBeNull();
  expect(fs.readFileSync(first, 'utf8')).toBe(before);
});
