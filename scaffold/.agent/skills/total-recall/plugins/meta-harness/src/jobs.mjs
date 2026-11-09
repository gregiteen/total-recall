/** Local job identity and cancellation. A terminal log result is the completion record. */
import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { configDir } from './paths.mjs';
import { createProgress } from './worker.mjs';

const jobsDir = () => path.join(configDir(), 'jobs');
export const newJobId = () => `${Date.now().toString(36)}-${randomUUID().slice(0, 8)}`;

export function startJob(operation, { id = newJobId() } = {}) {
  if (!/^[a-z0-9-]+$/.test(id)) throw new Error('Invalid job ID.');
  const directory = jobsDir();
  fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
  const log = path.join(directory, `${id}.log`);
  const pidFile = path.join(directory, `${id}.pid`);
  const record = { job: id, pid: process.pid, operation, startedAt: new Date().toISOString() };
  fs.appendFileSync(log, `${JSON.stringify(record)}\n`, { mode: 0o600 });
  fs.writeFileSync(pidFile, `${process.pid}\n`, { mode: 0o600, flag: 'wx' });
  const progress = createProgress({ file: path.join(directory, `${id}.events.jsonl`), harness: operation });
  return { ...record, log, finish(result) {
    progress.close(result);
    fs.appendFileSync(log, `${JSON.stringify(result)}\n`, { mode: 0o600 });
    fs.rmSync(pidFile, { force: true });
  } };
}

function readJob(log) {
  const lines = fs.readFileSync(log, 'utf8').trim().split('\n');
  let record;
  try { record = JSON.parse(lines[0]); } catch { /* old log without PID */ }
  let result = null;
  for (const line of lines.slice(1).reverse()) {
    try {
      const value = JSON.parse(line);
      if (typeof value.ok === 'boolean') { result = value; break; }
    } catch { /* progress text */ }
  }
  return { record, result };
}

export function resolveJob(target) {
  if (!target) throw new Error('cancel requires a job ID or log path.');
  const directory = jobsDir();
  const prefix = path.basename(target).replace(/\.(?:log|pid|events\.jsonl|status\.json)$/, '');
  const files = fs.existsSync(directory) ? fs.readdirSync(directory) : [];
  let names = files.filter(name => name.endsWith('.log') && name.startsWith(prefix));
  if (!names.length) {
    // An attempt ID from watch resolves to its owning job, never directly to a PID.
    const events = files.filter(name => name.endsWith('.events.jsonl') && name.startsWith(prefix))
      .sort((a, b) => fs.statSync(path.join(directory, b)).mtimeMs - fs.statSync(path.join(directory, a)).mtimeMs);
    let pid;
    try { pid = JSON.parse(fs.readFileSync(path.join(directory, events[0].replace('.events.jsonl', '.status.json')), 'utf8')).pid; } catch { /* no matching status */ }
    if (pid) names = files.filter(name => name.endsWith('.log') && readJob(path.join(directory, name)).record?.pid === pid);
  }
  const exact = names.find(name => name === `${prefix}.log`);
  if (!names.length) throw new Error(`No job log matches ${target}.`);
  if (!exact && names.length > 1) throw new Error(`More than one job matches ${target}. Use a longer job ID.`);
  const log = path.join(directory, exact || names[0]);
  return { id: path.basename(log, '.log'), log, ...readJob(log) };
}

export async function cancelJob(target, { timeoutMs = 60_000, pollMs = 100 } = {}) {
  const job = resolveJob(target);
  if (job.result) throw new Error(`Job ${job.id} has finished${job.result.cancelled ? ' (cancelled)' : ''}.`);
  const pidFile = path.join(jobsDir(), `${job.id}.pid`);
  let pid;
  try { pid = Number(fs.readFileSync(pidFile, 'utf8').trim()); } catch { /* stale or old job */ }
  if (!Number.isSafeInteger(pid) || pid <= 1 || job.record?.pid !== pid || job.record?.job !== job.id) {
    throw new Error(`Job ${job.id} has no active PID record.`);
  }
  try { process.kill(pid, 'SIGTERM'); }
  catch (error) { throw new Error(`Cannot cancel job ${job.id}: ${error.code === 'ESRCH' ? 'the process has stopped' : error.message}.`); }
  const deadline = Date.now() + Math.min(timeoutMs, 60_000);
  do {
    const { result } = readJob(job.log);
    if (result) {
      if (!result.cancelled) throw new Error(`Job ${job.id} finished before it could be cancelled.`);
      return { ...result, job: job.id, log: job.log };
    }
    await new Promise(resolve => setTimeout(resolve, pollMs));
  } while (Date.now() < deadline);
  throw new Error(`Job ${job.id} did not report cancellation within ${Math.min(timeoutMs, 60_000) / 1000} seconds. Log: ${job.log}`);
}
