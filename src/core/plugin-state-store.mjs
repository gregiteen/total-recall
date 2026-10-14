/** Native plugin persistence contract. Domain validation belongs to the owner. */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
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
  const id = crypto.createHash('sha256').update(path.basename(file)).digest('hex');
  return { root, relative: `${plugin}/${id}.md` };
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
  const { file, plugin, action, value, expectedVersion, idempotencyKey = crypto.randomUUID() } = request;
  const { root, relative } = location(file, plugin);
  safeRoot(root, true);
  for (const name of ['.events', '.idempotency', '.leases']) {
    const stat = fs.lstatSync(path.join(root, name), { throwIfNoEntry: false });
    if (stat && (stat.isSymbolicLink() || !stat.isDirectory())) throw new Error('Unsafe SSSS infrastructure directory');
  }
  // A guard serializes state read/compare/commit across native worker processes.
  const lock = path.join(root, '.mutation-lock');
  try { fs.mkdirSync(lock, { mode: 0o700 }); }
  catch { throw new Error('Plugin state mutation is busy or its ownership guard is unreadable'); }
  try {
    const durableKeys = new FileIdempotencyStore(path.join(root, '.idempotency'));
    const intentHash = crypto.createHash('sha256').update(JSON.stringify({ path: relative, action, value, expectedVersion, format: request.format })).digest('hex');
    const replay = await durableKeys.get(plugin, idempotencyKey);
    if (replay) {
      if (replay.intent_hash !== intentHash) throw new Error('Plugin state idempotency conflict');
      return { ...readCurrent(root, relative, plugin), receipt: { ...replay.response, replay: true } };
    }
    const current = readCurrent(root, relative, plugin);
    if (action !== 'append' && expectedVersion !== (current?.version ?? null)) throw new Error('Plugin state version conflict; reload before retrying');
    let next = value;
    const ledger = action === 'append' || request.format === 'jsonl';
    if (action === 'append') {
      if (current && current.data.type !== 'plugin-store:ledger') throw new Error('Plugin ledger is not append-only');
      next = [...(current?.value || []), value];
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
      ? { type: 'patch', patches: { __body__: `${JSON.stringify(value)}\n` } }
      : { type: 'operation', content };
    const operationId = crypto.randomUUID();
    const leaseInput = { workspace_id: plugin, target: relative, principal_id: principal.id, operation_id: operationId };
    const lease = await leases.acquire(leaseInput, 30000);
    let result;
    try {
      const operation = { ...envelope, workspace_id: plugin, path: relative, operation_id: operationId,
        lease_id: lease.lease_id, idempotency_key: idempotencyKey };
      const preflight = await kernel.execute({ ...operation, dry_run: true }, { principal, requireLease: true });
      if (!preflight.success) throw new Error(`SSSS preflight rejected: ${preflight.error?.code}: ${preflight.error?.message}`);
      result = await kernel.execute(operation, { principal, requireLease: true });
      if (!result.success) throw new Error(`SSSS mutation rejected: ${result.error?.code}: ${result.error?.message}`);
    } finally { await leases.release({ ...leaseInput, lease_id: lease.lease_id }); }
    return { ...readCurrent(root, relative, plugin), receipt: result };
  } finally { fs.rmdirSync(lock); }
}

function nativeWrite(request) {
  const child = spawnSync(process.execPath, [worker, '--native-state-worker'], {
    input: JSON.stringify(request), encoding: 'utf8', timeout: 30000, maxBuffer: 16 * 1024 * 1024,
    // No provider credentials or ambient brain selection cross this transport.
    env: { PATH: process.env.PATH || '', NODE_NO_WARNINGS: '1' },
  });
  if (child.error || child.status !== 0) throw new Error(child.stderr?.trim() || child.error?.message || 'Native SSSS worker failed');
  return JSON.parse(child.stdout);
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
    const current = readCurrent(this.location.root, this.location.relative, this.plugin);
    this.version = current?.version ?? null;
    return current ? structuredClone(current.value) : structuredClone(fallback);
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
}

if (process.argv[1] === worker && process.argv[2] === '--native-state-worker') {
  let input = '';
  for await (const chunk of process.stdin) { input += chunk; if (input.length > 16 * 1024 * 1024) throw new Error('Plugin state input exceeds limit'); }
  try { process.stdout.write(JSON.stringify(await executePluginState(JSON.parse(input)))); }
  catch (error) { process.stderr.write(error.message); process.exitCode = 1; }
}
