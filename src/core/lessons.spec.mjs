import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { tickLessons, enqueueSessionReviews } from './lessons.mjs';
import { readLessonEntries } from './lesson-sessions.mjs';
import { listTasks } from './task-envelope.mjs';

let brain, file;
beforeEach(() => {
  brain = fs.mkdtempSync(path.join(os.tmpdir(), 'lesson-tick-'));
  file = path.join(brain, 'native.jsonl');
});
afterEach(() => { vi.restoreAllMocks(); fs.rmSync(brain, { recursive: true, force: true }); });
const write = n => fs.writeFileSync(file, Array.from({ length: n }, (_, i) => [
  { role: 'user', content: `Correction ${i + 1}` }, { role: 'assistant', content: `Response ${i + 1}` },
]).flat().map(row => JSON.stringify(row)).join('\n'));
const tick = extra => tickLessons({ brainDir: brain, sessionId: 's', transcriptPath: file, interval: 3, ...extra });
const tasks = () => listTasks(path.join(brain, 'scheduler', 'queue'), { status: 'all' });

describe('local lesson trigger', () => {
  it('counts per session, queues exact ranges at the interval and queues a final partial range once', () => {
    write(2); expect(tick().tasks).toEqual([]);
    write(3); expect(tick().queuedThrough).toBe(3);
    write(4); expect(tick().tasks).toEqual([]);
    expect(tick({ event: 'SessionEnd' }).queuedThrough).toBe(4);
    expect(tick({ event: 'SessionEnd' }).tasks).toEqual([]);
    const queued = tasks().sort((a, b) => a.payload.fromTurn - b.payload.fromTurn);
    expect(queued.map(t => [t.payload.fromTurn, t.payload.toTurn])).toEqual([[1, 3], [4, 4]]);
    const snapshot = fs.readFileSync(queued[1].payload.sessionPath, 'utf8');
    expect(snapshot).toContain('Correction 4'); expect(snapshot).toContain('Response 4');
    expect(snapshot).not.toContain('Correction 3');
  });
  it('does not review a prompt until its Stop event and retains the completed response', () => {
    write(3); expect(tick({ event: 'UserPromptSubmit' }).tasks).toEqual([]);
    expect(tick().tasks).toHaveLength(1);
  });
  it('ingest shares the native hook cursor, catches up every range and runs without leadership', () => {
    write(7); tick();
    const result = enqueueSessionReviews({ brainDir: brain, interval: 3, now: Date.now() + 600_000 });
    expect(result[0].queuedThrough).toBe(7);
    expect(tasks()).toHaveLength(3);
    enqueueSessionReviews({ brainDir: brain, interval: 3, now: Date.now() + 600_000 });
    expect(tasks()).toHaveLength(3);
  });
  it('keeps progress unchanged when task persistence fails and can retry', () => {
    write(3);
    const spy = vi.spyOn(fs, 'renameSync').mockImplementationOnce(() => { throw new Error('disk full'); });
    expect(() => tick()).toThrow('disk full'); spy.mockRestore();
    expect(tick().tasks).toHaveLength(1);
  });
  it('keeps sessions independent and rejects invalid intervals and backwards transcripts', () => {
    write(3); tick();
    const other = path.join(brain, 'other.jsonl'); fs.copyFileSync(file, other);
    tick({ sessionId: 'other', transcriptPath: other });
    expect(tasks()).toHaveLength(2);
    expect(() => tick({ interval: 0 })).toThrow('positive integer');
    write(1); expect(() => tick()).toThrow('backwards');
  });
  it('preserves held-write policy in the queued task', () => {
    write(3); tick({ hold: true }); expect(tasks()[0].payload.hold).toBe(true);
  });
  it('uses configured interval and hold policy and honors an explicit interval', () => {
    fs.mkdirSync(path.join(brain, 'config'));
    fs.writeFileSync(path.join(brain, 'config/lessons.json'), JSON.stringify({ interval: 2, holdWrites: true }));
    write(2); expect(tick({ interval: undefined }).tasks).toHaveLength(1);
    expect(tasks()[0].payload.hold).toBe(true);
    write(3); expect(tick({ interval: 10 }).tasks).toEqual([]);
  });
  it('recovers a dead hook lock and refuses to remove a live sibling lock', () => {
    write(1); tick();
    const root = path.join(brain, 'lesson-reviews');
    const key = fs.readdirSync(root).find(name => name.endsWith('.json')).replace(/\.json$/, '');
    const lock = path.join(root, `${key}.lock`);
    fs.writeFileSync(lock, '99999999');
    expect(tick().turns).toBe(1);
    fs.writeFileSync(lock, String(process.pid));
    expect(() => tick()).toThrow('still holds');
    expect(fs.readFileSync(lock, 'utf8')).toBe(String(process.pid));
  });
});

describe('native transcript normalization', () => {
  it('reads Claude content blocks and treats tool results as tools', () => {
    fs.writeFileSync(file, [
      { message: { role: 'user', content: [{ type: 'text', text: 'Use tabs' }] } },
      { message: { role: 'user', content: [{ type: 'tool_result', content: 'lint output' }] } },
      { message: { role: 'assistant', content: [{ type: 'text', text: 'Done' }] } },
    ].map(row => JSON.stringify(row)).join('\n'));
    expect(readLessonEntries(file).map(row => row.role)).toEqual(['user', 'tool', 'assistant']);
  });
  it('does not double count Codex event messages and retains native tool evidence', () => {
    fs.writeFileSync(file, [
      { type: 'event_msg', payload: { type: 'user_message', message: 'Fix it' } },
      { type: 'response_item', payload: { type: 'message', role: 'user', content: [{ type: 'input_text', text: 'Fix it' }] } },
      { type: 'response_item', payload: { type: 'function_call_output', output: 'test failed' } },
      { type: 'response_item', payload: { type: 'message', role: 'assistant', content: [{ type: 'output_text', text: 'Fixed' }] } },
    ].map(row => JSON.stringify(row)).join('\n'));
    const entries = readLessonEntries(file);
    expect(entries.map(row => row.role)).toEqual(['user', 'tool', 'assistant']);
    expect(entries[1].content).toContain('test failed');
  });
});
