import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { atomicWrite } from '../core/vault.mjs';
import { parseLayerFlag, resolveBrainDir } from './agent-dir.mjs';
import { tickLessons, enqueueSessionReviews } from '../core/lessons.mjs';

export default async function lessons(args) {
  const { layer, remainingArgs } = parseLayerFlag(args);
  const [command, ...flags] = remainingArgs;
  if (!command || flags.includes('--help') || ['--help', '-h'].includes(command)) {
    console.log('Usage: total-recall lessons tick|session-end|scan [--session ID] [--transcript PATH] [--harness ID] [--interval N] [--hold]\nHooks pass JSON on stdin. Stop queues completed turn ranges; session-end queues the remaining turns. scan reviews locally ingested sessions.');
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
  const history = input.entries || input.conversation_history || input.extra?.conversation_history;
  if (!opts.transcript && !input.transcript_path && Array.isArray(history)) {
    const id = input.session_id || input.sessionId;
    if (!id) throw new Error('Lesson hook history requires a session id');
    const key = crypto.createHash('sha256').update(`${opts.harness || 'unknown'}:${id}`).digest('hex').slice(0, 12);
    const dir = path.join(brainDir, 'sessions');
    fs.mkdirSync(dir, { recursive: true });
    opts.transcript = path.join(dir, `${key}.jsonl`);
    atomicWrite(opts.transcript, history.map(entry => JSON.stringify(entry)).join('\n') + '\n');
  }
  const result = tickLessons({ brainDir, sessionId: opts.session || input.session_id || input.sessionId || input.conversation_id,
    transcriptPath: opts.transcript || input.transcript_path || input.transcriptPath,
    harness: opts.harness || 'unknown', turnId: input.turn_id || input.prompt_id,
    event: command === 'session-end' ? 'SessionEnd' : (opts.event || input.hook_event_name || input.event || 'Stop'),
    interval: opts.interval ? Number(opts.interval) : undefined, hold: opts.hold });
  // Hook JSON must not ask the harness to continue, stop, or approve a tool.
  if (opts.session) console.log(JSON.stringify(result));
  else console.log('{}');
}
