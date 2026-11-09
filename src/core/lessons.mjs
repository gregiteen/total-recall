import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { atomicWrite } from './vault.mjs';
import { addTask, getTask, resolveQueueDir } from './task-envelope.mjs';
import { readLessonEntries, countLessonTurns, selectLessonTurns } from './lesson-sessions.mjs';
import { acquireBrainUpdateLock } from './brain-updates.mjs';

export const DEFAULT_LESSON_INTERVAL = 10;
const hash = value => crypto.createHash('sha256').update(value).digest('hex').slice(0, 12);

/** A local hook only queues work. It never calls a model or elects a leader. */
export function tickLessons({ brainDir, sessionId, transcriptPath, event = 'Stop', interval,
  turnId, turnCount, harness = 'unknown', hold } = {}) {
  if (!brainDir || !sessionId) throw new Error('Lesson review requires a brain and session id');
  const sessionsDir = path.join(brainDir, 'sessions');
  const configPath = path.join(brainDir, 'config', 'lessons.json');
  if (fs.existsSync(configPath)) {
    const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    if (config.enabled === false) return { tasks: [], skipped: 'disabled' };
    interval ??= config.interval;
    if (hold === undefined) hold = config.holdWrites === true;
  }
  interval ??= DEFAULT_LESSON_INTERVAL;
  if (!Number.isInteger(interval) || interval < 1) throw new Error('Lesson interval must be a positive integer');
  hold ??= false;
  const root = path.join(brainDir, 'lesson-reviews');
  fs.mkdirSync(root, { recursive: true });
  // Match writeSession's identity so native hooks and later ingest share a cursor.
  const localTranscript = transcriptPath && path.dirname(path.resolve(transcriptPath)) === path.resolve(sessionsDir);
  const key = transcriptPath ? (localTranscript ? path.basename(transcriptPath, '.jsonl') : hash(path.resolve(transcriptPath))) : hash(`${harness}:${sessionId}`);
  const lock = path.join(root, `${key}.lock`);
  const lockFd = acquireBrainUpdateLock(lock, { waitMs: 0 });
  try {
    const stateFile = path.join(root, `${key}.json`);
    const state = fs.existsSync(stateFile) ? JSON.parse(fs.readFileSync(stateFile, 'utf8')) : { turns: 0, queuedThrough: 0 };
    let entries;
    const savedTranscript = path.join(sessionsDir, `${key}.jsonl`);
    if (!transcriptPath && fs.existsSync(savedTranscript)) transcriptPath = savedTranscript;
    if (transcriptPath) {
      entries = readLessonEntries(transcriptPath);
      turnCount = countLessonTurns(entries);
      if (!localTranscript) {
        fs.mkdirSync(sessionsDir, { recursive: true });
        atomicWrite(path.join(sessionsDir, `${key}.jsonl`), entries.map(entry => JSON.stringify(entry)).join('\n') + '\n');
      }
    }
    if (turnCount !== undefined) {
      if (!Number.isInteger(turnCount) || turnCount < state.turns) throw new Error('Lesson transcript turn count went backwards');
      state.turns = turnCount;
    } else if (event === 'UserPromptSubmit' && (!turnId || turnId !== state.lastTurnId)) {
      state.turns++;
      state.lastTurnId = turnId;
    }
    const final = event === 'SessionEnd' || event === 'session-end';
    const tasks = [];
    // Prompt hooks count only. Stop has the completed response and tool results.
    if (event !== 'UserPromptSubmit' && entries) {
      while (state.turns - state.queuedThrough >= interval || (final && state.turns > state.queuedThrough)) {
        const fromTurn = state.queuedThrough + 1;
        const toTurn = Math.min(state.turns, state.queuedThrough + interval);
        const slug = `lesson-review-${key}-${fromTurn}-${toTurn}`;
        const queueDir = resolveQueueDir(brainDir);
        if (!getTask(queueDir, slug) && !fs.existsSync(path.join(root, `${slug}.done`))) {
          const snapshot = path.join(root, `${slug}.jsonl`);
          atomicWrite(snapshot, selectLessonTurns(entries, { fromTurn, toTurn }).map(entry => JSON.stringify(entry)).join('\n') + '\n');
          addTask({ slug, intent: `Review session ${sessionId}, turns ${fromTurn}–${toTurn}`,
            kind: 'memory', executor: 'lesson-review', category: 'lesson-review', priority: 40,
            origin: { agent: harness, session_id: sessionId },
            payload: { sessionPath: snapshot, fromTurn, toTurn, hold, sessionId },
          }, queueDir);
        }
        tasks.push(slug);
        state.queuedThrough = toTurn;
      }
    }
    atomicWrite(stateFile, JSON.stringify(state));
    return { turns: state.turns, queuedThrough: state.queuedThrough, tasks };
  } finally {
    // Remove only the inode this process acquired. A dead hook's lock is reclaimed
    // by the shared lock owner on the next tick.
    try { if (fs.statSync(lock).ino === fs.fstatSync(lockFd).ino) fs.unlinkSync(lock); }
    finally { fs.closeSync(lockFd); }
  }
}

/** Session-ingest fallback for harnesses without a lifecycle hook. Every node calls this. */
export function enqueueSessionReviews({ brainDir, now = Date.now(), quietMs = 5 * 60_000, interval, hold } = {}) {
  const dir = path.join(brainDir, 'sessions');
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).filter(name => name.endsWith('.jsonl')).map(name => {
    const transcriptPath = path.join(dir, name);
    return tickLessons({ brainDir, sessionId: path.basename(name, '.jsonl'), transcriptPath, interval, hold,
      event: now - fs.statSync(transcriptPath).mtimeMs >= quietMs ? 'SessionEnd' : 'Stop', harness: 'session-ingest' });
  });
}
