/** Native plugin persistence contract. Domain validation belongs to the owner. */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createKernel } from '@ssss/cli/kernel';
import { FileSystemVfs } from '@ssss/cli/vfs';
import { JsonlEventStore } from '@ssss/cli/events';
import { FileIdempotencyStore } from '@ssss/cli/idempotency';
import { FileLeaseStore } from '@ssss/cli/leases';
import { loadRegistries, composeRegistryLayers } from '@ssss/cli/registry';
import { createValidator } from '@ssss/cli/validator';
import { parseDocument, serializeDocument } from '@ssss/cli/frontmatter';

const worker = fileURLToPath(import.meta.url);
const ownerPattern = /^[a-z][a-z0-9-]{0,63}$/;
// A ledger is a chain of documents, so one append never costs more than this much history.
const LEDGER_SEGMENT_BYTES = 1024 * 1024;
const MAX_APPEND_BATCH = 500;
const WORKER_TIMEOUT_MS = 30000;
const WORKER_BUFFER_BYTES = 16 * 1024 * 1024;
const IDEMPOTENCY_PRUNE_ONE_IN = 500;
const registry = composeRegistryLayers({ core: loadRegistries().core, installed: [{
  registry: 'plugin-store', extends: 'ssss', version: '1.0.0', document_primitives: {
    state: { family: 'host', append_only: false, portability: 'tenant_private',
      required_fields: ['type', 'title', 'description', 'timestamp', 'plugin', 'format'],
      immutable_fields: ['plugin', 'format'], enums: { format: ['json'] },
      patterns: { plugin: '^[a-z][a-z0-9-]{0,63}$' } },
    ledger: { family: 'host', append_only: true, portability: 'tenant_private',
      required_fields: ['type', 'title', 'description', 'timestamp', 'plugin', 'format'],
      immutable_fields: ['plugin', 'format'], enums: { format: ['jsonl'] },
      patterns: { plugin: '^[a-z][a-z0-9-]{0,63}$' } },
  },
}] });
const validator = createValidator({ registrySet: registry });

function location(file, plugin) {
  if (!ownerPattern.test(plugin)) throw new Error('Explicit valid plugin identity required');
  if (typeof file !== 'string' || !path.isAbsolute(file)) throw new Error('Explicit absolute plugin state path required');
  const root = path.join(path.dirname(file), '.ssss');
  return { root, relative: segmentPath(file, plugin, 0) };
}
/** Segment 0 keeps the document's original path, so existing ledgers need no migration. */
function segmentPath(file, plugin, segment) {
  const name = segment === 0 ? path.basename(file) : `${path.basename(file)}#${segment}`;
  return `${plugin}/${crypto.createHash('sha256').update(name).digest('hex')}.md`;
}
function lastSegment(root, file, plugin) {
  let segment = 0;
  while (fs.lstatSync(path.join(root, segmentPath(file, plugin, segment + 1)), { throwIfNoEntry: false })) segment += 1;
  return segment;
}
/** The segment an append writes to. Runs under the mutation guard. */
function activeSegment(root, file, plugin, limit) {
  const segment = lastSegment(root, file, plugin);
  const relative = segmentPath(file, plugin, segment);
  const stat = fs.lstatSync(path.join(root, relative), { throwIfNoEntry: false });
  if (!stat || stat.size < limit) return segment;
  // Refuse to seal a state document as if it were ledger history.
  if (readCurrent(root, relative, plugin)?.data.type !== 'plugin-store:ledger') throw new Error('Plugin ledger is not append-only');
  return segment + 1;
}
const guardOwnerFile = lock => path.join(lock, 'owner');
function readGuardOwner(lock) {
  try { return fs.readFileSync(guardOwnerFile(lock), 'utf8').trim(); } catch { return null; }
}
function processIsDead(pid) {
  if (!Number.isInteger(pid) || pid < 1) return false;
  try { process.kill(pid, 0); return false; } catch (error) { return error.code === 'ESRCH'; }
}
/**
 * A worker killed mid-mutation, by a service restart for one, leaves its guard
 * behind, and every later mutation then fails. Reclaim only a guard whose owner
 * is provably gone. One with no owner is honored until it is older than any
 * worker can live, since a holder may be between creating it and naming itself.
 */
function guardIsAbandoned(lock, stat, now = Date.now()) {
  const owner = readGuardOwner(lock);
  if (owner) return processIsDead(Number(owner));
  return now - stat.mtimeMs > WORKER_TIMEOUT_MS * 2;
}
function reclaimGuard(lock) {
  const owner = readGuardOwner(lock);
  const aside = `${lock}.abandoned.${crypto.randomUUID()}`;
  try { fs.renameSync(lock, aside); } catch (error) { if (error.code === 'ENOENT') return; throw error; }
  // A new holder took the guard between the check and the rename: give it back.
  if (readGuardOwner(aside) !== owner) { fs.renameSync(aside, lock); return; }
  fs.rmSync(aside, { recursive: true, force: true });
}
function documentVersion(root, relative) {
  return crypto.createHash('sha256').update(fs.readFileSync(path.join(root, relative), 'utf8')).digest('hex');
}
function safeRoot(root, create = false) {
  const stat = fs.lstatSync(root, { throwIfNoEntry: false });
  if (stat && (stat.isSymbolicLink() || !stat.isDirectory())) throw new Error('Plugin vault root must be a real directory');
  if (!stat && create) fs.mkdirSync(root, { recursive: true, mode: 0o700 });
  return stat || create;
}
function readCurrent(root, relative, plugin) {
  if (!safeRoot(root)) return null;
  const parent = path.join(root, plugin);
  const pstat = fs.lstatSync(parent, { throwIfNoEntry: false });
  if (pstat && (pstat.isSymbolicLink() || !pstat.isDirectory())) throw new Error('Unsafe plugin namespace');
  const target = path.join(root, relative);
  const stat = fs.lstatSync(target, { throwIfNoEntry: false });
  if (!stat) return null;
  if (stat.isSymbolicLink() || !stat.isFile()) throw new Error('Unsafe plugin state document');
  const content = fs.readFileSync(target, 'utf8');
  const check = validator.validateDocument(content);
  if (!check.valid) throw new Error(`Invalid SSSS plugin state: ${check.errors.join('; ')}`);
  const parsed = parseDocument(content);
  if (!['plugin-store:state', 'plugin-store:ledger'].includes(parsed.data.type) || parsed.data.plugin !== plugin) throw new Error('Plugin state ownership mismatch');
  const value = parsed.data.format === 'jsonl' ? parsed.body.split('\n').filter(s => s.trim()).map(s => JSON.parse(s)) : JSON.parse(parsed.body);
  return { data: parsed.data, value, version: crypto.createHash('sha256').update(content).digest('hex') };
}

/** Asynchronous native kernel entry. This is not exposed as a public server route. */
export async function executePluginState(request) {
  const { file, plugin, action, value, values, expectedVersion, idempotencyKey = crypto.randomUUID() } = request;
  const { root, relative } = location(file, plugin);
  safeRoot(root, true);
  for (const name of ['.events', '.idempotency', '.leases']) {
    const stat = fs.lstatSync(path.join(root, name), { throwIfNoEntry: false });
    if (stat && (stat.isSymbolicLink() || !stat.isDirectory())) throw new Error('Unsafe SSSS infrastructure directory');
  }
  // A guard serializes state read/compare/commit across native worker processes.
  const lock = path.join(root, '.mutation-lock');
  const guardTimeoutMs = request.guardTimeoutMs ?? 5000;
  if (!Number.isInteger(guardTimeoutMs) || guardTimeoutMs < 1 || guardTimeoutMs > 5000) throw new Error('Invalid plugin guard timeout');
  const deadline = performance.now() + guardTimeoutMs;
  for (;;) {
  try {
    fs.mkdirSync(lock, { mode: 0o700 });
    fs.writeFileSync(guardOwnerFile(lock), String(process.pid), { mode: 0o600 });
    break;
  } catch (err) {
    // Distinguish a genuine concurrent mutation from an environment failure so
    // callers are not told the store is busy when it is actually inaccessible.
    if (err && err.code === 'EEXIST') {
      const stat = fs.lstatSync(lock, { throwIfNoEntry: false });
      if (!stat) continue;
      if (stat.isSymbolicLink() || !stat.isDirectory()) throw new Error('Unsafe plugin mutation guard');
      if (guardIsAbandoned(lock, stat)) { reclaimGuard(lock); continue; }
      if (performance.now() >= deadline) throw new Error('Plugin state mutation is busy; timed out waiting for the guard');
      await new Promise(resolve => setTimeout(resolve, 20));
      continue;
    }
    if (err && (err.code === 'EACCES' || err.code === 'EPERM' || err.code === 'EROFS')) {
      throw new Error(
        `Plugin state store is not writable (${err.code}): cannot create the mutation guard at ${lock}. ` +
        'Grant write access to this brain root, or point TR_SECRETS_BRAIN at a store you can write to.'
      );
    }
    throw new Error(`Plugin state mutation guard could not be created at ${lock}: ${err?.message || err}`);
  }
  }
  try {
    const durableKeys = new FileIdempotencyStore(path.join(root, '.idempotency'));
    const rows = action === 'append' ? (values ?? [value]) : null;
    if (rows && (!Array.isArray(rows) || rows.length === 0)) throw new Error('Plugin ledger append requires at least one row');
    const segmentLimit = request.segmentBytes ?? LEDGER_SEGMENT_BYTES;
    if (!Number.isInteger(segmentLimit) || segmentLimit < 1) throw new Error('Invalid plugin ledger segment size');
    // Hashed against the first segment, so a retry that crosses a rollover still replays.
    const intentHash = crypto.createHash('sha256').update(JSON.stringify({ path: relative, action, value: rows ?? value, expectedVersion, format: request.format })).digest('hex');
    const replay = await durableKeys.get(plugin, idempotencyKey);
    if (replay) {
      if (replay.intent_hash !== intentHash) throw new Error('Plugin state idempotency conflict');
      const replayed = replay.response?.path || relative;
      return { version: documentVersion(root, replayed), receipt: { ...replay.response, replay: true } };
    }
    const target = rows ? segmentPath(file, plugin, activeSegment(root, file, plugin, segmentLimit)) : relative;
    const current = readCurrent(root, target, plugin);
    if (action !== 'append' && expectedVersion !== (current?.version ?? null)) throw new Error('Plugin state version conflict; reload before retrying');
    let next = value;
    const ledger = action === 'append' || request.format === 'jsonl';
    if (action === 'append') {
      if (current && current.data.type !== 'plugin-store:ledger') throw new Error('Plugin ledger is not append-only');
      next = [...(current?.value || []), ...rows];
    } else if (action !== 'write') throw new Error('Unsupported plugin state operation');
    const body = ledger ? next.map(item => JSON.stringify(item)).join('\n') : JSON.stringify(next, null, 2);
    if (typeof body !== 'string') throw new Error('Plugin state must be JSON serializable');
    const leases = new FileLeaseStore(path.join(root, '.leases'));
    const kernel = createKernel({ validator, vfs: new FileSystemVfs(root),
      eventStore: new JsonlEventStore(path.join(root, '.events')),
      idempotencyStore: { get: (...args) => durableKeys.get(...args),
        put: (workspace, key, entry) => durableKeys.put(workspace, key, { ...entry, intent_hash: intentHash }) },
      leaseStore: leases });
    const principal = { id: `plugin:${plugin}`, kind: 'service', workspaceIds: [plugin],
      capabilities: ['plugin-store:state:*', 'plugin-store:ledger:*', 'write:event'],
      authentication: { provider: 'native-plugin-host', assurance: 'verified' } };
    const content = serializeDocument({ ...current?.data, type: ledger ? 'plugin-store:ledger' : 'plugin-store:state', plugin, format: ledger ? 'jsonl' : 'json',
      title: current?.data.title || `${plugin} state`, description: current?.data.description || 'Plugin-owned persistent state',
      timestamp: new Date().toISOString() }, `${body}\n`);
    const envelope = action === 'append' && current
      ? { type: 'patch', patches: { __body__: `${rows.map(row => JSON.stringify(row)).join('\n')}\n` } }
      : { type: 'operation', content };
    const operationId = crypto.randomUUID();
    const leaseInput = { workspace_id: plugin, target, principal_id: principal.id, operation_id: operationId };
    const lease = await leases.acquire(leaseInput, 30000);
    let result;
    try {
      const operation = { ...envelope, workspace_id: plugin, path: target, operation_id: operationId,
        lease_id: lease.lease_id, idempotency_key: idempotencyKey };
      const preflight = await kernel.execute({ ...operation, dry_run: true }, { principal, requireLease: true });
      if (!preflight.success) throw new Error(`SSSS preflight rejected: ${preflight.error?.code}: ${preflight.error?.message}`);
      result = await kernel.execute(operation, { principal, requireLease: true });
      if (!result.success) throw new Error(`SSSS mutation rejected: ${result.error?.code}: ${result.error?.message}`);
    } finally { await leases.release({ ...leaseInput, lease_id: lease.lease_id }); }
    // The store's own prune counter never advances in a one-shot worker.
    if (crypto.randomInt(IDEMPOTENCY_PRUNE_ONE_IN) === 0) durableKeys.prune();
    return { version: documentVersion(root, target), receipt: result };
  } finally { fs.rmSync(lock, { recursive: true, force: true }); }
}

function nativeWrite(request) {
  const child = spawnSync(process.execPath, [worker, '--native-state-worker'], {
    input: JSON.stringify(request), encoding: 'utf8', timeout: WORKER_TIMEOUT_MS, maxBuffer: WORKER_BUFFER_BYTES,
    // No provider credentials or ambient brain selection cross this transport.
    env: { PATH: process.env.PATH || '', NODE_NO_WARNINGS: '1' },
  });
  if (child.error || child.status !== 0) throw new Error(child.stderr?.trim() || child.error?.message || 'Native SSSS worker failed');
  return JSON.parse(child.stdout);
}

/** The same worker as nativeWrite, off the caller's thread. */
function nativeWriteAsync(request) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [worker, '--native-state-worker'], {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { PATH: process.env.PATH || '', NODE_NO_WARNINGS: '1' },
    });
    let stdout = '', stderr = '', settled = false;
    const settle = (fn, arg) => { if (!settled) { settled = true; clearTimeout(timer); fn(arg); } };
    const timer = setTimeout(() => { child.kill('SIGKILL'); settle(reject, new Error('Native SSSS worker timed out')); }, WORKER_TIMEOUT_MS);
    const overflow = () => { child.kill('SIGKILL'); settle(reject, new Error('Native SSSS worker output exceeds limit')); };
    child.stdout.setEncoding('utf8').on('data', chunk => { stdout += chunk; if (stdout.length > WORKER_BUFFER_BYTES) overflow(); });
    child.stderr.setEncoding('utf8').on('data', chunk => { if (stderr.length < WORKER_BUFFER_BYTES) stderr += chunk; });
    child.on('error', error => settle(reject, error));
    // A worker that dies early closes stdin; its exit status carries the failure.
    child.stdin.on('error', () => {});
    child.on('close', (code, signal) => {
      if (code !== 0) return settle(reject, new Error(stderr.trim() || `Native SSSS worker failed (${signal || code})`));
      try { settle(resolve, JSON.parse(stdout)); } catch (error) { settle(reject, error); }
    });
    child.stdin.end(JSON.stringify(request));
  });
}

const appendQueues = new Map();
async function drainAppends(queueKey, queue, file, plugin) {
  while (queue.pending.length) {
    const batch = queue.pending.splice(0, MAX_APPEND_BATCH);
    try {
      const result = await nativeWriteAsync({ file, plugin, action: 'append', values: batch.map(item => item.value) });
      for (const item of batch) item.resolve(result);
    } catch (error) {
      for (const item of batch) item.reject(error);
    }
  }
  appendQueues.delete(queueKey);
}
/** Rows queued while a worker runs go together in the next one. */
function queueAppend(file, plugin, value) {
  const queueKey = JSON.stringify([file, plugin]);
  return new Promise((resolve, reject) => {
    const existing = appendQueues.get(queueKey);
    if (existing) { existing.pending.push({ value, resolve, reject }); return; }
    const queue = { pending: [{ value, resolve, reject }] };
    appendQueues.set(queueKey, queue);
    drainAppends(queueKey, queue, file, plugin);
  });
}

/** Enumerate one explicit native namespace; malformed or linked entries fail closed. */
export function listPluginStates(directory, plugin) {
  const { root } = location(path.join(path.resolve(directory), 'scope'), plugin);
  if (!safeRoot(root)) return [];
  const namespace = path.join(root, plugin);
  const stat = fs.lstatSync(namespace, { throwIfNoEntry: false });
  if (!stat) return [];
  if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error('Unsafe plugin namespace');
  return fs.readdirSync(namespace).map(name => {
    if (!/^[a-f0-9]{64}\.md$/.test(name)) throw new Error('Unexpected plugin state entry');
    return readCurrent(root, `${plugin}/${name}`, plugin);
  });
}

export class PluginStateStore {
  constructor(file, plugin) { this.file = path.resolve(file); this.plugin = plugin; this.location = location(this.file, plugin); this.version = undefined; }
  get documentPath() { return path.join(this.location.root, this.location.relative); }
  read(fallback) {
    const { root, relative } = this.location;
    const current = readCurrent(root, relative, this.plugin);
    this.version = current?.version ?? null;
    if (!current) return structuredClone(fallback);
    if (current.data.type !== 'plugin-store:ledger') return structuredClone(current.value);
    const rows = [...current.value];
    for (const segment of this.#laterSegments(1)) rows.push(...this.#segment(segment));
    return rows;
  }
  /** The newest rows of a ledger, reading only as many documents as that takes. */
  readTail(limit) {
    if (!Number.isInteger(limit) || limit < 1) throw new Error('Invalid plugin ledger tail limit');
    const { root } = this.location;
    if (!safeRoot(root)) return [];
    let rows = [];
    for (let segment = lastSegment(root, this.file, this.plugin); segment >= 0 && rows.length < limit; segment -= 1) {
      rows = [...this.#segment(segment), ...rows];
    }
    return rows.slice(-limit);
  }
  #laterSegments(from) {
    const last = lastSegment(this.location.root, this.file, this.plugin);
    return Array.from({ length: Math.max(0, last - from + 1) }, (_, index) => from + index);
  }
  #segment(segment) {
    const current = readCurrent(this.location.root, segmentPath(this.file, this.plugin, segment), this.plugin);
    if (!current) return [];
    if (current.data.type !== 'plugin-store:ledger') throw new Error('Plugin state is not a ledger');
    return current.value;
  }
  write(value, options = {}) {
    if (this.version === undefined) this.read(null);
    const result = nativeWrite({ file: this.file, plugin: this.plugin, action: 'write', value,
      expectedVersion: this.version, idempotencyKey: options.idempotencyKey, format: options.format });
    this.version = result.version;
    return result.receipt;
  }
  append(value, options = {}) {
    const result = nativeWrite({ file: this.file, plugin: this.plugin, action: 'append', value, idempotencyKey: options.idempotencyKey });
    this.version = result.version;
    return result.receipt;
  }
  /** Append without blocking the event loop. Resolves once the row is committed. */
  async appendAsync(value) {
    const result = await queueAppend(this.file, this.plugin, value);
    this.version = result.version;
    return result.receipt;
  }
}

if (process.argv[1] === worker && process.argv[2] === '--native-state-worker') {
  let input = '';
  for await (const chunk of process.stdin) { input += chunk; if (input.length > 16 * 1024 * 1024) throw new Error('Plugin state input exceeds limit'); }
  try { process.stdout.write(JSON.stringify(await executePluginState(JSON.parse(input)))); }
  catch (error) { process.stderr.write(error.message); process.exitCode = 1; }
}
