/** Continue a stored job on its branch, without reusing a deleted checkout. */
import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { configDir } from './paths.mjs';
import { resolveJob } from './jobs.mjs';
import { appendCommand, jobPaths } from './control.mjs';
import { createWorktree, removeWorktree, commitAll, isDirty, provideDependencies } from './worktree.mjs';
import { dispatchWithReceipt } from './dispatch.mjs';

export async function continueJob(target, text, { fork = false, atTurn, dispatchFn, execFileFn = promisify(execFile), timeoutMs = 30000 } = {}) {
  const job = resolveJob(target);
  if (!fork && !job.result) throw new Error('Resume requires a finished job; use reply for a running job.');
  if (typeof text !== 'string' || !text.trim()) throw new Error('A continuation message is required.');
  const owner = job.result?.execution?.node || job.record?.node;
  if (owner && owner !== 'local') {
    const quote = value => `'${String(value).replaceAll("'", "'\\''")}'`;
    const argv = [fork ? 'fork' : 'resume', job.result?.execution?.remoteJob || job.record?.remoteJob || job.id, ...(fork ? atTurn ? ['--at', atTurn] : [] : [text]), '--json'];
    const report = await execFileFn(process.env.TOTAL_RECALL_BIN || 'total-recall', ['mesh', 'exec', owner,
      `total-recall meta-harness ${argv.map(quote).join(' ')}`], { encoding: 'utf8', timeout: 600000 });
    return JSON.parse(report.stdout);
  }
  const attempt = job.result?.attempts?.at(-1) || job.result;
  const file = attempt?.progressFile || job.result?.progressFile || path.join(configDir(), 'jobs', `${job.id}.events.jsonl`);
  let saved, status;
  try {
    saved = JSON.parse(fs.readFileSync(file.replace('.events.jsonl', '.session.json'), 'utf8'));
    status = JSON.parse(fs.readFileSync(file.replace('.events.jsonl', '.status.json'), 'utf8'));
  } catch { throw new Error('This job has no stored session.'); }
  let sessionId = attempt?.sessionId || status.session_id;
  if (!sessionId) throw new Error('This job has no resumable session ID.');
  if (fork && !job.result) {
    const delivery = await appendCommand(job.id, { type: 'fork', atTurn });
    const deadline = Date.now() + timeoutMs;
    let event;
    while (!event && Date.now() < deadline) {
      const rows = fs.readFileSync(jobPaths(job.id).events, 'utf8').trim().split('\n').filter(Boolean).map(JSON.parse);
      const ack = rows.find(row => row.commandId === delivery.command.id && row.kind === 'ack');
      if (ack?.ok === false) throw new Error(ack.text);
      event = rows.find(row => row.commandId === delivery.command.id && row.kind === 'fork');
      if (!event) await new Promise(resolve => setTimeout(resolve, 20));
    }
    if (!event?.sessionId) throw new Error('Fork did not return a session ID before the timeout.');
    sessionId = event.sessionId;
  }
  const parentBranch = attempt?.branch || job.result?.branch || saved.branch;
  if (!fork && (!parentBranch || !parentBranch.startsWith('meta-harness/'))) {
    // A dispatch job worked in its own folder and has no job branch: resume it there, as it ran (A-123).
    if (!saved.workspace) throw new Error('This job has no saved job branch or workspace.');
    const result = await dispatchWithReceipt({ ...saved.request, sessionId, cwd: saved.workspace, contextCwd: saved.workspace,
      contextTask: text, prompt: text, permissions: saved.request?.permissions || { read: true, write: true } },
      { dispatchFn, role: 'Resume' });
    return { ...result, parentJob: job.id, workspace: saved.workspace };
  }
  const branch = fork ? `meta-harness/fork-${randomUUID()}` : parentBranch;
  const cwd = saved.workspace;
  const directory = createWorktree(cwd, { branch, existingBranch: !fork, ref: parentBranch || 'HEAD' });
  let result, keep = false;
  try {
    provideDependencies(cwd, directory);
    result = await dispatchWithReceipt({ ...saved.request, sessionId, forkSession: fork && Boolean(job.result), atTurn,
      cwd: directory, contextCwd: cwd, contextTask: text, prompt: text, isolated: true,
      permissions: { read: true, write: true } }, { dispatchFn, role: fork ? 'Fork' : 'Resume' });
    const commit = commitAll(directory, `meta-harness: ${fork ? 'fork' : 'resume'} ${job.id}`);
    return { ...result, parentJob: job.id, branch, ...(commit ? result.ok ? { commit } : { wip: commit } : {}) };
  } catch (error) {
    keep = isDirty(directory);
    return { ok: false, error: error.message, branch, ...(keep ? { keptWorktree: directory } : {}) };
  } finally { if (!keep) removeWorktree(cwd, directory); }
}
