/** Trusted memory-owner adapter. No CLI, configuration, auth or plugin imports. */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import matter from './frontmatter.mjs';
import { processOperationAsync } from './operation-validator.mjs';
import { buildLocalSearchIndex } from './fast-recall.mjs';

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

/** Create-only SSSS fact; rebuilding the local projection never runs generators. */
export async function createConfinedFact(brain, params, caller = 'local-operator') {
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
    const written = await processOperationAsync({ type: 'operation', idempotency_key: crypto.randomUUID(),
      path: relative, workspace_id: 'confined-memory', content: matter.stringify(params.content, data),
      actor: { role: 'confined-memory' } }, vault, { agentRole: 'confined-memory', principal });
    if (!written.success) throw new Error('Canonical write failed');
    result.committed = true;
    result.operation_id = written.operation_id;
    buildLocalSearchIndex(readMemoryNodes(vault), { vaultDir: vault, derivedDir: derived });
    result.indexed = true;
    return result;
  } catch (cause) {
    // Kernel rolls back failed canonical event commits. A later host-audit or
    // index error may leave the fact committed; never advertise safe blind retry.
    result.committed = fs.existsSync(path.join(vault, relative));
    const err = new Error(result.committed ? 'Fact committed; local indexing incomplete' : 'Fact creation failed', { cause });
    err.result = result;
    throw err;
  }
}
