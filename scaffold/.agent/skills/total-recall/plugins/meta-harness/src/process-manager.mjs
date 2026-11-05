/** Managed agent processes. Metadata is SSSS state; native dispatch is always receipt-bearing. */
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { PluginStateStore } from './ssss-store.mjs';
import { configDir, brainDir } from './paths.mjs';
import { agentEnvironment } from './worker.mjs';
import { normalizeToolSelection, validateHarnessOptions, shellQuote } from './compat-harness.mjs';
import { createWorktree, removeWorktree, deleteBranch, commitAll, headCommit, isGitRepo } from './worktree.mjs';

const workerFile = fileURLToPath(new URL('./process-worker.mjs', import.meta.url));
const logDirectory = () => path.join(brainDir(), 'logs', 'meta-harness', 'agents');
const stateStore = () => new PluginStateStore(path.join(configDir(), 'processes.json'), 'meta-harness');
const validId = id => typeof id === 'string' && /^agent-[a-z0-9-]{1,120}$/.test(id);

function validateRecords(value) {
  if (!Array.isArray(value) || value.some(record => !record || !validId(record.id) || typeof record.harness !== 'string' || typeof record.status !== 'string')) throw new Error('Invalid managed agent state');
  return value;
}
export function loadAgentState() { return validateRecords(stateStore().read([])); }
export function saveAgentState(value) { const store = stateStore(); store.read([]); store.write(validateRecords(value)); }

/** Compare-and-write retries preserve concurrent processes; the native store enforces ownership. */
export function updateAgentRecord(id, patch) {
  if (!validId(id)) throw new Error('Invalid agent identifier');
  for (let attempt = 0; attempt < 5; attempt++) {
    const store = stateStore(), records = validateRecords(store.read([]));
    const index = records.findIndex(record => record.id === id);
    const before = index < 0 ? { id } : records[index];
    const record = { ...before, ...patch, id };
    if (index < 0) records.unshift(record); else records[index] = record;
    try { store.write(validateRecords(records)); return record; }
    catch (error) { if (!/version|conflict|changed|precondition/i.test(error.message) || attempt === 4) throw error; }
  }
}

export function isProcessRunning(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try { process.kill(pid, 0); return true; } catch { return false; }
}
function processIdentity(pid) {
  if (!isProcessRunning(pid)) return null;
  const result = spawnSync('ps', ['-p', String(pid), '-o', 'lstart=,command='], { encoding: 'utf8', timeout: 3000 });
  if (result.status !== 0 || !result.stdout.trim()) return null;
  return { text: result.stdout.trim(), hash: crypto.createHash('sha256').update(result.stdout.trim()).digest('hex') };
}
function ownsProcess(record) {
  const identity = processIdentity(record.pid);
  return Boolean(identity && identity.text.includes(workerFile) && identity.text.includes(record.id) && identity.hash === record.processIdentity);
}
export function listAgents() {
  return loadAgentState().map(record => {
    if (record.remote || !['starting', 'running'].includes(record.status)) return record;
    if (!record.pid) return { ...record, status: 'starting' };
    return ownsProcess(record) ? record : { ...record, status: 'stopped', statusNote: 'Managed worker is no longer running' };
  });
}

function findAgent(idOrPid) {
  const record = loadAgentState().find(item => item.id === idOrPid || String(item.pid) === String(idOrPid));
  if (!record) throw new Error(`Agent "${idOrPid}" not found`);
  return record;
}

export function buildRemoteSpawnCommand(id, prompt, options = {}) {
  const args = ['total-recall', 'meta-harness', 'process', 'spawn', id, prompt];
  for (const [key, flag] of [['name', '--name'], ['cwd', '--cwd'], ['tools', '--tools'], ['settingSources', '--setting-sources'], ['model', '--model']]) {
    if (options[key] !== undefined && options[key] !== null) args.push(flag, Array.isArray(options[key]) ? options[key].join(',') : String(options[key]));
  }
  if (options.detach === false) args.push('--no-detach');
  if (options.write === false) args.push('--read-only');
  if (options.allowUnknownAuth === true) args.push('--allow-unknown-auth');
  args.push('--json');
  return args.map(shellQuote).join(' ');
}

async function remoteCall(node, cwd, args, dependencies = {}) {
  const { executeOnNode } = await import('./executor.mjs');
  const result = await (dependencies.executeOnNode || executeOnNode)(node, { operation: 'direct', cwd, argv: ['total-recall', 'meta-harness', 'process', ...args, '--json'] });
  if (!result.ok) throw new Error(result.error || result.stderr || 'Remote process operation failed');
  try { return JSON.parse(result.stdout || result.output || result.response); }
  catch { throw new Error('Remote process owner returned invalid JSON'); }
}

export async function spawnAgent(harness, task, options = {}, dependencies = {}) {
  validateHarnessOptions(harness, options);
  if (typeof task !== 'string' || !task.trim() || Buffer.byteLength(task) > 65536) throw new Error('A bounded nonempty agent task is required');
  if (options.node && options.node !== 'local') {
    if (typeof options.cwd !== 'string' || (!path.posix.isAbsolute(options.cwd) && !path.win32.isAbsolute(options.cwd))) throw new Error('Choose an explicit absolute workspace on the remote node');
    const requested = options.cwd;
    const args = ['spawn', harness, task, '--cwd', requested];
    for (const [key, flag] of [['name', '--name'], ['tools', '--tools'], ['settingSources', '--setting-sources'], ['model', '--model']]) if (options[key] !== undefined) args.push(flag, Array.isArray(options[key]) ? options[key].join(',') : String(options[key]));
    if (options.detach === false) args.push('--no-detach');
    if (options.write === false) args.push('--read-only');
    if (options.allowUnknownAuth === true) args.push('--allow-unknown-auth');
    const result = await remoteCall(options.node, requested, args, dependencies);
    if (!validId(result.id)) throw new Error('Remote process owner returned no valid agent identifier');
    return updateAgentRecord(result.id, { ...result, harness, node: options.node, cwd: requested, remote: true });
  }
  const requested = options.cwd || process.cwd();
  const cwd = path.resolve(/^~(?=$|\/)/.test(requested) ? path.join(os.homedir(), requested.slice(1)) : requested);
  if (!fs.existsSync(cwd) || !fs.statSync(cwd).isDirectory()) throw new Error(`Working directory does not exist: ${cwd}`);
  if (options.write !== false && !isGitRepo(cwd)) throw new Error('Writing agent processes require a git repository for isolation');
  const id = `agent-${harness}-${crypto.randomUUID()}`;
  fs.mkdirSync(logDirectory(), { recursive: true, mode: 0o700 });
  const logFile = path.join(logDirectory(), `${id}.log`);
  const logFd = fs.openSync(logFile, 'ax', 0o600);
  updateAgentRecord(id, { harness, name: options.name || `${harness} Worker`, task, cwd, logFile,
    status: 'starting', startedAt: new Date().toISOString(), tools: normalizeToolSelection(options.tools) ?? 'default', detached: options.detach !== false });
  const env = { ...agentEnvironment(process.env) };
  for (const key of ['AGENT_DIR', 'TR_SECRETS_BRAIN', 'TR_PACKAGE_ROOT', 'TOTAL_RECALL_BIN']) if (process.env[key]) env[key] = process.env[key];
  let child, completion;
  try {
    child = (dependencies.spawn || spawn)(process.execPath, [workerFile, '--job', id], { cwd, env, detached: true, stdio: ['pipe', logFd, logFd] });
    completion = new Promise((resolve, reject) => {
      child.once('error', reject);
      child.once('close', code => resolve(code));
    });
    // Attach error handling before returning even for a detached process.
    completion.catch(error => updateAgentRecord(id, { status: 'failed', error: error.message, endedAt: new Date().toISOString() }));
    await new Promise((resolve, reject) => { child.once('spawn', resolve); child.once('error', reject); });
    const identity = (dependencies.identity || processIdentity)(child.pid);
    if (!identity) throw new Error('Cannot establish managed process identity');
    updateAgentRecord(id, { pid: child.pid, processIdentity: identity.hash, status: 'running' });
    child.stdin.on('error', error => { updateAgentRecord(id, { status: 'failed', error: `Worker input failed: ${error.message}`, endedAt: new Date().toISOString() }); });
    child.stdin.end(JSON.stringify({ id, harness, task, cwd, options: { write: options.write !== false, tools: options.tools, settingSources: options.settingSources, model: options.model, allowUnknownAuth: options.allowUnknownAuth === true, timeoutMs: options.timeoutMs } }));
  } catch (error) {
    if (child?.pid) { try { child.kill('SIGTERM'); } catch { /* process already stopped */ } }
    updateAgentRecord(id, { status: 'failed', error: error.message, endedAt: new Date().toISOString() });
    throw error;
  } finally { fs.closeSync(logFd); }
  if (options.detach !== false) { child.unref(); return findAgent(id); }
  const code = await completion;
  const result = findAgent(id);
  if (!['completed', 'failed', 'killed'].includes(result.status)) return updateAgentRecord(id, { status: 'failed', exitCode: code, error: 'Managed worker exited without a completion record', endedAt: new Date().toISOString() });
  return { ...result, output: result.result || await getAgentLogs(id, 200) };
}

/** Run inside the managed worker. The original checkout is never writable to the agent. */
export async function executeProcessTask(job, dependencies = {}) {
  const { dispatchWithReceipt } = await import('./dispatch.mjs');
  validateHarnessOptions(job.harness, job.options);
  let worktree = null, branch = null, commit = null;
  let result;
  try {
    let cwd = job.cwd;
    if (job.options.write === true) {
      if (!isGitRepo(job.cwd)) throw new Error('Writing agent processes require a git repository for isolation');
      branch = `meta-harness/${job.id}`;
      const baseCommit = headCommit(job.cwd);
      worktree = createWorktree(job.cwd, { branch, ref: baseCommit, prefix: 'meta-harness-process-' });
      cwd = worktree;
      updateAgentRecord(job.id, { branch, worktreePath: worktree, baseCommit });
    }
    result = await (dependencies.dispatch || dispatchWithReceipt)({
      agent: job.harness, prompt: job.task, cwd, contextCwd: job.cwd, contextTask: job.task,
      isolated: Boolean(worktree), permissions: { read: true, write: job.options.write === true },
      tools: job.options.tools, settingSources: job.options.settingSources, model: job.options.model,
      allowUnknownAuth: job.options.allowUnknownAuth === true, timeoutMs: job.options.timeoutMs,
    }, { role: 'Process', node: 'local' });
    if (result.ok && worktree) commit = commitAll(worktree, 'Meta Harness managed agent work');
  } catch (error) {
    result = { ok: false, error: error.message };
  }
  try {
    if (worktree) { (dependencies.removeWorktree || removeWorktree)(job.cwd, worktree); worktree = null; }
    if (branch && !commit) { (dependencies.deleteBranch || deleteBranch)(job.cwd, branch); branch = null; }
  } catch (error) { result = { ...result, ok: false, error: `${result.error ? result.error + '; ' : ''}Isolation cleanup failed: ${error.message}` }; }
  return updateAgentRecord(job.id, { status: result.ok ? 'completed' : 'failed', exitCode: result.exitCode ?? (result.ok ? 0 : 1), error: result.ok ? null : result.error,
    result: result.response || null, branch, commit, worktreePath: worktree, endedAt: new Date().toISOString() });
}

export async function killAgent(idOrPid, dependencies = {}) {
  const record = findAgent(idOrPid);
  if (record.remote) {
    const result = await remoteCall(record.node, record.cwd, ['kill', record.id], dependencies);
    if (result.success !== true) throw new Error(result.error || 'Remote owner did not confirm termination');
    updateAgentRecord(record.id, { status: 'killed', endedAt: new Date().toISOString() });
    return result;
  }
  if (!isProcessRunning(record.pid)) return { success: true, message: `Agent ${record.id} is already stopped` };
  if (!ownsProcess(record)) throw new Error('Refusing to kill a process whose managed identity cannot be verified');
  const tree = spawnSync('ps', ['-axo', 'pid=,ppid='], { encoding: 'utf8', timeout: 3000 });
  if (tree.status !== 0) throw new Error('Cannot inspect managed process descendants');
  const relations = tree.stdout.trim().split('\n').map(line => line.trim().split(/\s+/).map(Number));
  const targets = [record.pid];
  for (let i = 0; i < targets.length; i++) for (const [pid, parent] of relations) if (parent === targets[i] && !targets.includes(pid)) targets.push(pid);
  const identities = targets.reverse().map(pid => ({ pid, identity: processIdentity(pid)?.hash })).filter(item => item.identity);
  const stillOwned = item => processIdentity(item.pid)?.hash === item.identity;
  for (const item of identities) if (stillOwned(item)) { try { process.kill(item.pid, 'SIGTERM'); } catch (error) { if (error.code !== 'ESRCH') throw error; } }
  await new Promise(resolve => setTimeout(resolve, 200));
  for (const item of identities) if (stillOwned(item)) { try { process.kill(item.pid, 'SIGKILL'); } catch (error) { if (error.code !== 'ESRCH') throw error; } }
  await new Promise(resolve => setTimeout(resolve, 100));
  if (identities.some(stillOwned)) throw new Error('Managed processes did not stop; isolation was retained');
  const stopped = findAgent(record.id);
  if (stopped.worktreePath) removeWorktree(stopped.cwd, stopped.worktreePath);
  if (stopped.branch && !stopped.commit) deleteBranch(stopped.cwd, stopped.branch);
  const { recordRunReceipt } = await import('./learner.mjs');
  await recordRunReceipt({ harness: record.harness, role: 'Process', node: 'local', task: record.task, success: false, failureKind: 'cancelled', finishedReason: 'cancelled' });
  updateAgentRecord(record.id, { status: 'killed', branch: stopped.commit ? stopped.branch : null, worktreePath: null, endedAt: new Date().toISOString() });
  return { success: true, message: `Terminated managed agent ${record.id}` };
}

export async function getAgentLogs(idOrPid, tailLines = 50, dependencies = {}) {
  const record = findAgent(idOrPid);
  if (!Number.isInteger(tailLines) || tailLines < 1 || tailLines > 10000) throw new Error('Log tail must be between 1 and 10000 lines');
  if (record.remote) {
    const result = await remoteCall(record.node, record.cwd, ['logs', record.id, '--tail', String(tailLines)], dependencies);
    if (typeof result.logs !== 'string') throw new Error('Remote owner returned no logs');
    return result.logs;
  }
  if (path.dirname(record.logFile || '') !== logDirectory()) throw new Error('Invalid managed log path');
  const stat = fs.lstatSync(record.logFile, { throwIfNoEntry: false });
  if (!stat) return '';
  if (!stat.isFile() || stat.isSymbolicLink()) throw new Error('Unsafe managed log file');
  const size = Math.min(stat.size, 4 * 1024 * 1024), buffer = Buffer.alloc(size), fd = fs.openSync(record.logFile, 'r');
  try { fs.readSync(fd, buffer, 0, size, stat.size - size); } finally { fs.closeSync(fd); }
  return buffer.toString('utf8').split('\n').slice(-tailLines).join('\n');
}
