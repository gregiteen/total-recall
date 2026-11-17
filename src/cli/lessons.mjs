import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { atomicWrite } from '../core/vault.mjs';
import { parseLayerFlag, resolveBrainDir } from './agent-dir.mjs';
import { detectProjectBrain } from '../core/brain-locate.mjs';
import { isBrainEnabled } from '../core/brain-registry.mjs';
import { tickLessons, enqueueSessionReviews } from '../core/lessons.mjs';
import { isInternalJobEnv, isAutomaticLessonTask, isLessonsPaused, lessonsHeldUntil, setLessonsPaused } from '../core/internal-sessions.mjs';
import { listTasks, cancelTask, resolveQueueDir } from '../core/task-envelope.mjs';

/** Count, and with cancel, cancel pending automatic lesson work. Sessions and memory are untouched. */
async function containLessonQueue(brainDir, { cancel = false } = {}) {
  const queueDir = resolveQueueDir(brainDir);
  // The pending listing includes in-progress tasks.
  const tasks = listTasks(queueDir, { status: 'pending' }).filter(isAutomaticLessonTask);
  const result = { pending: tasks.filter(task => task.status === 'pending').length,
    inProgress: tasks.filter(task => task.status === 'in-progress').length, cancelled: 0, failed: [] };
  if (!cancel) return result;
  for (const task of tasks.filter(item => item.status === 'pending')) {
    const outcome = await cancelTask(queueDir, task.slug, { expectedStatus: 'pending' });
    if (outcome.success) result.cancelled++;
    else result.failed.push({ slug: task.slug, error: outcome.error });
  }
  return result;
}

export default async function lessons(args) {
  const { layer, remainingArgs } = parseLayerFlag(args);
  const [command, ...flags] = remainingArgs;
  if (!command || flags.includes('--help') || ['--help', '-h'].includes(command)) {
    console.log('Usage: total-recall lessons tick|session-end|scan [--session ID] [--transcript PATH] [--harness ID] [--interval N] [--hold]\n       total-recall lessons pause [--cancel-pending] | resume | status [--global]\nHooks pass JSON on stdin. Stop queues completed turn ranges; session-end queues the remaining turns. scan reviews locally ingested sessions.\npause stops queueing and running automatic lesson reviews; --cancel-pending cancels queued reviews and the skill-gap tasks they filed.');
    return;
  }
  if (['pause', 'resume', 'status'].includes(command)) {
    const unknown = flags.find(flag => !(command === 'pause' && flag === '--cancel-pending'));
    if (unknown) throw new Error(`Invalid lessons option: ${unknown}`);
    const brainDir = resolveBrainDir(layer);
    if (command !== 'status') setLessonsPaused(brainDir, command === 'pause');
    const queue = await containLessonQueue(brainDir, { cancel: flags.includes('--cancel-pending') });
    console.log(JSON.stringify({ brainDir, paused: isLessonsPaused(brainDir), heldUntil: lessonsHeldUntil(brainDir), queue }));
    if (queue.failed.length) process.exitCode = 1;
    return;
  }
  if (!['tick', 'session-end', 'scan'].includes(command)) throw new Error(`Unknown lessons command: ${command}`);
  const opts = {};
  for (let i = 0; i < flags.length; i++) {
    const flag = flags[i];
    if (flag === '--hold') { opts.hold = true; continue; }
    if (!['--session', '--transcript', '--harness', '--interval', '--event'].includes(flag) || !flags[i + 1]) throw new Error(`Invalid lessons option: ${flag}`);
    opts[flag.slice(2)] = flags[++i];
  }
  // Metaharness children are Total Recall's own work. Never read or copy their history.
  if (command !== 'scan' && isInternalJobEnv()) {
    console.log(opts.session ? JSON.stringify({ tasks: [], skipped: 'internal-job' }) : '{}');
    return;
  }
  const brainDir = resolveBrainDir(layer);
  if (command === 'scan') {
    console.log(JSON.stringify(enqueueSessionReviews({ brainDir, interval: opts.interval ? Number(opts.interval) : undefined, hold: opts.hold })));
    return;
  }
  let input = {};
  if (!process.stdin.isTTY && !opts.session) {
    const raw = fs.readFileSync(0, 'utf8');
    if (raw.trim()) input = JSON.parse(raw);
  }
  const sessionCwd = input.cwd || input.workspacePaths?.[0];
  const projectBrain = sessionCwd ? detectProjectBrain(sessionCwd) : null;
  const targetBrainDir = (projectBrain && isBrainEnabled(projectBrain.brainDir)) ? projectBrain.brainDir : brainDir;
  const history = input.entries || input.conversation_history || input.extra?.conversation_history;
  if (!opts.transcript && !input.transcript_path && Array.isArray(history)) {
    const id = input.session_id || input.sessionId;
    if (!id) throw new Error('Lesson hook history requires a session id');
    const key = crypto.createHash('sha256').update(`${opts.harness || 'unknown'}:${id}`).digest('hex').slice(0, 12);
    const dir = path.join(targetBrainDir, 'sessions');
    fs.mkdirSync(dir, { recursive: true });
    opts.transcript = path.join(dir, `${key}.jsonl`);
    atomicWrite(opts.transcript, history.map(entry => JSON.stringify(entry)).join('\n') + '\n');
  }
  const result = tickLessons({ brainDir: targetBrainDir, sessionId: opts.session || input.session_id || input.sessionId || input.conversation_id,
    transcriptPath: opts.transcript || input.transcript_path || input.transcriptPath,
    harness: opts.harness || 'unknown', turnId: input.turn_id || input.prompt_id,
    event: command === 'session-end' ? 'SessionEnd' : (opts.event || input.hook_event_name || input.event || 'Stop'),
    interval: opts.interval ? Number(opts.interval) : undefined, hold: opts.hold });
  // Hook JSON must not ask the harness to continue, stop, or approve a tool.
  if (opts.session) console.log(JSON.stringify(result));
  else console.log('{}');
}
