/** Job commands and events. The inbox is append-only; ack events are its cursor. */
import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { configDir } from './paths.mjs';
import { resolveJob } from './jobs.mjs';

const execute = promisify(execFile);
export function jobPaths(job) {
  const id = typeof job === 'string' ? job : job?.id || job?.job;
  if (typeof id !== 'string' || !/^[a-z0-9-]+$/.test(id)) throw new Error('Invalid job ID.');
  const base = path.join(configDir(), 'jobs', id);
  return { id, inbox: `${base}.inbox.jsonl`, events: `${base}.events.jsonl` };
}

function readLines(file) {
  let data;
  try { data = fs.readFileSync(file, 'utf8'); }
  catch (error) { if (error.code === 'ENOENT') return []; throw error; }
  // An append from another process can still be incomplete.
  return data.split('\n').slice(0, -1).filter(Boolean).map(line => JSON.parse(line));
}

export function appendEvent(job, event) {
  const { events } = jobPaths(job);
  fs.mkdirSync(path.dirname(events), { recursive: true, mode: 0o700 });
  const entry = { ...event, t: new Date().toISOString() };
  fs.appendFileSync(events, JSON.stringify(entry) + '\n', { mode: 0o600 });
  return entry;
}

/** Read all requests, including requests older than watch's --tail. */
export function waitingRequests(job) {
  const file = typeof job === 'string' && job.endsWith('.events.jsonl') ? job : jobPaths(job).events;
  const waiting = new Map();
  for (const event of readLines(file)) {
    if (['question', 'approval'].includes(event.kind) && event.requestId) waiting.set(event.requestId, event);
    if (event.kind === 'ack' && event.requestId && event.ok !== false) waiting.delete(event.requestId);
  }
  return [...waiting.values()];
}

function normalizeCommand(command) {
  if (!command || typeof command !== 'object' || Array.isArray(command)) throw new Error('A job command is required.');
  const type = command.type || command.command || command.kind;
  if (!['reply', 'approve', 'interrupt', 'goal', 'fork'].includes(type)) throw new Error('Unsupported job command.');
  if (['reply', 'goal'].includes(type) && (typeof command.text !== 'string' || !command.text.trim())) throw new Error(`${type} requires text.`);
  if (type === 'approve' && (typeof command.requestId !== 'string' || !command.requestId || !['allow', 'deny'].includes(command.value))) {
    throw new Error('approve requires a request ID and allow or deny.');
  }
  if (command.requestId !== undefined && (typeof command.requestId !== 'string' || !command.requestId)) throw new Error('Invalid request ID.');
  return { ...command, type, command: type, id: command.id || randomUUID(), t: new Date().toISOString() };
}

const quote = value => `'${String(value).replaceAll("'", "'\\''")}'`;

/** Resolve prefixes through the same owner as cancel. Remote delivery never writes a local inbox. */
export async function appendCommand(target, command, { local = false, execFileFn = execute } = {}) {
  const job = resolveJob(typeof target === 'string' ? target : target?.id || target?.job);
  if (job.result) throw new Error(`Job ${job.id} has finished.`);
  const entry = normalizeCommand(command);
  const node = job.record?.node;
  if (!local && node && node !== 'local') {
    if (typeof node !== 'string' || node.startsWith('-') || /[\0\r\n]/.test(node)) throw new Error('Invalid job node.');
    const args = [entry.type, job.record.remoteJob || job.id];
    if (entry.type === 'approve') args.push(entry.requestId, entry.value);
    else if (!['interrupt', 'fork'].includes(entry.type)) args.push(entry.text);
    if (entry.type === 'fork' && entry.atTurn) args.push('--at', entry.atTurn);
    args.push('--local-delivery', '--json');
    const remote = `total-recall meta-harness ${args.map(quote).join(' ')}`;
    const result = await execFileFn(process.env.TOTAL_RECALL_BIN || 'total-recall', ['mesh', 'exec', node, remote],
      { encoding: 'utf8', timeout: 60_000, maxBuffer: 1024 * 1024 });
    if (result.exitCode && result.exitCode !== 0) throw new Error(result.stderr || 'Remote command failed.');
    // mesh exec may wrap the remote result. Transport failures must not look like delivery.
    let report;
    try { report = JSON.parse(result.stdout); } catch { /* mesh can return plain command output */ }
    if (report?.ok === false) throw new Error(report.error || 'Remote command failed.');
    return { ok: true, job: job.id, node, remote: true, command: entry, ...(report ? { delivery: report } : {}) };
  }
  const waiting = waitingRequests(job.id);
  const reserved = new Set(readLines(jobPaths(job.id).inbox).map(row => row.requestId).filter(Boolean));
  const request = entry.requestId ? waiting.find(row => row.requestId === entry.requestId)
    : entry.type === 'reply' ? waiting.find(row => row.kind === 'question' && !reserved.has(row.requestId)) : null;
  if (entry.requestId && !request) throw new Error(`No waiting request matches ${entry.requestId}.`);
  if (request && entry.type === 'approve' && request.kind !== 'approval') throw new Error('The request is not an approval.');
  if (request && entry.type === 'reply' && request.kind !== 'question') throw new Error('The request is not a question.');
  if (request) {
    if (reserved.has(request.requestId)) throw new Error('The request already has an answer in the inbox.');
    entry.requestId = request.requestId;
    if (request.source === 'mcp') entry.recipient = 'mcp';
    // A deferred question is answered by the session runner, which starts the next turn with it.
    else if (request.source === 'deferred') entry.recipient = 'deferred';
  }
  const { inbox } = jobPaths(job.id);
  fs.mkdirSync(path.dirname(inbox), { recursive: true, mode: 0o700 });
  fs.appendFileSync(inbox, JSON.stringify(entry) + '\n', { mode: 0o600 });
  return { ok: true, job: job.id, command: entry };
}

/**
 * One consumer handles commands in file order. A false return leaves a command for
 * another consumer. MCP answers have their own recipient so a worker cannot also
 * send them to the driver. Await close() before releasing the driver.
 */
export function tailInbox(job, onCommand, { pollMs = 50, recipient = 'driver', onError = () => {} } = {}) {
  const { inbox, events } = jobPaths(job);
  fs.mkdirSync(path.dirname(inbox), { recursive: true, mode: 0o700 });
  fs.closeSync(fs.openSync(inbox, 'a', 0o600));
  let closed = false, running = null;
  const seen = new Set();
  const poll = () => {
    if (closed || running) return running;
    running = (async () => {
      const acknowledged = new Set(readLines(events).filter(row => row.kind === 'ack' && row.commandId).map(row => row.commandId));
      for (const command of readLines(inbox)) {
        if (closed) break;
        if (!command.id || seen.has(command.id) || acknowledged.has(command.id) || (command.recipient || 'driver') !== recipient) continue;
        let result;
        try { result = await onCommand(command); }
        catch (error) {
          // A failed command is reported once; do not repeat an agent side effect.
          seen.add(command.id);
          appendEvent(job, { kind: 'ack', command: command.type || command.command, commandId: command.id,
            requestId: command.requestId, ok: false, text: error.message });
          onError(error);
          continue;
        }
        if (result === false || result?.handled === false) continue;
        seen.add(command.id);
        appendEvent(job, { kind: 'ack', command: command.type || command.command, commandId: command.id,
          requestId: command.requestId, ok: true, text: `Handled ${command.type || command.command}`, ...(result?.via ? { via: result.via } : {}) });
      }
    })().catch(onError).finally(() => { running = null; });
    return running;
  };
  const timer = setInterval(poll, pollMs);
  poll();
  const close = async () => { closed = true; clearInterval(timer); await running; };
  // A function is convenient for existing watcher callers; properties support explicit lifecycle use.
  close.close = close;
  close.poll = poll;
  return close;
}
