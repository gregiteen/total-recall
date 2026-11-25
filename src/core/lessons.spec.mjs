import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { tickLessons, enqueueSessionReviews } from './lessons.mjs';
import { readLessonEntries, countLessonTurns } from './lesson-sessions.mjs';
import { listTasks } from './task-envelope.mjs';
import { parseClaudeCode, writeSession } from './session-watcher.mjs';
// These specs exercise ordinary sessions; a Metaharness test runner must not mark them internal.
delete process.env.TR_META_HARNESS_RUN;

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
  it('skips an unchanged session without rewriting its cursor, and still finishes it when it goes quiet', () => {
    write(4); tick();
    const saved = path.join(brain, 'sessions');
    const [name] = fs.readdirSync(saved);
    const transcript = path.join(saved, name);
    const cursor = path.join(brain, 'lesson-reviews', name.replace(/\.jsonl$/, '.json'));
    // Still active: the first scan records what it saw, then nothing changes.
    const active = Date.now();
    enqueueSessionReviews({ brainDir: brain, interval: 3, now: active });
    const before = fs.statSync(cursor);
    const rename = vi.spyOn(fs, 'renameSync');
    const skipped = enqueueSessionReviews({ brainDir: brain, interval: 3, now: active });
    expect(skipped[0].skipped).toBe('unchanged');
    expect(rename).not.toHaveBeenCalled();
    expect(fs.statSync(cursor).ino).toBe(before.ino);
    expect(fs.readdirSync(path.join(brain, 'lesson-reviews')).filter(n => n.endsWith('.lock'))).toEqual([]);
    rename.mockRestore();
    expect(tasks()).toHaveLength(1);
    // Turn 4 is pending; once the session goes quiet the same transcript is reviewed to the end.
    const quiet = enqueueSessionReviews({ brainDir: brain, interval: 3, now: active + 600_000 });
    expect(quiet[0].queuedThrough).toBe(4);
    expect(tasks()).toHaveLength(2);
    // Fully queued and unchanged: skipped from then on.
    expect(enqueueSessionReviews({ brainDir: brain, interval: 3, now: active + 600_000 })[0].skipped).toBe('unchanged');
    // A changed transcript is read again.
    fs.appendFileSync(transcript, JSON.stringify({ role: 'user', content: 'Correction 5' }) + '\n');
    expect(enqueueSessionReviews({ brainDir: brain, interval: 3, now: active })[0].skipped).toBeUndefined();
  });
  it('rewrites a cursor only when its state changes', () => {
    write(2); tick();
    const cursor = path.join(brain, 'lesson-reviews', fs.readdirSync(path.join(brain, 'lesson-reviews')).find(n => n.endsWith('.json')));
    const ino = fs.statSync(cursor).ino;
    tick();
    expect(fs.statSync(cursor).ino).toBe(ino);
    write(3); tick();
    expect(fs.statSync(cursor).ino).not.toBe(ino);
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

describe('a lesson turn is a human prompt', () => {
  const claudeRows = [
    { message: { role: 'user', content: 'Use tabs' } },
    { isMeta: true, message: { role: 'user', content: 'Base directory for this skill: /x' } },
    { message: { role: 'user', content: '<system-reminder>hook said hello</system-reminder>' } },
    { message: { role: 'user', content: '<command-name>/clear</command-name>' } },
    { message: { role: 'user', content: '[Request interrupted by user]' } },
    { isCompactSummary: true, message: { role: 'user', content: 'This session is being continued...' } },
    { message: { role: 'user', content: '<system-reminder>context</system-reminder>\nAnd fix the build' } },
    { message: { role: 'assistant', content: 'Done' } },
  ];
  it('keeps injected and meta text as context and counts only what the person typed', () => {
    fs.writeFileSync(file, claudeRows.map(row => JSON.stringify(row)).join('\n'));
    const entries = readLessonEntries(file);
    expect(entries.map(row => row.role)).toEqual(['user', 'context', 'context', 'context', 'context', 'context', 'user', 'assistant']);
    expect(countLessonTurns(entries)).toBe(2);
  });
  it('skips request blobs and harness events, and treats any marked tool output as a tool', () => {
    fs.writeFileSync(file, [
      { type: 'user', message: { role: 'user', content: 'Ship it' } },
      { type: 'api-request-blob', message: { role: 'user', content: 'Ship it' } },
      { type: 'user', toolUseResult: { stdout: 'ok' }, message: { role: 'user', content: 'The file was updated' } },
      { type: 'user', message: { role: 'user', content: [{ type: 'tool_reference', tool_name: 'x' }] } },
      { type: 'user', message: { role: 'user', content: '<task-notification><task-id>1</task-id></task-notification>' } },
      { type: 'user', message: { role: 'user', content: '<system-reminder>x</system-reminder>\n<side-sessions-event>done</side-sessions-event>' } },
      { type: 'user', message: { role: 'user', content: [{ type: 'text', text: '<system-reminder>x</system-reminder>' }, { type: 'text', text: 'continue' }] } },
    ].map(row => JSON.stringify(row)).join('\n'));
    const entries = readLessonEntries(file);
    expect(entries.map(row => row.role)).toEqual(['user', 'tool', 'tool', 'context', 'context', 'user']);
    expect(countLessonTurns(entries)).toBe(2);
  });
  it('does not count Codex instruction blocks or automatic goal checks', () => {
    fs.writeFileSync(file, [
      { type: 'response_item', payload: { type: 'message', role: 'user', content: [{ type: 'input_text', text: '# AGENTS.md instructions for /repo' }] } },
      { type: 'response_item', payload: { type: 'message', role: 'user', content: [{ type: 'input_text', text: '<environment_context>cwd</environment_context>' }] } },
      { type: 'response_item', payload: { type: 'message', role: 'user', content: [{ type: 'input_text', text: 'Add a test' }] } },
      { type: 'response_item', payload: { type: 'message', role: 'user', content: [{ type: 'input_text', text: 'Check the goal against what you did. Goal: x' }] } },
    ].map(row => JSON.stringify(row)).join('\n'));
    expect(countLessonTurns(readLessonEntries(file))).toBe(1);
  });
  it('rebases a cursor from the old count once, without queueing the past', () => {
    write(9); tick({ interval: 100 });
    const root = path.join(brain, 'lesson-reviews');
    const stateFile = path.join(root, fs.readdirSync(root).find(name => name.endsWith('.json')));
    // A cursor written by the old count: more turns than the transcript has prompts, no counter.
    fs.writeFileSync(stateFile, JSON.stringify({ turns: 40, queuedThrough: 30 }));
    expect(tick().tasks).toEqual([]);
    expect(JSON.parse(fs.readFileSync(stateFile, 'utf8'))).toMatchObject({ counter: 3, turns: 9, queuedThrough: 9 });
    write(12); expect(tick().tasks).toHaveLength(1);
    expect(tasks().map(t => [t.payload.fromTurn, t.payload.toTurn])).toEqual([[10, 12]]);
  });
});

describe('a saved Claude session counts the same turns as its transcript', () => {
  const rows = [
    { type: 'user', message: { role: 'user', content: 'Fix the build' } },
    { type: 'user', message: { role: 'user', content: [{ type: 'tool_result', content: 'ok' }] } },
    { type: 'user', message: { role: 'user', content: [{ type: 'tool_result', content: [{ type: 'text', text: 'no prefix' }] }] } },
    { type: 'user', toolUseResult: { stdout: 'x' }, message: { role: 'user', content: 'The file was updated' } },
    { type: 'user', isMeta: true, message: { role: 'user', content: 'Skill text' } },
    { type: 'user', isCompactSummary: true, message: { role: 'user', content: 'Summary text' } },
    { type: 'api-request-blob', message: { role: 'user', content: 'Fix the build' } },
    { type: 'user', message: { role: 'user', content: '<system-reminder>hook</system-reminder>' } },
    { type: 'user', message: { role: 'user', content: [{ type: 'image', source: { data: 'x' } }] } },
    { type: 'assistant', message: { role: 'assistant', content: [{ type: 'text', text: 'Done' }] } },
  ];
  const save = list => {
    fs.writeFileSync(file, list.map(row => JSON.stringify(row)).join('\n'));
    const sessions = path.join(brain, 'sessions');
    writeSession(parseClaudeCode(file), sessions, file);
    return path.join(sessions, fs.readdirSync(sessions)[0]);
  };
  it('keeps tool results and injected text out of the count', () => {
    const saved = readLessonEntries(save(rows));
    expect(saved.map(row => row.role)).toEqual(['user', 'tool', 'tool', 'tool', 'context', 'context', 'context', 'context', 'user', 'assistant']);
    expect(countLessonTurns(saved)).toBe(countLessonTurns(readLessonEntries(file)));
    expect(parseClaudeCode(file).filter(row => row.type === 'task')).toHaveLength(2);
  });
  it('rebases an inflated version 2 cursor without queueing anything', () => {
    const key = path.basename(save(rows), '.jsonl');
    const stateFile = path.join(brain, 'lesson-reviews', `${key}.json`);
    fs.mkdirSync(path.dirname(stateFile), { recursive: true });
    fs.writeFileSync(stateFile, JSON.stringify({ counter: 2, turns: 523, queuedThrough: 520 }));
    enqueueSessionReviews({ brainDir: brain, now: Date.now() + 600_000 });
    expect(tasks()).toEqual([]);
    expect(JSON.parse(fs.readFileSync(stateFile, 'utf8'))).toMatchObject({ counter: 3, turns: 2, queuedThrough: 2 });
  });
  it('shares its cursor with the native hook', () => {
    save(rows); tick();
    expect(enqueueSessionReviews({ brainDir: brain, interval: 3 })[0].turns).toBe(2);
    expect(tick().turns).toBe(2);
  });
  it('follows a saved session rebuilt with fewer turns and keeps scanning', () => {
    const prompts = n => Array.from({ length: n }, (_, i) => ({ type: 'user', message: { role: 'user', content: `Prompt ${i}` } }));
    save(prompts(9)); enqueueSessionReviews({ brainDir: brain, interval: 100 });
    save(prompts(4));
    expect(enqueueSessionReviews({ brainDir: brain, interval: 100 })[0]).toMatchObject({ turns: 4, queuedThrough: 0 });
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
