/** Trusted memory-owner adapter. No CLI, configuration, auth or plugin imports. */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import matter from './frontmatter.mjs';
import { processOperationAsync } from './operation-validator.mjs';
import { buildLocalSearchIndex } from './fast-recall.mjs';
import { VFS_INTENT_DIR } from '@ssss/cli/vfs';

export function validateConfinedFact(params) {
  if (!params || typeof params !== 'object' || Array.isArray(params)) throw new Error('Invalid fact');
  const allowed = new Set(['category', 'title', 'content', 'tags', 'target', 'timeoutMs']);
  if (Object.keys(params).some(k => !allowed.has(k))) throw new Error('Unknown fact field');
  if (params.category !== undefined && params.category !== 'fact') throw new Error('Only facts are supported');
  if (params.target !== undefined && params.target !== 'server') throw new Error('Invalid target');
  if (typeof params.content !== 'string' || !params.content.trim() || Buffer.byteLength(params.content) > 12000) throw new Error('Invalid content');
  if (params.title !== undefined && (typeof params.title !== 'string' || !params.title.trim() || params.title.length > 200)) throw new Error('Invalid title');
  if (params.tags !== undefined && (!Array.isArray(params.tags) || params.tags.length > 16 ||
    params.tags.some(t => typeof t !== 'string' || !/^[a-z0-9][a-z0-9-]{0,63}$/.test(t) || ['universal', 'absolute'].includes(t)))) throw new Error('Invalid tags');
  if (params.timeoutMs !== undefined && (typeof params.timeoutMs !== 'number' || !Number.isFinite(params.timeoutMs) || params.timeoutMs <= 0)) throw new Error('Invalid timeout');
}

/** Resolve an operator-selected brain once; reject links below that boundary. */
function checkTree(dir) {
  if (!fs.existsSync(dir)) {
    // existsSync follows links, so dangling links must still be refused.
    try { if (fs.lstatSync(dir).isSymbolicLink()) throw new Error('Unsafe path'); }
    catch (err) { if (err.code !== 'ENOENT') throw err; }
    return;
  }
  const stat = fs.lstatSync(dir);
  if (stat.isSymbolicLink() || !stat.isDirectory() && !stat.isFile()) throw new Error('Unsafe path');
  if (stat.isDirectory()) for (const name of fs.readdirSync(dir)) checkTree(path.join(dir, name));
}

function readMemoryNodes(vault) {
  const nodes = [];
  function walk(dir) {
    if (!fs.existsSync(dir)) return;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.name.startsWith('.') || entry.name === 'proposals') continue;
      const file = path.join(dir, entry.name);
      if (entry.isSymbolicLink()) throw new Error('Unsafe vault path');
      if (entry.isDirectory()) walk(file);
      else if (entry.isFile() && entry.name.endsWith('.md')) {
        const { data, content } = matter(fs.readFileSync(file, 'utf8'));
        if (data.type === 'memory') nodes.push({ ...data, body: content, _filePath: file });
      }
    }
  }
  walk(vault);
  return nodes;
}

// Establish durable directory entries before the kernel's first transaction.
// SSSS flushes its files and their immediate directories; it may create those
// directories without flushing their parents. This prepares only fixed storage
// containers. All canonical document/event bytes still belong to the kernel.
function prepareFactStorage(vault) {
  for (const dir of [vault, path.join(vault, 'facts'), path.join(vault, '.events'), path.join(vault, VFS_INTENT_DIR)]) {
    fs.mkdirSync(dir, { recursive: true });
    for (const target of [dir, path.dirname(dir)]) {
      const fd = fs.openSync(target, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW);
      try { fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
    }
  }
}

/** Fixed create-only SSSS transaction. Run only in the trusted host broker. */
export async function commitConfinedFact(brain, params, caller = 'local-operator') {
  validateConfinedFact(params);
  if (typeof caller !== 'string' || !caller || caller.length > 200) throw new Error('Invalid caller');
  const base = fs.realpathSync(brain);
  const vault = path.join(base, 'memory-vault'), derived = path.join(base, 'memory-derived');
  checkTree(vault); checkTree(derived);
  const slug = `fact-${crypto.randomUUID()}`, relative = `facts/${slug}.md`;
  const title = params.title || params.content.trim().split('\n')[0].slice(0, 160);
  const now = new Date().toISOString();
  const data = { type: 'memory', slug, category: 'facts', title, description: title, timestamp: now,
    schema_version: 2, status: 'active', confidence: 1, importance: 3, modality: 'descriptive',
    created: now, updated: now, last_accessed: now, subject: 'agent', predicate: 'remembers_fact', object: slug,
    sentiment_polarity: 'descriptive', sentiment_target: 'memory', tags: [...new Set(['invoke', ...(params.tags || [])])],
    source: { type: 'confined-memory', session_id: 'confined-memory', agent: caller, evidence_count: 1 },
    x_temporal_context: now };
  // No overwrite grant and no caller-selected path, metadata, role or source.
  const principal = { id: caller, kind: 'agent', workspaceIds: ['confined-memory'],
    capabilities: ['memory:create', 'ssss:memory:create'],
    authentication: { provider: 'total-recall-confined-memory', assurance: 'verified' } };
  const result = { category: 'fact', path: `memory-vault/${relative}`, slug, committed: false, indexed: false };
  try {
    prepareFactStorage(vault);
    result.committed = 'unknown';
    const written = await processOperationAsync({ type: 'operation', idempotency_key: crypto.randomUUID(),
      path: relative, workspace_id: 'confined-memory', content: matter.stringify(params.content, data),
      actor: { role: 'confined-memory' } }, vault, { agentRole: 'confined-memory', principal });
    // Fresh random IDs cannot legitimately replay. SSSS 0.14.5 can return a
    // replay after event fsync failure and rollback; that is not durability
    // evidence. Fail closed until the owner fixes that failure response.
    if (!written.success || written.replay || written.unchanged || !fs.existsSync(path.join(vault, relative))) {
      throw new Error('Canonical durability unconfirmed');
    }
    result.committed = true;
    result.operation_id = written.operation_id;
    return result;
  } catch (cause) {
    // Existence (or absence after rollback) cannot establish a durable event
    // commit point after an I/O error. Never advertise a safe blind retry.
    const err = new Error('Fact creation did not complete', { cause });
    err.result = result;
    throw err;
  }
}

/** Disposable projection only; usable with no canonical filesystem write grant. */
export function indexConfinedFacts(brain) {
  const base = fs.realpathSync(brain);
  const vault = path.join(base, 'memory-vault'), derived = path.join(base, 'memory-derived');
  checkTree(vault); checkTree(derived);
  buildLocalSearchIndex(readMemoryNodes(vault), { vaultDir: vault, derivedDir: derived });
  return { indexed: true };
}

/** Local CLI parity: same fixed transaction and generator-free projection. */
export async function createConfinedFact(brain, params, caller = 'local-operator') {
  const result = await commitConfinedFact(brain, params, caller);
  try {
    indexConfinedFacts(brain);
    return { ...result, indexed: true };
  } catch (cause) {
    const err = new Error('Fact committed; local indexing incomplete', { cause });
    err.result = result;
    throw err;
  }
}
